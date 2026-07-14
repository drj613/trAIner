import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
import { userExerciseRepo } from "./userExerciseRepo";
import { bodyweightRepo } from "./bodyweightRepo";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import type { WorkoutLogDocument } from "@/lib/programs/types";

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
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up" });
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
