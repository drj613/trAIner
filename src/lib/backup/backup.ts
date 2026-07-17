import type { BackupDocument } from "@/lib/programs/types";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import { promptPresetRepo } from "@/lib/storage/promptPresetRepo";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";

// Fix 2: Deep validation helpers
function isArrayOfObjects(val: unknown): val is Record<string, unknown>[] {
  return (
    Array.isArray(val) &&
    val.every((e) => e !== null && typeof e === "object" && !Array.isArray(e))
  );
}

function hasIds(arr: Record<string, unknown>[]): boolean {
  return arr.every((e) => typeof e["id"] === "string");
}

export async function exportBackup(): Promise<BackupDocument> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await profileRepo.get(),
    programs: await programRepo.list(),
    logs: await logRepo.list(),
    aliases: await aliasRepo.list(),
    userExercises: await userExerciseRepo.list(),
    bodyweight: await bodyweightRepo.list(),
    promptPresets: await promptPresetRepo.list(),
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

  // Fix 2: Deep array validation — elements must be non-null objects
  if (!isArrayOfObjects(doc["programs"])) {
    throw new Error("Invalid backup: 'programs' must be an array of objects.");
  }
  if (!hasIds(doc["programs"])) {
    throw new Error("Invalid backup: 'programs' entries must have string ids.");
  }

  if (!isArrayOfObjects(doc["logs"])) {
    throw new Error("Invalid backup: 'logs' must be an array of objects.");
  }
  if (!hasIds(doc["logs"])) {
    throw new Error("Invalid backup: 'logs' entries must have string ids.");
  }

  if (!isArrayOfObjects(doc["aliases"])) {
    throw new Error("Invalid backup: 'aliases' must be an array of objects.");
  }
  if (!hasIds(doc["aliases"])) {
    throw new Error("Invalid backup: 'aliases' entries must have string ids.");
  }

  // userExercises is optional (old backups may not have it)
  if (doc["userExercises"] !== undefined) {
    if (!isArrayOfObjects(doc["userExercises"])) {
      throw new Error("Invalid backup: 'userExercises' must be an array of objects.");
    }
    if (!hasIds(doc["userExercises"])) {
      throw new Error("Invalid backup: 'userExercises' entries must have string ids.");
    }
  }

  // bodyweight is optional (old backups may not have it)
  if (doc["bodyweight"] !== undefined) {
    if (!isArrayOfObjects(doc["bodyweight"])) {
      throw new Error("Invalid backup: 'bodyweight' must be an array of objects.");
    }
    if (!hasIds(doc["bodyweight"])) {
      throw new Error("Invalid backup: 'bodyweight' entries must have string ids.");
    }
  }

  // promptPresets is optional (old backups may not have it)
  if (doc["promptPresets"] !== undefined) {
    if (!isArrayOfObjects(doc["promptPresets"])) {
      throw new Error("Invalid backup: 'promptPresets' must be an array of objects.");
    }
    if (!hasIds(doc["promptPresets"])) {
      throw new Error("Invalid backup: 'promptPresets' entries must have string ids.");
    }
  }

  const b = backup as BackupDocument;

  // Fix 1: Atomic multi-store transaction — either fully restores or fully rolls back
  const db = await getDb();
  const tx = db.transaction(["profile", "programs", "logs", "aliases", "userExercises", "bodyweight", "promptPresets"], "readwrite");

  tx.objectStore("profile").clear();
  tx.objectStore("programs").clear();
  tx.objectStore("logs").clear();
  tx.objectStore("aliases").clear();
  tx.objectStore("userExercises").clear();
  tx.objectStore("bodyweight").clear();
  tx.objectStore("promptPresets").clear();

  if (b.profile) tx.objectStore("profile").put(b.profile);
  for (const p of b.programs) tx.objectStore("programs").put(p);
  for (const l of b.logs) tx.objectStore("logs").put(l);
  for (const a of b.aliases) tx.objectStore("aliases").put(a);
  for (const ue of b.userExercises ?? []) tx.objectStore("userExercises").put(ue);
  for (const e of b.bodyweight ?? []) tx.objectStore("bodyweight").put(e);
  for (const p of b.promptPresets ?? []) tx.objectStore("promptPresets").put(p);

  await tx.done;
}

export async function resetWorkspace(): Promise<void> {
  resetDbConnection(); // close cached connection first — deleteDatabase blocks on open connections
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("Reset blocked — close other trAIner tabs and try again."));
  });
}
