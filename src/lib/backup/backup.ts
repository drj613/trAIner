import type { BackupDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";

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

export async function restoreBackup(backup: unknown): Promise<void> {
  // C7: Validate structure before touching the database
  if (backup === null || typeof backup !== "object") {
    throw new Error("Invalid backup: expected an object.");
  }
  const doc = backup as Record<string, unknown>;
  if (doc["version"] !== 1) {
    throw new Error(`Unsupported backup version: ${doc["version"]}. Expected 1.`);
  }
  if (!Array.isArray(doc["programs"])) {
    throw new Error("Invalid backup: 'programs' must be an array.");
  }
  if (!Array.isArray(doc["logs"])) {
    throw new Error("Invalid backup: 'logs' must be an array.");
  }
  if (!Array.isArray(doc["aliases"])) {
    throw new Error("Invalid backup: 'aliases' must be an array.");
  }

  const b = backup as BackupDocument;

  // C6: Clear all stores before writing to avoid additive restore
  const db = await getDb();
  await Promise.all([
    db.clear("programs"),
    db.clear("logs"),
    db.clear("aliases"),
    db.clear("profile"),
  ]);

  if (b.profile) await profileRepo.save(b.profile);
  await Promise.all(b.programs.map((program) => programRepo.save(program)));
  await Promise.all(b.logs.map((log) => logRepo.save(log)));
  await Promise.all(
    b.aliases.map((alias) =>
      aliasRepo.saveWithId({
        id: alias.id,
        alias: alias.alias,
        normalizedAlias: alias.normalizedAlias,
        canonicalExerciseId: alias.canonicalExerciseId,
        createdAt: alias.createdAt,
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
