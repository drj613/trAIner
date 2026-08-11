import type { BackupDocument } from "@/lib/programs/types";
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

// Fix S5: deep validation of fields the app dereferences unconditionally on
// a normal page load — for programs, logs, and each program's overrides.
// Everything below that level (sections/groups/exercises/sets, enums,
// timestamp formats, referential integrity) is deliberately NOT validated
// here; it's deferred to S4's versioned-export design, where a schema will
// exist to validate against. Until then, the two safety nets for
// deep-but-well-typed corruption are the pre-restore auto-download and
// restore atomicity.
function requireFields(
  arr: Record<string, unknown>[],
  storeName: string,
  fields: { name: string; check: (v: unknown) => boolean; expected: string }[],
): void {
  arr.forEach((item, i) => {
    for (const f of fields) {
      if (!f.check(item[f.name])) {
        throw new Error(
          `Invalid backup: ${storeName}[${i}] (id ${String(item["id"])}) — '${f.name}' must be ${f.expected}.`,
        );
      }
    }
  });
}

const isString = (v: unknown) => typeof v === "string";
const isArrayOfNonNullObjects = (v: unknown) =>
  Array.isArray(v) && v.every((e) => e !== null && typeof e === "object" && !Array.isArray(e));

// getOverrideReplacementDays accepts either shape: a single day object, or
// an array of them. A missing/null replacement on a week-scope override
// crashes getRenderableDays on load — applyOverride reads it after the
// scope/weekNumber guards pass, inside `.find(r => r.dayNumber === ...)`,
// which throws on a null/undefined element. Validated for every override
// regardless of scope, since applyOverride reads `replacement` unconditionally
// before branching on scope.
const isDayOrDayArray = (v: unknown) =>
  Array.isArray(v)
    ? v.every((e) => e !== null && typeof e === "object" && !Array.isArray(e))
    : v !== null && typeof v === "object";

function requireOverrideReplacements(programs: Record<string, unknown>[]): void {
  programs.forEach((program, pi) => {
    const overrides = program["overrides"] as Record<string, unknown>[];
    overrides.forEach((override, oi) => {
      if (!isDayOrDayArray(override["replacement"])) {
        throw new Error(
          `Invalid backup: programs[${pi}] (id ${String(program["id"])}) — overrides[${oi}].replacement must be a day object or an array of day objects.`,
        );
      }
    });
  });
}

export async function exportBackup(): Promise<BackupDocument> {
  // One readonly transaction across every exported store: the file is a
  // consistent point-in-time snapshot even if another tab writes mid-export.
  const db = await getDb();
  const tx = db.transaction(
    ["profile", "programs", "logs", "aliases", "userExercises", "bodyweight", "promptPresets"],
    "readonly",
  );
  const [profiles, programs, logs, aliases, userExercises, bodyweight, promptPresets] = await Promise.all([
    tx.objectStore("profile").getAll(),
    tx.objectStore("programs").getAll(),
    tx.objectStore("logs").getAll(),
    tx.objectStore("aliases").getAll(),
    tx.objectStore("userExercises").getAll(),
    tx.objectStore("bodyweight").getAll(),
    tx.objectStore("promptPresets").getAll(),
  ]);
  await tx.done;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    // BackupDocument.profile is `ProfileDocument | undefined` — do NOT use
    // `?? null`, strict typechecking rejects null here.
    profile: profiles[0],
    programs,
    logs,
    aliases,
    userExercises,
    bodyweight,
    promptPresets,
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

  // A record that passes the shallow id check but lacks required structure
  // would commit, destroy the workspace, and crash every page that reads it.
  // Validate everything the app dereferences unconditionally BEFORE clearing.
  requireFields(doc["programs"], "programs", [
    { name: "title", check: isString, expected: "a string" },
    { name: "days", check: isArrayOfNonNullObjects, expected: "an array of objects" },
    { name: "overrides", check: isArrayOfNonNullObjects, expected: "an array of objects" },
    { name: "createdAt", check: isString, expected: "a string timestamp" },
    { name: "updatedAt", check: isString, expected: "a string timestamp" },
  ]);
  requireFields(doc["logs"], "logs", [
    { name: "programId", check: isString, expected: "a string" },
    { name: "dayId", check: isString, expected: "a string" },
    { name: "performedAt", check: isString, expected: "a string timestamp" },
    { name: "entries", check: isArrayOfNonNullObjects, expected: "an array of objects" },
  ]);
  requireOverrideReplacements(doc["programs"]);

  const b = backup as BackupDocument;

  // Fix 1: Atomic multi-store transaction — either fully restores or fully rolls back
  const db = await getDb();
  const tx = db.transaction(
    ["profile", "programs", "logs", "aliases", "userExercises", "bodyweight", "promptPresets", "metrics"],
    "readwrite",
  );

  tx.objectStore("profile").clear();
  tx.objectStore("programs").clear();
  tx.objectStore("logs").clear();
  tx.objectStore("aliases").clear();
  tx.objectStore("userExercises").clear();
  tx.objectStore("bodyweight").clear();
  tx.objectStore("promptPresets").clear();
  // metrics is a derived-cache store (currently unwritten anywhere). Clear it
  // on restore so it can never hold values computed from data that no longer
  // exists once someone starts using it.
  tx.objectStore("metrics").clear();

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
