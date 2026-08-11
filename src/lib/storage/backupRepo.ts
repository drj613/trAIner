import { getDb } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

/** Keep at most this many in-app snapshots. They are undo-points stored in
 * the same database they copy — NOT durable backups — so unbounded growth
 * is pure liability (the only realistic QuotaExceededError path here). */
export const SNAPSHOT_RETENTION = 10;

export const backupRepo = {
  /**
   * Write a snapshot and trim to SNAPSHOT_RETENTION, all in one read-write
   * transaction. Deletes happen BEFORE the put so peak storage never exceeds
   * the cap, and so a failed put rolls the deletes back too — a separate
   * put-then-prune would transiently need room for RETENTION + 1 full
   * workspace copies and would skip the prune entirely if the put itself
   * threw QuotaExceededError (the exact scenario this cap exists to avoid).
   */
  async save(backup: BackupDocument) {
    const id = backup.exportedAt;
    const db = await getDb();
    const tx = db.transaction("backups", "readwrite");
    const store = tx.objectStore("backups");
    const existingKeys = await store.getAllKeys();
    const isOverwrite = existingKeys.includes(id);
    // Overwriting an existing id doesn't grow the count; a new id does.
    const projectedCount = isOverwrite ? existingKeys.length : existingKeys.length + 1;
    // The record we're about to write can never be a deletion candidate.
    const oldestFirst = existingKeys.filter((k) => k !== id).sort();
    const excessCount = Math.max(0, projectedCount - SNAPSHOT_RETENTION);
    for (let i = 0; i < excessCount; i++) {
      await store.delete(oldestFirst[i]);
    }
    await store.put({ ...backup, id });
    await tx.done;
  },

  async list() {
    return (await getDb()).getAll("backups");
  },

  /** Ids only — for UI that just needs to render/delete rows without
   * materializing every full snapshot record (each up to a whole workspace
   * copy) a second time. */
  async listIds() {
    return (await getDb()).getAllKeys("backups");
  },

  async delete(id: string) {
    await (await getDb()).delete("backups", id);
  },

  /** Delete all but the newest `keep` snapshots (ids are ISO timestamps, so
   * lexicographic order is chronological). Single transaction so a failure
   * mid-prune rolls back instead of leaving the store partially trimmed. */
  async prune(keep: number) {
    const db = await getDb();
    const tx = db.transaction("backups", "readwrite");
    const store = tx.objectStore("backups");
    const keys = await store.getAllKeys();
    const excess = [...keys].sort((a, b) => b.localeCompare(a)).slice(keep);
    for (const id of excess) await store.delete(id);
    await tx.done;
  },
};
