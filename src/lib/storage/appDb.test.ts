import { deleteDB } from "idb";
import { DB_NAME, resetDbConnection } from "./appDb";
import { aliasRepo } from "./aliasRepo";
import { logRepo } from "./logRepo";
import { profileRepo } from "./profileRepo";
import { programRepo } from "./programRepo";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";

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
