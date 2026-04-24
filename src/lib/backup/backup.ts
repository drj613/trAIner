import type { BackupDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";

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
