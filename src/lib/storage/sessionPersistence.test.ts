import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { logRepo } from "./logRepo";
import type { WorkoutLogDocument } from "@/lib/programs/types";

// jest.config.js pins TZ=America/New_York. Sessions are keyed by the user's
// LOCAL calendar date while performedAt is stored as a UTC ISO string; these
// tests cover the boundary where the two disagree (local evening).

describe("logRepo.getForDay — local calendar date matching", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("finds a legacy log (no performedDate) saved late in the local evening", async () => {
    // 2026-06-11T03:30Z == 2026-06-10 23:30 EDT. The session belongs to the
    // local date 2026-06-10 and MUST be found when queried with it; otherwise
    // every save after ~8pm creates a duplicate session.
    await logRepo.save({
      id: "evening-log",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-06-11T03:30:00.000Z",
      entries: [
        { exerciseId: "e1", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
      ],
    });
    const found = await logRepo.getForDay("p1", "d1", "2026-06-10");
    expect(found?.id).toBe("evening-log");
  });

  it("prefers the explicit performedDate field when present", async () => {
    await logRepo.save({
      id: "explicit-date",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-06-11T03:30:00.000Z",
      performedDate: "2026-06-10",
      entries: [],
      completedAt: "2026-06-11T03:45:00.000Z",
    } as WorkoutLogDocument);
    const found = await logRepo.getForDay("p1", "d1", "2026-06-10");
    expect(found?.id).toBe("explicit-date");
    expect(await logRepo.getForDay("p1", "d1", "2026-06-11")).toBeUndefined();
  });
});

describe("DB v7 — performedDate backfill and phantom-log cleanup", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  function seedV6() {
    return openDB(DB_NAME, 6, {
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

  it("backfills performedDate from performedAt using the local calendar date", async () => {
    const v6 = await seedV6();
    await v6.put("logs", {
      id: "needs-backfill",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-06-11T03:30:00.000Z", // 2026-06-10 local (EDT)
      completedAt: "2026-06-11T03:45:00.000Z",
      entries: [],
    });
    v6.close();

    const db = await getDb();
    const log = await db.get("logs", "needs-backfill");
    expect(log?.performedDate).toBe("2026-06-10");
  });

  it("deletes dataless phantom logs (no sets, notes, completion, or skip)", async () => {
    const v6 = await seedV6();
    // Phantom produced by visiting a day page and navigating away.
    await v6.put("logs", {
      id: "phantom",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-06-09T10:00:00.000Z",
      entries: [{ exerciseId: "e1", sets: [] }],
    });
    // Real log with actual set data must survive.
    await v6.put("logs", {
      id: "real",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-06-09T11:00:00.000Z",
      entries: [{ exerciseId: "e1", sets: [{ setNumber: 1, weight: 80, reps: 5 }] }],
    });
    // Deliberately skipped day (no sets) must survive.
    await v6.put("logs", {
      id: "skipped",
      programId: "p1",
      dayId: "d2",
      performedAt: "2026-06-09T12:00:00.000Z",
      skippedAt: "2026-06-09T12:00:00.000Z",
      entries: [{ exerciseId: "e2", sets: [] }],
    });
    v6.close();

    const db = await getDb();
    expect(await db.get("logs", "phantom")).toBeUndefined();
    expect((await db.get("logs", "real"))?.performedDate).toBe("2026-06-09");
    expect(await db.get("logs", "skipped")).toBeDefined();
  });
});
