import { getDb } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

/** Keep at most this many in-app snapshots. They are undo-points stored in
 * the same database they copy — NOT durable backups — so unbounded growth
 * is pure liability (the only realistic QuotaExceededError path here). */
export const SNAPSHOT_RETENTION = 10;

export const backupRepo = {
  async save(backup: BackupDocument) {
    const id = backup.exportedAt;
    await (await getDb()).put("backups", { ...backup, id });
    await this.prune(SNAPSHOT_RETENTION);
  },

  async list() {
    return (await getDb()).getAll("backups");
  },

  async delete(id: string) {
    await (await getDb()).delete("backups", id);
  },

  /** Delete all but the newest `keep` snapshots (ids are ISO timestamps, so
   * lexicographic order is chronological). */
  async prune(keep: number) {
    const db = await getDb();
    const all = await db.getAll("backups");
    const excess = all
      .map((b) => b.id)
      .sort((a, b) => b.localeCompare(a))
      .slice(keep);
    for (const id of excess) await db.delete("backups", id);
  },
};
