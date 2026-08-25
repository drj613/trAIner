import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
import { userExerciseRepo } from "./userExerciseRepo";
import { bodyweightRepo } from "./bodyweightRepo";
import { promptPresetRepo } from "./promptPresetRepo";
import {
  classifyAliases,
  createMigrationContext,
  migrateLog,
  migrateProgram,
} from "./migrations/v10Identity";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { normalizationOverrideRepo } from "./normalizationOverrideRepo";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import type { BackupDocumentV1 } from "@/lib/programs/types";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";
import {
  openCurrentDatabase,
  readCanonicalIdForName,
  readCanonicalReferences,
  readLogCanonicalIdForName,
  readRawRecord,
  readRawStore,
  seedLegacyLogs,
  seedVersion9Database,
  seedVersion9Records,
  snapshotNormalizedStores,
  v9Fixture,
} from "./appDb.testFixtures";

jest.mock("@/lib/catalog/exercises", () => {
  const actual = jest.requireActual("@/lib/catalog/exercises") as typeof import("@/lib/catalog/exercises");
  return {
    ...actual,
    exerciseCatalog: [
      ...actual.exerciseCatalog.map((item) => item.id === "romanian-deadlift"
        ? { ...item, aliases: [...item.aliases, "RDL"] }
        : item),
      {
        // Named with an alternative marker, which is why the compiler has a
        // reject-alternative rule at all: pre-curation entries looked like this.
        id: "alternative-shaped-id",
        name: "Squat or Hinge",
        aliases: [],
        equipment: ["barbell"],
        movementPatterns: ["squat"],
        muscles: { primary: ["quads"], secondary: [] },
        tags: ["strength"],
        movementId: "squat",
        movementModifierIds: ["barbell"],
      },
      {
        id: "surviving-squat-id",
        name: "Surviving Squat",
        aliases: [],
        equipment: ["barbell"],
        movementPatterns: ["squat"],
        muscles: { primary: ["quads"], secondary: ["glutes"] },
        tags: ["strength"],
        movementId: "squat",
        movementModifierIds: ["barbell"],
      },
    ],
  };
});

jest.mock("@/lib/catalog/registries", () => {
  const actual = jest.requireActual("@/lib/catalog/registries") as typeof import("@/lib/catalog/registries");
  const underspecifiedBackSquat = {
    id: "back-squat-choice",
    kind: "underspecified-name" as const,
    normalizedName: "back squat",
    movementId: "squat",
    candidateExerciseIds: ["barbell-high-bar-squat", "barbell-low-bar-squat"],
    matchedModifierIds: ["barbell", "back-rack"],
  };
  const rejectAlternative = {
    id: "alternative-or",
    kind: "non-identity-phrase" as const,
    normalizedPhrase: "or",
    annotation: "alternative",
    behavior: "reject-alternative" as const,
  };
  return {
    ...actual,
    disambiguationRules: [...actual.disambiguationRules, underspecifiedBackSquat, rejectAlternative],
    disambiguationsByNormalizedName: new Map([
      ...actual.disambiguationsByNormalizedName,
      ["back squat", underspecifiedBackSquat],
      ["or", rejectAlternative],
    ]),
    legacyExerciseIdRedirects: new Map([
      ...actual.legacyExerciseIdRedirects,
      ["removed-squat-id", "surviving-squat-id"],
      ["legacy-90-90-id", "90-90-hamstring"],
    ]),
  };
});

describe("IndexedDB repositories", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("round-trips program data without server APIs", async () => {
    await programRepo.save(demoProgram);

    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(programRepo.get(demoProgram.id)).resolves.toMatchObject({ title: demoProgram.title });
    await expect(programRepo.listActive()).resolves.toHaveLength(1);
  });

  it("exports and restores profile, programs, logs, aliases, and userExercises", async () => {
    await profileRepo.save(defaultProfile);
    await programRepo.save(demoProgram);
    await aliasRepo.save({
      alias: "Strict Pullup",
      canonicalExerciseId: "pull-up",
      provenance: "remembered",
    });
    await logRepo.save({
      id: "log-1",
      programId: demoProgram.id,
      dayId: demoProgram.days[0].id,
      performedAt: new Date().toISOString(),
      entries: []
    });
    const savedExercise = await userExerciseRepo.save("Banded Pull-Apart");

    const backup = await exportBackup();
    expect(backup.programs).toHaveLength(1);
    expect(backup.aliases).toHaveLength(1);
    expect(backup.logs).toHaveLength(1);
    expect(backup.userExercises).toHaveLength(1);
    expect(backup.userExercises?.[0].id).toBe(savedExercise.id);

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(backup);

    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(logRepo.list()).resolves.toHaveLength(1);
    await expect(aliasRepo.list()).resolves.toHaveLength(1);
    const restoredExercises = await userExerciseRepo.list();
    expect(restoredExercises).toHaveLength(1);
    expect(restoredExercises[0].id).toBe(savedExercise.id);
    expect(restoredExercises[0].name).toBe("Banded Pull-Apart");
  });

  it("restores a backup with no userExercises field (backward compatibility)", async () => {
    await programRepo.save(demoProgram);
    const backup = await exportBackup();
    // Simulate an old backup that lacks the userExercises field
    const oldBackup = { ...backup, userExercises: undefined };

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(oldBackup);

    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(userExerciseRepo.list()).resolves.toHaveLength(0);
  });

  it("exports and restores prompt presets", async () => {
    await programRepo.save(demoProgram);
    await promptPresetRepo.save({
      id: "preset-1",
      name: "Push focus",
      personaIds: ["rp", "pl"],
      editedBlocks: { rp: "custom rp block" },
      fieldOn: { goals: true, equipment: false },
      schemaOn: true,
      createdAt: "",
      updatedAt: "",
    });

    const backup = await exportBackup();
    expect(backup.promptPresets).toHaveLength(1);
    expect(backup.promptPresets?.[0].name).toBe("Push focus");

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(backup);

    const restored = await promptPresetRepo.list();
    expect(restored).toHaveLength(1);
    expect(restored[0].editedBlocks.rp).toBe("custom rp block");
  });

  it("restores a backup with no promptPresets field (backward compatibility)", async () => {
    await programRepo.save(demoProgram);
    const backup = await exportBackup();
    const oldBackup = { ...backup, promptPresets: undefined };

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(oldBackup);

    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(promptPresetRepo.list()).resolves.toHaveLength(0);
  });
});

describe("logRepo.getForDay", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("returns undefined when no log exists for a day", async () => {
    const result = await logRepo.getForDay("prog-x", "day-x", "2099-01-01");
    expect(result).toBeUndefined();
  });

  it("returns the log matching programId + dayId + date prefix", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const log: WorkoutLogDocument = {
      id: "log-match",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: `${today}T10:00:00.000Z`,
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", today);
    expect(result?.id).toBe("log-match");
  });

  it("does not return a log from a different date", async () => {
    const log: WorkoutLogDocument = {
      id: "log-old",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: "2020-01-01T10:00:00.000Z",
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", "2099-12-31");
    expect(result).toBeUndefined();
  });

  it("does not return a log from a different program", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const log: WorkoutLogDocument = {
      id: "log-other-prog",
      programId: "prog-other",
      dayId: "day-1",
      performedAt: `${today}T10:00:00.000Z`,
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", today);
    expect(result).toBeUndefined();
  });
});

describe("DB v4 — bodyweight store", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("v4 upgrade creates the bodyweight store without dropping existing data", async () => {
    const db = await getDb();
    expect(db.objectStoreNames.contains("bodyweight")).toBe(true);
  });

  it("round-trips bodyweight entries through export → restore", async () => {
    await bodyweightRepo.save({
      id: "2026-05-18",
      value: 80,
      unit: "kg",
      recordedAt: "2026-05-18T10:00:00.000Z",
    });
    await programRepo.save(demoProgram);
    const backup = await exportBackup();
    expect(backup.bodyweight).toHaveLength(1);
    expect(backup.bodyweight?.[0].value).toBe(80);

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(backup);

    const restored = await bodyweightRepo.list();
    expect(restored).toHaveLength(1);
    expect(restored[0].value).toBe(80);
  });

  it("restores a backup without a bodyweight field (backwards compatibility)", async () => {
    await programRepo.save(demoProgram);
    const backup = await exportBackup();
    const oldBackup = { ...backup, bodyweight: undefined };

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(oldBackup);

    expect(await bodyweightRepo.list()).toHaveLength(0);
  });
});

describe("DB v5 — completedAt backfill", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("backfills completedAt = performedAt for existing logs on upgrade", async () => {
    // Seed a v4 database with a log that has no completedAt.
    const v4 = await openDB(DB_NAME, 4, {
      upgrade(db) {
        db.createObjectStore("profile", { keyPath: "id" });
        db.createObjectStore("programs", { keyPath: "id" });
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("by-program", "programId");
        logs.createIndex("by-day", "dayId");
        const aliases = db.createObjectStore("aliases", { keyPath: "id" });
        aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
        aliases.createIndex("by-exercise", "canonicalExerciseId");
        db.createObjectStore("backups", { keyPath: "id" });
        db.createObjectStore("metrics", { keyPath: "exerciseId" });
        db.createObjectStore("userExercises", { keyPath: "id" });
        db.createObjectStore("bodyweight", { keyPath: "id" });
      },
    });
    await v4.put("logs", {
      id: "legacy-1",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-05-10T10:00:00.000Z",
      entries: [],
    });
    v4.close();

    // Trigger the v5 upgrade via the real getDb().
    const db = await getDb();
    const log = await db.get("logs", "legacy-1");
    expect(log?.completedAt).toBe("2026-05-10T10:00:00.000Z");
  });

  it("does not overwrite an existing completedAt", async () => {
    const v4 = await openDB(DB_NAME, 4, {
      upgrade(db) {
        db.createObjectStore("profile", { keyPath: "id" });
        db.createObjectStore("programs", { keyPath: "id" });
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("by-program", "programId");
        logs.createIndex("by-day", "dayId");
        const aliases = db.createObjectStore("aliases", { keyPath: "id" });
        aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
        aliases.createIndex("by-exercise", "canonicalExerciseId");
        db.createObjectStore("backups", { keyPath: "id" });
        db.createObjectStore("metrics", { keyPath: "exerciseId" });
        db.createObjectStore("userExercises", { keyPath: "id" });
        db.createObjectStore("bodyweight", { keyPath: "id" });
      },
    });
    await v4.put("logs", {
      id: "already-completed",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-05-10T10:00:00.000Z",
      // Stored under an `as any` shape because v4's type didn't include completedAt.
      completedAt: "2026-05-10T11:00:00.000Z",
      entries: [],
    } as never);
    v4.close();

    const db = await getDb();
    const log = await db.get("logs", "already-completed");
    expect(log?.completedAt).toBe("2026-05-10T11:00:00.000Z");
  });
});

describe("DB v8 — kg rawCell rescue", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  function seedV7() {
    return openDB(DB_NAME, 7, {
      upgrade(db) {
        db.createObjectStore("profile", { keyPath: "id" });
        db.createObjectStore("programs", { keyPath: "id" });
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("by-program", "programId");
        logs.createIndex("by-day", "dayId");
        const aliases = db.createObjectStore("aliases", { keyPath: "id" });
        aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
        aliases.createIndex("by-exercise", "canonicalExerciseId");
        db.createObjectStore("backups", { keyPath: "id" });
        db.createObjectStore("metrics", { keyPath: "exerciseId" });
        db.createObjectStore("userExercises", { keyPath: "id" });
        db.createObjectStore("bodyweight", { keyPath: "id" });
      },
    });
  }

  it("re-parses kg rawCells into weight/unit/reps", async () => {
    const v7 = await seedV7();
    await v7.put("logs", {
      id: "kg-log",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-07-01T10:00:00.000Z",
      performedDate: "2026-07-01",
      completedAt: "2026-07-01T11:00:00.000Z",
      entries: [
        {
          exerciseId: "leg-press",
          sets: [
            { setNumber: 1, rawCell: "10kg x10" },
            { setNumber: 2, rawCell: "12.5kgx8" },
            { setNumber: 3, weight: 65, reps: 10 },
            { setNumber: 4, rawCell: "skip" },
          ],
        },
      ],
    } as never);
    v7.close();

    const db = await getDb();
    const log = await db.get("logs", "kg-log");
    const sets = log!.entries[0].sets;
    expect(sets[0]).toEqual({ setNumber: 1, weight: 10, unit: "kg", reps: 10 });
    expect(sets[1]).toEqual({ setNumber: 2, weight: 12.5, unit: "kg", reps: 8 });
    expect(sets[2]).toEqual({ setNumber: 3, weight: 65, reps: 10 });
    expect(sets[3]).toEqual({ setNumber: 4, rawCell: "skip" });
  });
});

describe("DB v9 — promptPresets store", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });
  afterEach(() => {
    resetDbConnection();
  });

  function seedV8() {
    return openDB(DB_NAME, 8, {
      upgrade(db) {
        db.createObjectStore("profile", { keyPath: "id" });
        db.createObjectStore("programs", { keyPath: "id" });
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("by-program", "programId");
        logs.createIndex("by-day", "dayId");
        const aliases = db.createObjectStore("aliases", { keyPath: "id" });
        aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
        aliases.createIndex("by-exercise", "canonicalExerciseId");
        db.createObjectStore("backups", { keyPath: "id" });
        db.createObjectStore("metrics", { keyPath: "exerciseId" });
        db.createObjectStore("userExercises", { keyPath: "id" });
        db.createObjectStore("bodyweight", { keyPath: "id" });
      },
    });
  }

  it("v9 upgrade creates the promptPresets store without dropping existing data", async () => {
    const v8 = await seedV8();
    await v8.put("programs", { ...demoProgram });
    v8.close();

    const db = await getDb(); // triggers v8 → v9 upgrade
    expect(db.objectStoreNames.contains("promptPresets")).toBe(true);
    await expect(programRepo.list()).resolves.toHaveLength(1);
  });
});

describe("DB v10 — exercise identity normalization", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("rewrites canonical references, preserves routine/log fields, and deletes metrics", async () => {
    const before = await seedVersion9Database(v9Fixture);
    // Read the pre-migration records so the preservation claim can be asserted
    // as full-document equality rather than as whichever fields someone
    // remembered to list. Every other field of the fixture — `progression`,
    // `import.rawJson`, notes, tags — is then covered by construction.
    const v9 = await openDB(DB_NAME, 9);
    const rawProgram = await v9.get("programs", "p1");
    const rawLog = await v9.get("logs", "l1");
    v9.close();
    resetDbConnection();

    await openCurrentDatabase();

    const expectedProgram = structuredClone(rawProgram) as typeof rawProgram;
    const baseExercises = expectedProgram!.days[0].sections[0].groups[0].exercises;
    baseExercises[0].canonicalExerciseId = "surviving-squat-id";
    baseExercises[1].canonicalExerciseId = "barbell-high-bar-squat";
    expectedProgram!.days[1].sections[0].groups[0].exercises[0]
      .canonicalExerciseId = "surviving-squat-id";
    (expectedProgram!.overrides[0].replacement as ProgramDay[])[0]
      .sections[0].groups[0].exercises[0].canonicalExerciseId = "surviving-squat-id";
    expectedProgram!.import!.warnings[0].suggestions![0].exerciseId = "surviving-squat-id";
    expect(await readRawRecord("programs", "p1")).toStrictEqual(expectedProgram);

    const expectedLog = structuredClone(rawLog) as typeof rawLog;
    expectedLog!.entries[0].canonicalExerciseId = "surviving-squat-id";
    expectedLog!.entries[1].canonicalExerciseId = "barbell-high-bar-squat";
    expect(await readRawRecord("logs", "l1")).toStrictEqual(expectedLog);

    const program = (await programRepo.get("p1"))!;
    const base = program.days[0].sections[0].groups[0].exercises[0];
    expect(base).toMatchObject({
      id: before.slotId,
      canonicalExerciseId: "surviving-squat-id",
      sets: 4,
      reps: "6-8",
      load: "RPE 8",
      rest: "3 minutes",
      tempo: "31X0",
      notes: "notes:slot-base",
      countsTowardVolume: true,
    });
    expect(base.tags).toEqual({
      primary: ["quads"],
      secondary: ["glutes"],
      incidental: ["core"],
      modifiers: ["strength"],
    });

    const log = (await logRepo.get("l1"))!;
    expect(log).toMatchObject({
      performedAt: "2026-08-17T23:30:00.000Z",
      performedDate: "2026-08-17",
      completedAt: "2026-08-18T00:45:00.000Z",
      dayNote: "Day note survives",
      notes: "Log notes survive",
    });
    expect(log.entries[0]).toMatchObject({
      exerciseId: before.slotId,
      exerciseName: "Former squat performed",
      canonicalExerciseId: "surviving-squat-id",
      sets: before.sets,
      notes: "Entry notes survive",
    });
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics")).toBe(false);
    expect(await readCanonicalReferences("p1")).toEqual({
      base: "surviving-squat-id",
      weekVariant: "surviving-squat-id",
      overrideReplacement: "surviving-squat-id",
      log: "surviving-squat-id",
      warningSuggestionIds: ["surviving-squat-id", "unknown-catalog-id"],
      unknown: "unknown-catalog-id",
    });
  });

  it("backfills only unique exact concrete name matches in programs and logs", async () => {
    await seedVersion9Database(v9Fixture);
    await openCurrentDatabase();

    await expect(readCanonicalIdForName("High Bar Back Squat"))
      .resolves.toBe("barbell-high-bar-squat");
    await expect(readCanonicalIdForName("Back Squat")).resolves.toBeUndefined();
    await expect(readCanonicalIdForName("Mystery lift")).resolves.toBeUndefined();
    await expect(readLogCanonicalIdForName("High Bar Back Squat"))
      .resolves.toBe("barbell-high-bar-squat");
    await expect(readLogCanonicalIdForName("Back Squat")).resolves.toBeUndefined();
    await expect(readLogCanonicalIdForName("Mystery lift")).resolves.toBeUndefined();
  });

  it("classifies legacy aliases without deleting remembered aliases", async () => {
    await seedVersion9Database(v9Fixture);
    await openCurrentDatabase();

    await expect(aliasRepo.find("RDL")).resolves.toMatchObject({ provenance: "legacy-auto" });
    // Purged: "back squat" is now a reviewed underspecified choice, and
    // "3x8 rpe 7" has no concrete outcome at all.
    await expect(aliasRepo.find("Back Squat")).resolves.toBeUndefined();
    await expect(aliasRepo.find("3x8 @ RPE 7")).resolves.toBeUndefined();
    await expect(aliasRepo.find("My high bar")).resolves.toMatchObject({ provenance: "remembered" });
  });

  it("retains and redirects a digit-bearing legacy alias with one unique concrete outcome", async () => {
    // Spec: "It retains and redirects only legacy aliases whose token still
    // has one unique concrete outcome." 70 of the 3,175 shipped catalogue
    // names contain a digit or degree sign ("90/90 Hamstring", "45° Side
    // Bend", ...), so a digit must never be treated as noise on its own.
    await seedVersion9Database(v9Fixture);
    await openCurrentDatabase();

    await expect(aliasRepo.find("90/90 Hamstring")).resolves.toMatchObject({
      provenance: "legacy-auto",
      canonicalExerciseId: "90-90-hamstring",
    });
  });

  // `by-normalized-alias` is `{ unique: true }` and the migration recomputes
  // every token before re-putting. Two rows whose *stored* tokens differed —
  // so v9's index accepted both — can recompute to the same token, and the
  // re-put is then REJECTED by the index rather than throwing during a read.
  // Nothing in the read-guard scheme covers that, and the retry is
  // deterministic: the same rows recompute the same collision on every load,
  // with no UI to see or fix the offending alias.
  const collidingAliases = [
    {
      id: "alias-stored-slash",
      alias: "90/90 Hamstring",
      normalizedAlias: "90/90 hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: "2026-08-18T12:34:56.000Z",
    },
    {
      id: "alias-stored-spaces",
      alias: "90 90 Hamstring",
      normalizedAlias: "90 90 hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: "2026-08-18T12:34:56.000Z",
    },
  ];

  it("keeps one alias when two legacy tokens recompute to the same normalized alias", async () => {
    await seedVersion9Records({ aliases: collidingAliases });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    const db = await getDb();
    expect(db.version).toBe(10);
    expect((db.objectStoreNames as unknown as DOMStringList).contains("metrics")).toBe(false);
    expect(await readRawStore("aliases")).toEqual([{
      ...collidingAliases[0],
      normalizedAlias: "90 90 hamstring",
      provenance: "legacy-auto",
    }]);
  });

  // Both orderings, because `getAll` returns rows in key order and a
  // first-writer-wins implementation would pass one of them by accident.
  it.each([
    { name: "legacy row first", legacyId: "alias-a", rememberedId: "alias-b" },
    { name: "remembered row first", legacyId: "alias-b", rememberedId: "alias-a" },
  ])("lets a remembered alias win a colliding token ($name)", async ({ legacyId, rememberedId }) => {
    // A user's own correction outranks a legacy guess. Losing the legacy
    // duplicate costs a re-teach at worst; losing the remembered one discards
    // explicit user intent.
    await seedVersion9Records({
      aliases: [
        { ...collidingAliases[0], id: legacyId },
        {
          id: rememberedId,
          alias: "90 90 hamstring",
          normalizedAlias: "90 90 hamstring ",
          canonicalExerciseId: "barbell-high-bar-squat",
          createdAt: "2026-08-18T12:34:56.000Z",
          provenance: "remembered" as const,
        },
      ],
    });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawStore("aliases")).toEqual([{
      id: rememberedId,
      alias: "90 90 hamstring",
      normalizedAlias: "90 90 hamstring",
      canonicalExerciseId: "barbell-high-bar-squat",
      createdAt: "2026-08-18T12:34:56.000Z",
      provenance: "remembered",
    }]);
  });

  it.each([
    {
      name: "an alias text that expresses a choice, even when it matches an entry",
      alias: { id: "a1", alias: "Squat or Hinge", normalizedAlias: "squat or hinge", canonicalExerciseId: "alternative-shaped-id", createdAt: "2026-08-18T12:34:56.000Z" },
    },
    {
      name: "an alias whose token no longer resolves to its stored target",
      alias: { id: "a2", alias: "90/90 Hamstring", normalizedAlias: "90 90 hamstring", canonicalExerciseId: "pull-up", createdAt: "2026-08-18T12:34:56.000Z" },
    },
  ])("purges $name", async ({ alias }) => {
    // The second case is the load-bearing one: without it the migration would
    // silently keep an alias pointing at an exercise its own token resolves
    // somewhere else entirely, which is precisely the mis-resolution the new
    // disambiguation flow exists to end.
    await seedVersion9Records({ aliases: [alias] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawStore("aliases")).toEqual([]);
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  it("dispatches one identity event after the v10 migration commits", async () => {
    // A listener's own read proves nothing about ordering: it is serialised
    // behind the versionchange transaction either way. Observe the transaction
    // lifecycle directly, as the aliasRepo test does — but the migration's
    // transaction comes from the open *request*, not from
    // IDBDatabase.transaction, so the hook goes on the factory. The `complete`
    // listener is attached during upgradeneeded, so it always runs before
    // anything that waits on the open request settling.
    await seedVersion9Database(v9Fixture);
    const factory = indexedDB as IDBFactory;
    const nativeOpen = factory.open;
    let upgradeCommitted = false;
    let committedAtDispatch: boolean | undefined;
    (factory as { open: IDBFactory["open"] }).open = function patchedOpen(
      ...args: Parameters<IDBFactory["open"]>
    ) {
      const request = nativeOpen.apply(factory, args);
      request.addEventListener("upgradeneeded", () => {
        request.transaction?.addEventListener("complete", () => {
          upgradeCommitted = true;
        });
      });
      return request;
    };
    const listener = jest.fn(() => {
      committedAtDispatch = upgradeCommitted;
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await openCurrentDatabase();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(committedAtDispatch).toBe(true);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
      (factory as { open: IDBFactory["open"] }).open = nativeOpen;
    }
  });

  // This proves a second *open* rewrites nothing. It cannot prove the
  // migration is idempotent — the stored version is already 10, so the
  // `oldVersion < 10` branch never re-enters. The fixed-point tests in
  // "v10 migration idempotency (pure helpers)" carry that claim.
  it("leaves the stores untouched when the database is reopened", async () => {
    await seedVersion9Database(v9Fixture);
    await openCurrentDatabase();
    const once = await snapshotNormalizedStores();

    resetDbConnection();
    await openCurrentDatabase();

    expect(await snapshotNormalizedStores()).toBe(once);
  });

  it("creates a fresh v10 database without a metrics store and without an identity event", async () => {
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      // No seeded database: oldVersion is 0, so there is nothing to
      // normalize and no legacy metrics store to delete. The upgrade must
      // neither throw on the absent store nor announce an identity change
      // no consumer could act on.
      await expect(openCurrentDatabase()).resolves.toBeUndefined();
      const db = await getDb();
      expect((db.objectStoreNames as unknown as DOMStringList).contains("metrics")).toBe(false);
      expect(db.objectStoreNames.contains("normalizationOverrides")).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});

describe("DB v10 — malformed legacy documents", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  const NOW = "2026-08-18T12:34:56.000Z";
  const exercise = (id: string, canonicalExerciseId?: string) => ({
    id,
    name: "Former squat",
    ...(canonicalExerciseId ? { canonicalExerciseId } : {}),
    sets: 3,
  });
  const goodDay = (id: string) => ({
    id,
    dayNumber: 1,
    weekNumber: 1,
    title: "Day",
    sections: [{
      id: `section-${id}`,
      type: "strength",
      name: "Main",
      groups: [{ id: `group-${id}`, type: "single", exercises: [exercise("slot-1", "removed-squat-id")] }],
    }],
  });
  const migratedDay = (id: string) => {
    const day = goodDay(id) as unknown as Record<string, never>;
    return JSON.parse(
      JSON.stringify(day).replace("removed-squat-id", "surviving-squat-id"),
    ) as unknown;
  };
  const program = (id: string, extra: Record<string, unknown>) => ({
    id,
    title: "Malformed",
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  });

  // Every case below is a real shape this codebase already knows about: the
  // v7/v8 upgrade blocks in appDb.ts read `(log.entries ?? [])`, and
  // backup.ts validates null override replacements. An unguarded `.map` in
  // the v10 traversal throws on any of them; the block's catch then aborts,
  // so the upgrade rolls back and the database never reaches version 10.
  // Each case therefore asserts a completion canary — the `metrics` store is
  // deleted by the block's last statement, so its absence proves the whole
  // migration ran rather than bailing midway.
  // `expected` is the post-migration record: absent means byte-identical,
  // present means the readable part of the document was normalized while the
  // malformed part was left exactly as stored.
  const programCases: Array<{ name: string; seeded: unknown; expected?: unknown }> = [
    {
      name: "program with no days array",
      seeded: program("p-no-days", { overrides: [] }),
    },
    {
      name: "program with no overrides array",
      seeded: program("p-no-overrides", { days: [goodDay("d1")] }),
      expected: program("p-no-overrides", { days: [migratedDay("d1")] }),
    },
    {
      name: "override with a null replacement",
      seeded: program("p-null-replacement", {
        days: [goodDay("d1")],
        overrides: [{ id: "o1", programId: "p-null-replacement", scope: "week", weekNumber: 2, replacement: null, createdAt: NOW }],
      }),
      expected: program("p-null-replacement", {
        days: [migratedDay("d1")],
        overrides: [{ id: "o1", programId: "p-null-replacement", scope: "week", weekNumber: 2, replacement: null, createdAt: NOW }],
      }),
    },
    {
      name: "override replacement array containing null",
      seeded: program("p-null-replacement-element", {
        days: [],
        overrides: [{ id: "o1", programId: "p-null-replacement-element", scope: "week", weekNumber: 2, replacement: [null], createdAt: NOW }],
      }),
    },
    {
      name: "day with no sections array",
      seeded: program("p-no-sections", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day" }], overrides: [] }),
    },
    {
      name: "section with no groups array",
      seeded: program("p-no-groups", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main" }] }],
        overrides: [],
      }),
    },
    {
      name: "group with no exercises array",
      seeded: program("p-no-exercises", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single" }] }] }],
        overrides: [],
      }),
    },
    {
      name: "group holding a null exercise",
      seeded: program("p-null-exercise", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [null] }] }] }],
        overrides: [],
      }),
    },
    {
      name: "import warnings without a suggestions array",
      seeded: program("p-no-suggestions", {
        days: [],
        overrides: [],
        import: { rawJson: {}, warnings: [{ path: "days.0", rawName: "x", message: "m" }] },
      }),
    },
    {
      name: "import metadata without a warnings array",
      seeded: program("p-no-warnings", { days: [], overrides: [], import: { rawJson: {} } }),
    },
  ];

  it.each(programCases)("program: $name — readable parts migrated, malformed part left alone", async ({ seeded, expected }) => {
    await seedVersion9Records({ programs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    const id = (seeded as { id: string }).id;
    expect(await readRawRecord("programs", id)).toEqual(expected ?? seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  const logCases: Array<{ name: string; seeded: unknown }> = [
    {
      name: "v7-surviving log with no entries array",
      seeded: {
        id: "l-no-entries",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        performedDate: "2026-08-17",
        completedAt: "2026-08-18T00:45:00.000Z",
        dayNote: "Kept",
      },
    },
    {
      name: "log holding a null entry",
      seeded: {
        id: "l-null-entry",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        entries: [null],
      },
    },
    {
      name: "log entry with no canonical id and no name",
      seeded: {
        id: "l-nameless",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        entries: [{ exerciseId: "slot-1", sets: [] }],
      },
    },
  ];

  it.each(logCases)("log: $name — readable parts migrated, malformed part left alone", async ({ seeded }) => {
    await seedVersion9Records({ logs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    const id = (seeded as { id: string }).id;
    expect(await readRawRecord("logs", id)).toEqual(seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  // Leaf *string* fields, not just container shapes. Each of
  // these reaches normalizeExerciseName / prepareImportName and throws on a
  // non-string, which the v10 block's catch turns into a rolled-back upgrade
  // that never reaches version 10. restoreBackup only checks aliases with
  // hasIds (backup.ts) and deliberately defers deep validation, so a
  // truncated or hand-edited backup can plant any of them on a pre-v10
  // client. The `metrics` canary below is what distinguishes "migrated and
  // deliberately left alone" from "bailed out before touching it".
  const untouchedProgramCases: Array<{ name: string; seeded: unknown }> = [
    {
      name: "suggestion with no exerciseId",
      seeded: program("p-suggestion-no-id", {
        days: [],
        overrides: [],
        import: {
          rawJson: {},
          warnings: [{ path: "days.0", rawName: "x", message: "m", suggestions: [{ name: "S", score: 0.9 }] }],
        },
      }),
    },
    {
      name: "suggestion with a non-string exerciseId",
      seeded: program("p-suggestion-number-id", {
        days: [],
        overrides: [],
        import: {
          rawJson: {},
          warnings: [{ path: "days.0", rawName: "x", message: "m", suggestions: [{ exerciseId: 42, name: "S", score: 0.9 }] }],
        },
      }),
    },
    {
      name: "exercise with a non-string name",
      seeded: program("p-number-name", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [{ id: "slot-1", name: 42, sets: 3 }] }] }] }],
        overrides: [],
      }),
    },
    {
      name: "exercise with a non-string canonicalExerciseId",
      seeded: program("p-number-canonical", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [{ id: "slot-1", name: "Squat", canonicalExerciseId: 42, sets: 3 }] }] }] }],
        overrides: [],
      }),
    },
    {
      name: "import metadata that is not an object",
      seeded: program("p-string-import", { days: [], overrides: [], import: "truncated" }),
    },
    // Records, not just leaf strings: a container that is not an object at all
    // must be passed over, and an *array* is the dangerous case — `{ ...[1, 2] }`
    // is `{ 0: 1, 1: 2 }`, so treating one as a record silently rewrites it.
    {
      name: "a section that is not a record",
      seeded: program("p-string-section", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: ["corrupt"] }], overrides: [] }),
    },
    {
      name: "a group that is not a record",
      seeded: program("p-number-group", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [42] }] }], overrides: [] }),
    },
    {
      name: "an override that is not a record",
      seeded: program("p-string-override", { days: [], overrides: ["corrupt"] }),
    },
    {
      name: "a warning that is not a record",
      seeded: program("p-string-warning", { days: [], overrides: [], import: { rawJson: {}, warnings: ["corrupt"] } }),
    },
    {
      name: "a suggestion that is not a record",
      seeded: program("p-string-suggestion", { days: [], overrides: [], import: { rawJson: {}, warnings: [{ path: "days.0", message: "m", suggestions: ["corrupt"] }] } }),
    },
    {
      name: "a day stored as an array",
      seeded: program("p-array-day", { days: [[]], overrides: [] }),
    },
    {
      name: "a section stored as an array",
      seeded: program("p-array-section", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [[]] }], overrides: [] }),
    },
    {
      name: "a group stored as an array",
      seeded: program("p-array-group", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [[]] }] }], overrides: [] }),
    },
    {
      name: "an exercise with a non-string id",
      seeded: program("p-number-slot-id", { days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [{ id: 42, name: "High Bar Back Squat" }] }] }] }], overrides: [] }),
    },
  ];

  it.each(untouchedProgramCases)("program: $name — left exactly as stored", async ({ seeded }) => {
    await seedVersion9Records({ programs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("programs", (seeded as { id: string }).id)).toStrictEqual(seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  const untouchedLogCases: Array<{ name: string; seeded: unknown }> = [
    {
      name: "log entry with a non-string exerciseName",
      seeded: {
        id: "l-number-name",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        entries: [{ exerciseId: "slot-1", exerciseName: 42, sets: [] }],
      },
    },
    {
      name: "log entry with a non-string canonicalExerciseId",
      seeded: {
        id: "l-number-canonical",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        entries: [{ exerciseId: "slot-1", exerciseName: "Squat", canonicalExerciseId: 42, sets: [] }],
      },
    },
    {
      name: "an entry with a non-string exerciseId",
      seeded: {
        id: "l-number-slot-id",
        programId: "p1",
        dayId: "d1",
        performedAt: "2026-08-17T23:30:00.000Z",
        entries: [{ exerciseId: 42, exerciseName: "High Bar Back Squat", sets: [] }],
      },
    },
  ];

  it.each(untouchedLogCases)("log: $name — left exactly as stored", async ({ seeded }) => {
    await seedVersion9Records({ logs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", (seeded as { id: string }).id)).toStrictEqual(seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  // "Unusable", not "unreadable": the line is whether anything is left to match
  // on, which is narrower than whether every field reads cleanly. A token or a
  // display text is enough (find() queries the by-normalized-alias index and the
  // resolver reads `normalizedAlias || alias`); a target is mandatory.
  const unusableAliases = [
    { name: "no canonicalExerciseId", alias: { id: "a-no-target", alias: "RDL", normalizedAlias: "rdl", createdAt: NOW } },
    { name: "a non-string canonicalExerciseId", alias: { id: "a-number-target", alias: "RDL", normalizedAlias: "rdl", canonicalExerciseId: 42, createdAt: NOW } },
    { name: "neither alias text nor token", alias: { id: "a-no-text", canonicalExerciseId: "romanian-deadlift", createdAt: NOW } },
    { name: "a non-string alias text and a non-string token", alias: { id: "a-number-text", alias: 42, normalizedAlias: 42, canonicalExerciseId: "romanian-deadlift", createdAt: NOW } },
    { name: "an alias text and token that both normalize to nothing", alias: { id: "a-empty", alias: "!!!", normalizedAlias: "  ", canonicalExerciseId: "romanian-deadlift", createdAt: NOW } },
  ];

  it.each(unusableAliases)("drops a legacy alias with $name", async ({ alias }) => {
    const healthy = {
      id: "a-healthy",
      alias: "90/90 Hamstring",
      normalizedAlias: "90 90 hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: NOW,
    };
    await seedVersion9Records({ aliases: [alias, healthy] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    // Dropped, not retained: an alias with nothing to match on and nothing to
    // redirect to can never be found, displayed, or followed again, and leaving
    // it in the store lets it keep short-circuiting the new disambiguation flow.
    expect(await readRawStore("aliases")).toEqual([
      { ...healthy, provenance: "legacy-auto" },
    ]);
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  it("re-classifies a pre-v10 alias that carries a hand-planted provenance", async () => {
    // The database's own rows predate the field too, so a provenance found in
    // one was hand-planted — the pre-Task-7 restore wrote alias rows verbatim
    // behind a string-id check. It is not evidence that anything classified it,
    // so the migration must not treat it as such.
    await seedVersion9Records({
      aliases: [{
        id: "a-smuggled",
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "barbell-back-squat",
        provenance: "legacy-auto",
        createdAt: NOW,
      }],
    });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawStore("aliases")).toEqual([]);
  });

  it("retains a legacy alias whose display text is unreadable but whose token is not", async () => {
    // The other side of that line, on a real database with the real unique
    // index. The unreadable `alias` field is passed through exactly as stored —
    // rule 2 — because a display string is not ours to invent; the recomputed
    // token is what the index and the resolver actually use.
    const recoverable = {
      id: "a-recoverable",
      alias: 42,
      normalizedAlias: "90/90 Hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: NOW,
    };
    await seedVersion9Records({ aliases: [recoverable] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawStore("aliases")).toEqual([{
      ...recoverable,
      normalizedAlias: "90 90 hamstring",
      provenance: "legacy-auto",
    }]);
    await expect(aliasRepo.find("90/90 hamstring")).resolves.toMatchObject({
      id: "a-recoverable",
      canonicalExerciseId: "90-90-hamstring",
    });
  });

  it("survives a user exercise with a non-string name and still classifies everything else", async () => {
    // Two distinct paths read a custom exercise's name: the alias
    // classifier's outcome count, and the resolver's unique-custom-name
    // fallback (only reached when the catalogue does not match).
    const healthyAlias = {
      id: "a-healthy",
      alias: "90/90 Hamstring",
      normalizedAlias: "90 90 hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: NOW,
    };
    await seedVersion9Records({
      userExercises: [{ id: "user-broken", name: 42, createdAt: NOW }],
      aliases: [healthyAlias],
      programs: [program("p-user-ex", {
        days: [{ id: "d1", dayNumber: 1, weekNumber: 1, title: "Day", sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [
          { id: "slot-unknown", name: "Mystery lift", sets: 3 },
          { id: "slot-unique", name: "High Bar Back Squat", sets: 3 },
        ] }] }] }],
        overrides: [],
      })],
    });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("userExercises", "user-broken"))
      .toEqual({ id: "user-broken", name: 42, createdAt: NOW });
    expect(await readRawStore("aliases")).toEqual([{ ...healthyAlias, provenance: "legacy-auto" }]);
    const stored = await readRawRecord("programs", "p-user-ex") as {
      days: [{ sections: [{ groups: [{ exercises: { canonicalExerciseId?: string }[] }] }] }];
    };
    const exercises = stored.days[0].sections[0].groups[0].exercises;
    expect(exercises[0].canonicalExerciseId).toBeUndefined();
    expect(exercises[1].canonicalExerciseId).toBe("barbell-high-bar-squat");
  });

  it("still normalizes healthy records stored alongside a malformed one", async () => {
    await seedVersion9Records({
      programs: [
        program("p-broken", { overrides: [] }),
        program("p-healthy", { days: [goodDay("d1")], overrides: [] }),
      ],
    });

    await openCurrentDatabase();

    expect(await readRawRecord("programs", "p-broken")).toEqual(program("p-broken", { overrides: [] }));
    expect(await readRawRecord("programs", "p-healthy"))
      .toEqual(program("p-healthy", { days: [migratedDay("d1")], overrides: [] }));
  });
});

describe("v10 migration idempotency (pure helpers)", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  // Reopening the database cannot re-enter the `oldVersion < 10` branch, so
  // the only honest way to prove idempotency is to run the migration
  // functions over their own output.
  it("is a fixed point: migrating already-migrated records changes nothing", async () => {
    await seedVersion9Database(v9Fixture);
    await openCurrentDatabase();
    const db = await getDb();
    const [programs, logs, aliases, userExercises] = await Promise.all([
      db.getAll("programs"),
      db.getAll("logs"),
      db.getAll("aliases"),
      db.getAll("userExercises"),
    ]);
    const context = createMigrationContext(aliases, userExercises, []);

    for (const program of programs) {
      expect(migrateProgram(program, context)).toEqual(program);
    }
    for (const log of logs) {
      expect(migrateLog(log, context)).toEqual(log);
    }
    expect(classifyAliases(aliases, userExercises, "all")).toEqual(aliases);
  });

  it("is a fixed point from the pre-migration fixture too: f(f(x)) equals f(x)", async () => {
    await seedVersion9Database(v9Fixture);
    const db = await openDB(DB_NAME, 9);
    const [rawPrograms, rawLogs, rawAliases] = await Promise.all([
      db.getAll("programs"),
      db.getAll("logs"),
      db.getAll("aliases"),
    ]);
    db.close();
    resetDbConnection();

    const onceAliases = classifyAliases(rawAliases, [], "all");
    expect(classifyAliases(onceAliases, [], "all")).toEqual(onceAliases);
    const context = createMigrationContext(onceAliases, [], []);
    for (const program of rawPrograms) {
      const once = migrateProgram(program, context);
      expect(migrateProgram(once, context)).toEqual(once);
    }
    for (const log of rawLogs) {
      const once = migrateLog(log, context);
      expect(migrateLog(once, context)).toEqual(once);
    }
  });
});

describe("DB v7/v8 — malformed legacy logs", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  // The v7 phantom-log check and the v8 kg rescue guard `undefined` but not a
  // non-array (`log.entries ?? []`) and falsy but not a non-string
  // (`!set.rawCell`). Since the whole upgrade callback now aborts on any
  // throw, one such record would otherwise turn every load into a failed
  // migration — a deterministic wall instead of a net. Each malformed log
  // below carries completedAt (so v7 keeps it) and performedDate (so v7 has
  // nothing to backfill), which makes "unchanged" mean byte-identical.
  const healthyLog = {
    id: "healthy",
    programId: "p1",
    dayId: "d1",
    performedAt: "2026-05-10T10:00:00.000Z",
    completedAt: "2026-05-10T11:00:00.000Z",
    entries: [{ exerciseId: "slot-1", sets: [{ setNumber: 1, rawCell: "10kg x10" }] }],
  };
  const malformedLogs: Array<{ name: string; log: Record<string, unknown> }> = [
    {
      name: "entries that are not an array",
      log: { id: "m1", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", performedDate: "2026-05-10", completedAt: "2026-05-10T11:00:00.000Z", entries: "corrupt" },
    },
    {
      name: "a null entry",
      log: { id: "m2", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", performedDate: "2026-05-10", completedAt: "2026-05-10T11:00:00.000Z", entries: [null] },
    },
    {
      name: "sets that are not an array",
      log: { id: "m3", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", performedDate: "2026-05-10", completedAt: "2026-05-10T11:00:00.000Z", entries: [{ exerciseId: "slot-1", sets: "corrupt" }] },
    },
    {
      name: "a null set",
      log: { id: "m4", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", performedDate: "2026-05-10", completedAt: "2026-05-10T11:00:00.000Z", entries: [{ exerciseId: "slot-1", sets: [null] }] },
    },
    {
      name: "a non-string rawCell",
      log: { id: "m5", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", performedDate: "2026-05-10", completedAt: "2026-05-10T11:00:00.000Z", entries: [{ exerciseId: "slot-1", sets: [{ setNumber: 1, rawCell: 42 }] }] },
    },
  ];

  it.each(malformedLogs)("completes the upgrade past a log with $name", async ({ log }) => {
    await seedLegacyLogs(6, [log, healthyLog]);

    await expect(openCurrentDatabase()).resolves.toBeUndefined();

    // The malformed record is passed through untouched...
    expect(await readRawRecord("logs", log["id"] as string)).toStrictEqual(log);
    // ...the healthy one alongside it still gets both the v7 performedDate
    // backfill and the v8 kg rescue...
    expect(await readRawRecord("logs", "healthy")).toEqual({
      ...healthyLog,
      performedDate: "2026-05-10",
      entries: [{ exerciseId: "slot-1", sets: [{ setNumber: 1, weight: 10, unit: "kg", reps: 10 }] }],
    });
    // ...and the migration ran all the way to the v10 block's last statement.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  it("keeps a log whose entries are unreadable rather than deleting it as a phantom", async () => {
    // No completedAt/skippedAt/notes, so v7's phantom check reaches
    // log.entries. A truthy non-array is unreadable — something is there and
    // we cannot parse it — so the log is kept. (Contrast the next test: a
    // null entry is readable, and demonstrably carries nothing.)
    const unreadable = { id: "unreadable", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", entries: "corrupt" };
    await seedLegacyLogs(6, [unreadable]);

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", "unreadable"))
      .toEqual({ ...unreadable, performedDate: "2026-05-10" });
  });

  it("still deletes a phantom whose entries are null, because null reads as absent", async () => {
    // Pins the line: `undefined`/`null` mean *absent* — the legitimate shape of
    // logs predating `entries`, and exactly what the v7 phantom rule was
    // written to delete. `"corrupt"` (previous test) is *present but
    // unreadable* and is kept. The distinction is absent vs unreadable, not
    // null vs non-null.
    const nullEntries = { id: "null-entries", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", entries: null };
    await seedLegacyLogs(6, [nullEntries, healthyLog]);

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", "null-entries")).toBeUndefined();
    expect(await readRawRecord("logs", "healthy")).toBeDefined();
  });

  it("keeps a log whose only entry is unreadable rather than deleting it as a phantom", async () => {
    // Deliberate ruling, not an oversight: one rule governs both malformed
    // shapes — unreadable content is never grounds for deletion. A null entry
    // is not proven-empty content; it is content we cannot read, and the
    // entry it replaced may well have held sets. Retaining a genuinely empty
    // log leaves a cosmetic phantom the user can delete in seconds; deleting
    // wrongly destroys their only copy of a workout. Those losses are not
    // comparable. The v7 phantom rule still applies in full to logs whose
    // entries are *readable* and empty (see sessionPersistence.test.ts).
    const unreadableEntry = { id: "unreadable-entry", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", entries: [null] };
    await seedLegacyLogs(6, [unreadableEntry, healthyLog]);

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", "unreadable-entry"))
      .toEqual({ ...unreadableEntry, performedDate: "2026-05-10" });
    expect(await readRawRecord("logs", "healthy")).toBeDefined();
  });

  it("keeps a log whose only entry has unreadable sets", async () => {
    // Same rule one level down: `(e.sets?.length ?? 0) > 0` reads a length
    // off whatever is there, so an unreadable non-array `sets` with no length
    // would otherwise look like "no data" and be deleted.
    const unreadableSets = { id: "unreadable-sets", programId: "p1", dayId: "d1", performedAt: "2026-05-10T10:00:00.000Z", entries: [{ exerciseId: "slot-1", sets: { corrupt: true } }] };
    await seedLegacyLogs(6, [unreadableSets, healthyLog]);

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", "unreadable-sets"))
      .toEqual({ ...unreadableSets, performedDate: "2026-05-10" });
  });
});

// The restore path is the other half of the v10 migration story. restoreBackup
// calls getDb(), which runs the upgrade against whatever is in the stores at
// that moment, and only then clears them and writes the file's records — so
// without an explicit pass here the restored records never see the migration at
// all (the version is already 10, so `oldVersion < 10` is false forever).
// Spec: "their aliases pass through the same legacy-auto classification/purge
// rules as the database migration" and "Backup and database migration use the
// same canonical redirect function so their results cannot diverge."
describe("restoreBackup — version-1 compatibility on a current database", () => {
  const NOW = "2026-08-18T00:00:00.000Z";

  const legacyAlias = (alias: string, canonicalExerciseId: string) => ({
    id: `legacy:${alias}`,
    alias,
    normalizedAlias: normalizeExerciseName(alias),
    canonicalExerciseId,
    createdAt: NOW,
  });

  const legacyProgram = (canonicalExerciseId: string) => ({
    id: "p1",
    title: "Restored routine",
    days: [{
      id: "day-1",
      dayNumber: 1,
      title: "Day 1",
      sections: [{
        id: "s1",
        type: "strength" as const,
        name: "Main",
        groups: [{ id: "g1", type: "single" as const, exercises: [
          { id: "slot-1", name: "Former squat", canonicalExerciseId },
          { id: "slot-2", name: "High Bar Back Squat" },
        ] }],
      }],
    }],
    overrides: [],
    createdAt: NOW,
    updatedAt: NOW,
  });

  const legacyLog = (canonicalExerciseId: string) => ({
    id: "l1",
    programId: "p1",
    dayId: "day-1",
    performedAt: NOW,
    entries: [
      { exerciseId: "slot-1", exerciseName: "Former squat", canonicalExerciseId, sets: [] },
      { exerciseId: "slot-2", exerciseName: "High Bar Back Squat", sets: [] },
    ],
  });

  const makeBackupV1 = (overrides: Partial<BackupDocumentV1> = {}) => ({
    version: 1 as const,
    exportedAt: NOW,
    programs: [legacyProgram("removed-squat-id")],
    logs: [legacyLog("removed-squat-id")],
    aliases: [],
    ...overrides,
  } as unknown as BackupDocumentV1);

  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("retains unique legacy aliases and purges ambiguous or noisy ones", async () => {
    await restoreBackup(makeBackupV1({
      aliases: [
        legacyAlias("RDL", "romanian-deadlift"),
        legacyAlias("Back Squat", "barbell-back-squat"),
        legacyAlias("3x8 @ RPE 7", "barbell-back-squat"),
      ] as never,
    }));

    await expect(aliasRepo.find("RDL")).resolves.toMatchObject({ provenance: "legacy-auto" });
    await expect(aliasRepo.find("Back Squat")).resolves.toBeUndefined();
    await expect(aliasRepo.find("3x8 @ RPE 7")).resolves.toBeUndefined();
  });

  // Spec line 373 scopes the purge to version-1 *files*, not to
  // provenance-less rows. A row-level rule alone lets a hand-added provenance
  // smuggle an ambiguous alias past the purge on exactly the file format that is
  // only accepted during the compatibility window — and version 1 predates the
  // field, so any provenance in such a file was added by hand.
  it.each([
    { name: "legacy-auto", provenance: "legacy-auto" },
    { name: "an unrecognized value", provenance: "definitely-not-a-provenance" },
  ])("purges an ambiguous v1 alias carrying a hand-added $name provenance", async ({ provenance }) => {
    await restoreBackup(makeBackupV1({
      aliases: [{
        ...legacyAlias("Back Squat", "barbell-back-squat"),
        provenance,
      }] as never,
    }));

    await expect(aliasRepo.find("Back Squat")).resolves.toBeUndefined();
  });

  // The one provenance a version-1 file may carry meaningfully: the pre-Task-7
  // restore wrote alias rows verbatim, so a v1 file really can hold a
  // "remembered" row, and spec line 560 says to preserve it.
  it("keeps a remembered v1 alias even when its token is now ambiguous", async () => {
    await restoreBackup(makeBackupV1({
      aliases: [{
        ...legacyAlias("Back Squat", "barbell-back-squat"),
        provenance: "remembered",
      }] as never,
    }));

    await expect(aliasRepo.find("Back Squat")).resolves.toMatchObject({
      provenance: "remembered",
    });
  });

  // Was "makes a restored alias findable even when the file's own token was
  // stale". Restore no longer re-derives a readable token — see
  // `aliasLookupToken` — so an unclassified legacy row is judged by the outcome
  // gate on the token the file gave it, and one that names no exercise is
  // purged rather than repaired onto the display text's token. Only a
  // hand-edited version-1 file can hold such a row, and it was already
  // unreachable in the database that exported it.
  it("purges a legacy alias whose stale token names no exercise", async () => {
    await restoreBackup(makeBackupV1({
      aliases: [{ ...legacyAlias("RDL", "romanian-deadlift"), normalizedAlias: "WRONG-TOKEN" }] as never,
    }));

    await expect(aliasRepo.find("RDL")).resolves.toBeUndefined();
    await expect(aliasRepo.list()).resolves.toEqual([]);
  });

  it("rewrites legacy canonical ids in restored programs and logs", async () => {
    await restoreBackup(makeBackupV1());

    const program = (await programRepo.get("p1"))!;
    const exercises = program.days[0].sections[0].groups[0].exercises;
    expect(exercises[0].canonicalExerciseId).toBe("surviving-squat-id");
    // Also backfilled: a name-only slot with one exact concrete match, exactly
    // as the migration would have done had these records been in the store.
    expect(exercises[1].canonicalExerciseId).toBe("barbell-high-bar-squat");

    const log = (await logRepo.get("l1"))!;
    expect(log.entries[0].canonicalExerciseId).toBe("surviving-squat-id");
    expect(log.entries[1].canonicalExerciseId).toBe("barbell-high-bar-squat");
  });

  it("produces the same stores as migrating the same records in place", async () => {
    // The divergence guard: a v1 file restored into a v10 database must land in
    // exactly the state the v9 → v10 upgrade would have produced from the same
    // records. Anything else means backup and migration have drifted apart.
    await seedVersion9Database(v9Fixture);
    const v9 = await openDB(DB_NAME, 9);
    // One extra alias, so the comparison also covers the resolution context the
    // aliases feed: this token is the only thing that can give the fixture's
    // otherwise-unknown "Mystery lift" slot a canonical id, so restoring with an
    // empty alias context leaves that slot unresolved and diverges.
    //
    // It is a *remembered* row because that is the shape this fixture needs: a
    // legacy row classified in this same pass is retained only when its token
    // already has one concrete outcome, in which case the name resolves without
    // it and the alias cannot be what the assertion below measures.
    //
    // That is a statement about rows classified *here*, and only at the moment
    // they are classified — not a general property of legacy-auto rows. A row
    // that arrives already classified (any row in a version-2 file, which the
    // scope rule does not re-classify) can be the sole reason a name resolves,
    // because the resolver consults context aliases before the underspecified
    // check and before catalogue name matching. So can a row whose catalogue has
    // grown since. An earlier version of this comment claimed otherwise.
    await v9.put("aliases", {
      id: "alias-mystery",
      alias: "Mystery lift",
      normalizedAlias: "mystery lift",
      canonicalExerciseId: "romanian-deadlift",
      provenance: "remembered",
      createdAt: "2026-08-18T12:34:56.000Z",
    });
    const [rawPrograms, rawLogs, rawAliases] = await Promise.all([
      v9.getAll("programs"), v9.getAll("logs"), v9.getAll("aliases"),
    ]);
    v9.close();
    resetDbConnection();

    await openCurrentDatabase();
    const migratedInPlace = await snapshotNormalizedStores();
    // Anti-vacuity for the alias context: if the alias were purged, or never
    // reached the resolver, this slot would have no canonical id in either path
    // and the snapshots would match for the wrong reason.
    await expect(readCanonicalIdForName("Mystery lift")).resolves.toBe("romanian-deadlift");
    // Guards the comparison itself: if the pre-migration records already equalled
    // the migrated ones, the assertion below would hold for a restore that did
    // nothing at all.
    expect(await readRawStore("aliases")).not.toEqual(rawAliases);
    expect(await readRawStore("programs")).not.toEqual(rawPrograms);
    expect(await readRawStore("logs")).not.toEqual(rawLogs);

    // Rebuild the same pre-migration records as a version-1 file and restore
    // them into a fresh, already-upgraded database.
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await openCurrentDatabase();
    await restoreBackup({
      version: 1,
      exportedAt: NOW,
      programs: rawPrograms,
      logs: rawLogs,
      aliases: rawAliases,
    } as unknown as BackupDocumentV1);

    expect(await snapshotNormalizedStores()).toEqual(migratedInPlace);
  });
});

describe("restoreBackup — version-2 documents", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  // Ruling (spec line 373 scopes the purge to version-1 files; line 560 says to
  // preserve remembered provenance): a row that arrives *carrying* a provenance
  // has already been classified, so restore keeps it. A live v10 database does
  // not re-run classification as the catalogue grows, so a legacy-auto alias
  // that later became ambiguous keeps working there indefinitely — purging it on
  // restore would make restore strictly more destructive than the state it
  // claims to reproduce, silently and without a count.
  it.each([
    { name: "legacy-auto", provenance: "legacy-auto" as const },
    { name: "remembered", provenance: "remembered" as const },
  ])("keeps a $name alias whose token is now an underspecified choice", async ({ provenance }) => {
    await restoreBackup({
      version: 2,
      exportedAt: "2026-08-19T00:00:00.000Z",
      programs: [],
      logs: [],
      aliases: [{
        id: "alias-back-squat",
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "barbell-back-squat",
        provenance,
        createdAt: "2026-08-18T00:00:00.000Z",
      }],
      normalizationOverrides: [],
    } as never);

    await expect(aliasRepo.find("Back Squat")).resolves.toMatchObject({
      id: "alias-back-squat",
      canonicalExerciseId: "barbell-back-squat",
      provenance,
    });
  });

  // The two-generation case, end to end over a real (fake-indexeddb) database
  // rather than over the pure classifier — so it exercises the schema's only
  // unique index as well as the transform. One display name, two rows: a legacy
  // one keyed on the plain-normalized token, and a correction keyed on the
  // phrase-stripped token `resolveName` reads. Before the key preference was
  // flipped, both re-derived to the same token, the dedupe collapsed them, one
  // remembered mapping was silently discarded, and the survivor did not resolve.
  //
  // Both must come back with their own tokens, and the restore must not be
  // REJECTED by `by-normalized-alias` on the way.
  it("keeps both generations of key for one display name, and the correction still resolves", async () => {
    await restoreBackup({
      version: 2,
      exportedAt: "2026-08-19T00:00:00.000Z",
      programs: [],
      logs: [],
      aliases: [
        {
          id: "alias-legacy",
          alias: "3 second paused Hatfield Squat",
          normalizedAlias: "3 second paused hatfield squat",
          canonicalExerciseId: "barbell-high-bar-squat",
          provenance: "remembered",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "alias-corrected",
          alias: "3 second paused Hatfield Squat",
          normalizedAlias: "paused hatfield squat",
          canonicalExerciseId: "goblet-squat",
          provenance: "remembered",
          createdAt: "2026-08-18T00:00:00.000Z",
        },
      ],
      normalizationOverrides: [],
    } as never);

    const stored = (await aliasRepo.list())
      .map((alias) => [alias.id, alias.normalizedAlias])
      .sort();
    expect(stored).toEqual([
      ["alias-corrected", "paused hatfield squat"],
      ["alias-legacy", "3 second paused hatfield squat"],
    ]);

    // The lookup the app actually performs, on the name the user typed.
    await expect(aliasRepo.find("3 second paused Hatfield Squat")).resolves.toMatchObject({
      id: "alias-corrected",
      canonicalExerciseId: "goblet-squat",
    });
  });

  // Normalize-and-dedupe is integrity, not classification, so it stays
  // unconditional: a version-2 file is hand-editable JSON and
  // `by-normalized-alias` is the only unique index. What is *not* unconditional
  // any more is replacing the token outright — the row keeps the key its writer
  // chose, casing and spacing repaired.
  it("keeps an already-classified alias on the token the file gave it", async () => {
    await restoreBackup({
      version: 2,
      exportedAt: "2026-08-19T00:00:00.000Z",
      programs: [],
      logs: [],
      aliases: [{
        id: "alias-back-squat",
        alias: "Back Squat",
        normalizedAlias: "WRONG-TOKEN",
        canonicalExerciseId: "barbell-back-squat",
        provenance: "legacy-auto",
        createdAt: "2026-08-18T00:00:00.000Z",
      }],
      normalizationOverrides: [],
    } as never);

    await expect(aliasRepo.list()).resolves.toMatchObject([{
      id: "alias-back-squat",
      normalizedAlias: "wrong token",
      provenance: "legacy-auto",
    }]);
  });

  // Pins the corrected claim as behaviour, because the September 30
  // compatibility removal will be tempted by "legacy-auto rows cannot matter, so
  // drop them all". They can: this row is the only reason the slot resolves, and
  // it is a legacy-auto row that no pass re-classifies.
  it("lets a restored legacy-auto alias be the only reason a name resolves", async () => {
    const programWithAmbiguousSlot = {
      id: "p1",
      title: "Restored routine",
      days: [{
        id: "day-1",
        dayNumber: 1,
        title: "Day 1",
        sections: [{
          id: "s1",
          type: "strength" as const,
          name: "Main",
          groups: [{ id: "g1", type: "single" as const, exercises: [
            { id: "slot-1", name: "Back Squat" },
          ] }],
        }],
      }],
      overrides: [],
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    };
    const document = (aliases: unknown[]) => ({
      version: 2,
      exportedAt: "2026-08-19T00:00:00.000Z",
      programs: [programWithAmbiguousSlot],
      logs: [],
      aliases,
      normalizationOverrides: [],
    });

    // Without the alias the catalogue leaves "back squat" underspecified.
    await restoreBackup(document([]) as never);
    await expect(readCanonicalIdForName("Back Squat")).resolves.toBeUndefined();

    await restoreBackup(document([{
      id: "alias-back-squat",
      alias: "Back Squat",
      normalizedAlias: "back squat",
      canonicalExerciseId: "barbell-back-squat",
      provenance: "legacy-auto",
      createdAt: "2026-08-18T00:00:00.000Z",
    }]) as never);
    await expect(readCanonicalIdForName("Back Squat")).resolves.toBe("barbell-back-squat");
  });

  it("round-trips normalization overrides and alias provenance", async () => {
    const saved = await normalizationOverrideRepo.save({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: "squat",
      movementModifierIds: ["barbell"],
    });
    await aliasRepo.save({
      alias: "My high bar",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    await programRepo.save(demoProgram);

    const exported = await exportBackup();
    expect(exported).toMatchObject({ version: 2, normalizationOverrides: [saved] });

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(exported);

    await expect(normalizationOverrideRepo.list()).resolves.toEqual([saved]);
    await expect(aliasRepo.find("My high bar")).resolves.toMatchObject({ provenance: "remembered" });
  });

  it("dispatches one identity event whose listener can read the restored data", async () => {
    await programRepo.save(demoProgram);
    const exported = await exportBackup();
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();

    const committedReads: Array<Promise<number>> = [];
    const listener = jest.fn(() => {
      committedReads.push(programRepo.list().then((programs) => programs.length));
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);
    try {
      await restoreBackup(exported);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(Promise.all(committedReads)).resolves.toEqual([1]);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  // The one backed-up field restore never validated. The `profile` store has
  // keyPath "id", so put() on a primitive or on an object without a string id
  // throws DataError *synchronously inside the already-open readwrite
  // transaction*, after all eight clear() calls have been issued. An uncaught JS
  // exception does not abort an IndexedDB transaction, so the clears commit, the
  // puts never run, and the caller is told the restore failed: every store gone.
  it.each([
    { name: "a primitive profile", profile: "i-am-not-an-object" },
    { name: "a profile with no id", profile: { name: "no id here" } },
    { name: "a profile whose id is not a string", profile: { id: 7 } },
  ])("rejects $name without destroying the workspace", async ({ profile }) => {
    await programRepo.save(demoProgram);
    // A second store, seeded rather than merely empty: asserting that an empty
    // store is still empty holds under every mutation, including the one where
    // all eight stores are cleared and nothing is written back.
    await logRepo.save({
      id: "log-1",
      programId: demoProgram.id,
      dayId: demoProgram.days[0].id,
      performedAt: "2026-08-18T00:00:00.000Z",
      entries: [],
    });
    const beforePrograms = await programRepo.list();
    const beforeLogs = await logRepo.list();
    const exported = await exportBackup();

    await expect(restoreBackup({ ...exported, profile })).rejects.toThrow(/profile/);

    await expect(programRepo.list()).resolves.toEqual(beforePrograms);
    await expect(logRepo.list()).resolves.toEqual(beforeLogs);
  });

  it("accepts an absent or null profile", async () => {
    await programRepo.save(demoProgram);
    const exported = await exportBackup();
    const { profile: _dropped, ...withoutProfile } = exported;

    await expect(restoreBackup(withoutProfile)).resolves.toBeUndefined();
    await expect(restoreBackup({ ...exported, profile: null })).resolves.toBeUndefined();
    await expect(programRepo.list()).resolves.toHaveLength(1);
  });

  // The structural net, independent of any one field's validation: every write
  // inside the transaction is wrapped, so a throw between the clears and the
  // commit aborts instead of leaving an emptied workspace behind. Without it,
  // the next unguarded line added inside that block has the blast radius above.
  it("aborts the transaction when a write throws after the stores are cleared", async () => {
    await programRepo.save(demoProgram);
    const before = await programRepo.list();
    const exported = await exportBackup();

    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "programs") throw new DOMException("injected write failure", "DataError");
      return originalPut.apply(this, args);
    };
    try {
      await expect(restoreBackup(exported)).rejects.toThrow("injected write failure");
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    await expect(programRepo.list()).resolves.toEqual(before);
  });

  // Override validation takes the file's own custom exercises, not the
  // database's — the database is about to be replaced by this very file. If that
  // wiring broke, the data would still be safe (validation throws before the
  // transaction) but the user's own backup would become permanently
  // unrestorable, with an error blaming their file.
  it("validates an override against a custom exercise from the same file", async () => {
    const customExercise = {
      id: "user-custom-1",
      name: "Djs Special Squat",
      createdAt: "2026-08-18T00:00:00.000Z",
    };

    await restoreBackup({
      version: 2,
      exportedAt: "2026-08-19T00:00:00.000Z",
      programs: [],
      logs: [],
      aliases: [],
      userExercises: [customExercise],
      normalizationOverrides: [{
        id: "exercise-id:user-custom-1",
        targetKind: "exercise-id",
        targetValue: "user-custom-1",
        movementId: "squat",
        movementModifierIds: ["barbell"],
        updatedAt: "2026-08-18T00:00:00.000Z",
      }],
    } as never);

    await expect(normalizationOverrideRepo.list()).resolves.toMatchObject([
      { id: "exercise-id:user-custom-1", targetValue: "user-custom-1" },
    ]);
    await expect(userExerciseRepo.list()).resolves.toEqual([customExercise]);
  });

  // The sync-throw test above probes the branch that is easiest to reach. The
  // class this plan's own comments call the database-bricking one is different: a
  // request the store accepts and then rejects *asynchronously*, which is what
  // the unique by-normalized-alias index does to a colliding write. The upgrade
  // path has a test for it; the restore path had none.
  it("aborts and reports the real cause when a write is rejected asynchronously", async () => {
    await programRepo.save(demoProgram);
    const before = await programRepo.list();
    const exported = await exportBackup();

    // Force two distinct aliases onto one token, so the second put is rejected by
    // the unique index rather than throwing.
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(
      this: IDBObjectStore,
      value: unknown,
      ...rest: unknown[]
    ) {
      const forced = this.name === "aliases"
        ? { ...(value as Record<string, unknown>), normalizedAlias: "one token for both" }
        : value;
      return (originalPut as (...args: unknown[]) => IDBRequest<IDBValidKey>)
        .call(this, forced, ...rest);
    } as typeof IDBObjectStore.prototype.put;

    try {
      // A support-ticket detail, not a nicety: "AbortError" tells a user with a
      // possibly-only copy of their data nothing at all about why it would not
      // restore. The rollback is what aborts, so the abort must not become the
      // reported cause.
      await expect(restoreBackup({
        ...exported,
        // Written *after* the aliases, so the abort rejects it too — the shape a
        // first-cause-wins capture exists for. It does not make that capture
        // observable here, and the comment used to claim it did: measured, this
        // request's AbortError arrives a tick *after* `tx.done` rejects, which is
        // why `writeError ??=` → `=` leaves the whole lane green. See
        // backup.ts's `issueTransactionWrite` for the measurement; the guard is
        // kept for an ordering the IndexedDB spec does not pin and this harness
        // cannot reproduce.
        bodyweight: [{
          id: "2026-08-18", value: 80, unit: "kg", recordedAt: "2026-08-18T00:00:00.000Z",
        }],
        aliases: [
          {
            id: "a1", alias: "My Squat", normalizedAlias: "my squat",
            canonicalExerciseId: "goblet-squat", provenance: "remembered",
            createdAt: "2026-08-18T00:00:00.000Z",
          },
          {
            id: "a2", alias: "My Pull", normalizedAlias: "my pull",
            canonicalExerciseId: "pull-up", provenance: "remembered",
            createdAt: "2026-08-18T00:00:00.000Z",
          },
        ],
      })).rejects.toMatchObject({ name: "ConstraintError" });
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    await expect(programRepo.list()).resolves.toEqual(before);
  });

  it("leaves the existing workspace intact when the document is rejected", async () => {
    await programRepo.save(demoProgram);
    const before = await programRepo.list();
    const exported = await exportBackup();

    await expect(restoreBackup({
      ...exported,
      normalizationOverrides: [
        { id: "x", targetKind: "normalized-name", targetValue: "hatfield squat", movementId: "squat", movementModifierIds: ["barbell"], updatedAt: "2026-08-18T00:00:00.000Z" },
        { id: "y", targetKind: "normalized-name", targetValue: "Hatfield squat", movementId: "squat", movementModifierIds: [], updatedAt: "2026-08-18T00:00:00.000Z" },
      ],
    })).rejects.toThrow("duplicate normalization override target");

    await expect(programRepo.list()).resolves.toEqual(before);
  });
});

// The Critical this closes, end to end over a real fake-indexeddb database
// rather than a mocked transaction: the app could WRITE a backup it could not
// READ back. `appDb`'s v7 rule keeps a log whose `entries` is unreadable
// (`appDb.ts:181-191`), `exportBackup`'s `getAll()` copies it into the file
// verbatim, and `restoreBackup`'s `requireFields` then refused the whole file
// with `logs[0] (id …) — 'entries' must be an array of objects.` One malformed
// log therefore destroyed the restorability of every other record in the user's
// only safety net.
describe("export → restore round trip with a log the database keeps but cannot read", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it.each([
    ["a non-array entries", "corrupt"],
    ["an entries array whose element is null", [null]],
  ])("restores every record and preserves the value when a log has %s", async (_label, entries) => {
    await programRepo.save(demoProgram);
    await profileRepo.save(defaultProfile);
    await aliasRepo.save({
      alias: "Strict Pullup",
      canonicalExerciseId: "pull-up",
      provenance: "remembered",
    });
    const healthyLog = {
      id: "log-healthy",
      programId: demoProgram.id,
      dayId: demoProgram.days[0].id,
      performedAt: "2026-08-10T12:00:00.000Z",
      entries: [{ exerciseId: "slot-1", exerciseName: "Squat", sets: [] }],
    };
    await logRepo.save(healthyLog as WorkoutLogDocument);
    await logRepo.save({
      id: "log-unreadable",
      programId: demoProgram.id,
      dayId: demoProgram.days[0].id,
      performedAt: "2026-08-11T12:00:00.000Z",
      entries,
    } as unknown as WorkoutLogDocument);

    const backup = await exportBackup();
    // The malformed value really is in the file — otherwise the restore below
    // would be asserting nothing.
    expect(backup.logs.find((log) => log.id === "log-unreadable")?.entries).toEqual(entries);

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();

    await expect(restoreBackup(backup)).resolves.toBeUndefined();

    // The malformed value survives untouched, exactly as `appDb` treats it.
    const restored = await logRepo.list();
    expect(restored.find((log) => log.id === "log-unreadable")?.entries).toEqual(entries);
    // Every OTHER record landed too — the point of the fix is that one
    // unreadable field does not condemn the rest of the file.
    expect(restored.find((log) => log.id === "log-healthy")?.entries).toEqual(healthyLog.entries);
    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(aliasRepo.list()).resolves.toHaveLength(1);
    await expect(profileRepo.get()).resolves.toMatchObject({ id: defaultProfile.id });
  });
});
