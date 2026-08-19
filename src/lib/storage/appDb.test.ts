import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
import { userExerciseRepo } from "./userExerciseRepo";
import { bodyweightRepo } from "./bodyweightRepo";
import { promptPresetRepo } from "./promptPresetRepo";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import type { WorkoutLogDocument } from "@/lib/programs/types";
import {
  openCurrentDatabase,
  readCanonicalIdForName,
  readCanonicalReferences,
  readLogCanonicalIdForName,
  seedVersion9Database,
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
    await expect(aliasRepo.find("Back Squat")).resolves.toBeUndefined();
    await expect(aliasRepo.find("3x8 @ RPE 7")).resolves.toBeUndefined();
    await expect(aliasRepo.find("My high bar")).resolves.toMatchObject({ provenance: "remembered" });
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

  it("makes a second open a byte-for-byte no-op", async () => {
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
