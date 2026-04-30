import type { BackupDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";

export async function exportBackup(): Promise<BackupDocument> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await profileRepo.get(),
    programs: await programRepo.list(),
    logs: await logRepo.list(),
    aliases: await aliasRepo.list()
  };
}

export async function restoreBackup(backup: BackupDocument) {
  if (backup.version !== 1) {
    throw new Error("Unsupported backup version.");
  }

  if (backup.profile) await profileRepo.save(backup.profile);
  await Promise.all(backup.programs.map((program) => programRepo.save(program)));
  await Promise.all(backup.logs.map((log) => logRepo.save(log)));
  await Promise.all(
    backup.aliases.map((alias) =>
      aliasRepo.save({
        alias: alias.alias,
        canonicalExerciseId: alias.canonicalExerciseId,
        createdAt: alias.createdAt
      })
    )
  );
}

export async function resetWorkspace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { resetDbConnection(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}
