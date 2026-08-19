import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
import { userExerciseRepo } from "./userExerciseRepo";
import { bodyweightRepo } from "./bodyweightRepo";
import { promptPresetRepo } from "./promptPresetRepo";
import { classifyAliases, createMigrationContext, migrateLog, migrateProgram } from "./appDb";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import type { WorkoutLogDocument } from "@/lib/programs/types";
import {
  openCurrentDatabase,
  readCanonicalIdForName,
  readCanonicalReferences,
  readLogCanonicalIdForName,
  readRawRecord,
  readRawStore,
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
  return {
    ...actual,
    disambiguationRules: [...actual.disambiguationRules, underspecifiedBackSquat],
    disambiguationsByNormalizedName: new Map([
      ...actual.disambiguationsByNormalizedName,
      ["back squat", underspecifiedBackSquat],
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
    await openCurrentDatabase();

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

  it("dispatches one identity event after the v10 migration commits", async () => {
    await seedVersion9Database(v9Fixture);
    const committedReads: Array<Promise<boolean>> = [];
    const listener = jest.fn(() => {
      committedReads.push(getDb().then((db) => db.objectStoreNames.contains("normalizationOverrides")));
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await openCurrentDatabase();
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(Promise.all(committedReads)).resolves.toEqual([true]);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
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

  it.each(programCases)("passes through a $name unchanged", async ({ seeded, expected }) => {
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

  const logCases: Array<{ name: string; seeded: unknown; expected?: unknown }> = [
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

  it.each(logCases)("passes through a $name unchanged", async ({ seeded, expected }) => {
    await seedVersion9Records({ logs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    const id = (seeded as { id: string }).id;
    expect(await readRawRecord("logs", id)).toEqual(expected ?? seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  // Fix round 2: leaf *string* fields, not just container shapes. Each of
  // these reaches normalizeExerciseName / prepareImportName and throws on a
  // non-string, which the v10 block's catch turns into a rolled-back upgrade
  // that never reaches version 10. restoreBackup only checks aliases with
  // hasIds (backup.ts) and deliberately defers deep validation, so a
  // truncated or hand-edited backup can plant any of them on a pre-v10
  // client. The `metrics` canary below is what distinguishes "migrated and
  // deliberately left alone" from "bailed out before touching it".
  const leafProgramCases: Array<{ name: string; seeded: unknown }> = [
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
  ];

  it.each(leafProgramCases)("passes through a $name unchanged", async ({ seeded }) => {
    await seedVersion9Records({ programs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("programs", (seeded as { id: string }).id)).toEqual(seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  const leafLogCases: Array<{ name: string; seeded: unknown }> = [
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
  ];

  it.each(leafLogCases)("passes through a $name unchanged", async ({ seeded }) => {
    await seedVersion9Records({ logs: [seeded] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    expect(await readRawRecord("logs", (seeded as { id: string }).id)).toEqual(seeded);
    // Completion canary: deleting `metrics` is the last statement of the
    // v10 block, so its absence proves the migration ran to the end instead
    // of bailing midway and leaving the record un-migrated.
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
  });

  const unreadableAliases = [
    { name: "no canonicalExerciseId", alias: { id: "a-no-target", alias: "RDL", normalizedAlias: "rdl", createdAt: NOW } },
    { name: "no alias text", alias: { id: "a-no-text", canonicalExerciseId: "romanian-deadlift", createdAt: NOW } },
    { name: "a non-string alias text", alias: { id: "a-number-text", alias: 42, normalizedAlias: "42", canonicalExerciseId: "romanian-deadlift", createdAt: NOW } },
    { name: "a non-string canonicalExerciseId", alias: { id: "a-number-target", alias: "RDL", normalizedAlias: "rdl", canonicalExerciseId: 42, createdAt: NOW } },
  ];

  it.each(unreadableAliases)("drops an unreadable legacy alias with $name", async ({ alias }) => {
    const healthy = {
      id: "a-healthy",
      alias: "90/90 Hamstring",
      normalizedAlias: "90 90 hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: NOW,
    };
    await seedVersion9Records({ aliases: [alias, healthy] });

    await expect(openCurrentDatabase()).resolves.toBeUndefined();
    // Dropped, not retained: an alias we cannot read cannot be classified,
    // and an unclassifiable alias left in the store would keep silently
    // short-circuiting the new disambiguation flow forever.
    expect(await readRawStore("aliases")).toEqual([
      { ...healthy, provenance: "legacy-auto" },
    ]);
    expect(((await getDb()).objectStoreNames as unknown as DOMStringList).contains("metrics"))
      .toBe(false);
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
    const context = createMigrationContext(aliases, userExercises);

    for (const program of programs) {
      expect(migrateProgram(program, context)).toEqual(program);
    }
    for (const log of logs) {
      expect(migrateLog(log, context)).toEqual(log);
    }
    expect(classifyAliases(aliases, userExercises)).toEqual(aliases);
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

    const onceAliases = classifyAliases(rawAliases, []);
    expect(classifyAliases(onceAliases, [])).toEqual(onceAliases);
    const context = createMigrationContext(onceAliases, []);
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
