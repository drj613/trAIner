import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { backupRepo, SNAPSHOT_RETENTION } from "./backupRepo";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
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

/** Write directly to the store, bypassing backupRepo.save()'s auto-prune —
 * used to seed more than SNAPSHOT_RETENTION records so a standalone
 * prune() test actually exercises prune() instead of being made vacuous
 * by save()'s own pruning. */
async function seedRaw(exportedAt: string) {
  const db = await getDb();
  await db.put("backups", { ...makeBackup(exportedAt), id: exportedAt });
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
      await seedRaw(`2026-01-${String(d).padStart(2, "0")}T00:00:00.000Z`);
    }
    // Prove seeding bypassed save()'s auto-prune — otherwise the prune(10)
    // call below would be a no-op and every assertion after it would pass
    // regardless of whether prune() actually does anything.
    expect(await backupRepo.list()).toHaveLength(12);

    await backupRepo.prune(10);
    const left = await backupRepo.list();
    expect(left).toHaveLength(10);
    expect(left.map((b) => b.id)).not.toContain("2026-01-01T00:00:00.000Z");
    expect(left.map((b) => b.id)).not.toContain("2026-01-02T00:00:00.000Z");
  });

  it("prune(keep) is a no-op when fewer than keep are stored", async () => {
    await seedRaw("2026-03-01T00:00:00.000Z");
    await seedRaw("2026-03-02T00:00:00.000Z");
    await seedRaw("2026-03-03T00:00:00.000Z");
    await backupRepo.prune(10);
    const left = await backupRepo.list();
    expect(left).toHaveLength(3);
  });

  it("save() auto-prunes to 10", async () => {
    for (let d = 1; d <= 11; d++) {
      await backupRepo.save(makeBackup(`2026-02-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    expect(await backupRepo.list()).toHaveLength(10);
  });

  it("saving while already at the cap leaves exactly SNAPSHOT_RETENTION records, including the newest", async () => {
    for (let d = 1; d <= SNAPSHOT_RETENTION; d++) {
      await backupRepo.save(makeBackup(`2026-04-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    expect(await backupRepo.list()).toHaveLength(SNAPSHOT_RETENTION);

    const newestId = "2026-04-11T00:00:00.000Z";
    await backupRepo.save(makeBackup(newestId));

    const left = await backupRepo.list();
    expect(left).toHaveLength(SNAPSHOT_RETENTION);
    expect(left.map((b) => b.id)).toContain(newestId);
    // The oldest of the original 10 must be the one that got dropped.
    expect(left.map((b) => b.id)).not.toContain("2026-04-01T00:00:00.000Z");
  });

  it("save() overwriting an existing id at the cap does not evict anything", async () => {
    // The overwrite/new-record distinction only bites exactly at the cap: if
    // an overwrite were (mis)treated as a new record, projected count would
    // read 11 instead of 10 and an unrelated oldest snapshot would be
    // evicted for no reason.
    const ids = Array.from(
      { length: SNAPSHOT_RETENTION },
      (_, i) => `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    );
    for (const id of ids) await backupRepo.save(makeBackup(id));
    expect(await backupRepo.list()).toHaveLength(SNAPSHOT_RETENTION);

    // Re-save an id already stored — an overwrite, not a new snapshot.
    await backupRepo.save(makeBackup(ids[2]));

    const left = await backupRepo.list();
    expect(left).toHaveLength(SNAPSHOT_RETENTION);
    expect(left.map((b) => b.id).sort()).toEqual(ids);
  });

  it("listIds returns snapshot ids without materializing full records", async () => {
    await backupRepo.save(makeBackup("2026-06-01T00:00:00.000Z"));
    await backupRepo.save(makeBackup("2026-06-02T00:00:00.000Z"));
    const ids = await backupRepo.listIds();
    expect([...ids].sort()).toEqual(["2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z"]);
  });
});
