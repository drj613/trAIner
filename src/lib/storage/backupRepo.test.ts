import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { backupRepo } from "./backupRepo";
import { DB_NAME, resetDbConnection } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

function makeBackup(exportedAt: string): BackupDocument {
  return {
    version: 1,
    exportedAt,
    profile: null,
    programs: [],
    logs: [],
    aliases: [],
    userExercises: [],
    bodyweight: [],
    promptPresets: [],
  } as unknown as BackupDocument;
}

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  resetDbConnection();
});

describe("backupRepo", () => {
  it("deletes a snapshot by id", async () => {
    await backupRepo.save(makeBackup("2026-01-01T00:00:00.000Z"));
    await backupRepo.save(makeBackup("2026-01-02T00:00:00.000Z"));
    await backupRepo.delete("2026-01-01T00:00:00.000Z");
    const left = await backupRepo.list();
    expect(left.map((b) => b.id)).toEqual(["2026-01-02T00:00:00.000Z"]);
  });

  it("prunes to the newest N snapshots", async () => {
    for (let d = 1; d <= 12; d++) {
      await backupRepo.save(makeBackup(`2026-01-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    await backupRepo.prune(10);
    const left = await backupRepo.list();
    expect(left).toHaveLength(10);
    expect(left.map((b) => b.id)).not.toContain("2026-01-01T00:00:00.000Z");
    expect(left.map((b) => b.id)).not.toContain("2026-01-02T00:00:00.000Z");
  });

  it("save() auto-prunes to 10", async () => {
    for (let d = 1; d <= 11; d++) {
      await backupRepo.save(makeBackup(`2026-02-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    expect(await backupRepo.list()).toHaveLength(10);
  });
});
