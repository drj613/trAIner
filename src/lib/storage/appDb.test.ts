import { deleteDB } from "idb";
import { DB_NAME, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
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

  it("exports and restores profile, programs, logs, and aliases", async () => {
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

    const backup = await exportBackup();
    expect(backup.programs).toHaveLength(1);
    expect(backup.aliases).toHaveLength(1);
    expect(backup.logs).toHaveLength(1);

    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await restoreBackup(backup);

    await expect(programRepo.list()).resolves.toHaveLength(1);
    await expect(logRepo.list()).resolves.toHaveLength(1);
    await expect(aliasRepo.list()).resolves.toHaveLength(1);
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
