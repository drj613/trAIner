import { getDb } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

export const backupRepo = {
  async save(backup: BackupDocument) {
    const id = backup.exportedAt;
    await (await getDb()).put("backups", { ...backup, id });
  },

  async list() {
    return (await getDb()).getAll("backups");
  }
};
