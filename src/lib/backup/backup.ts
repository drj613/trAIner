import type { NormalizationOverrideDocument } from "@/lib/catalog/identity";
import { dispatchExerciseIdentityChanged } from "@/lib/catalog/identityEvents";
import type {
  AliasDocument,
  BackupDocument,
  BackupDocumentV2,
  UserExerciseDocument,
} from "@/lib/programs/types";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import {
  classifyAliases,
  createMigrationContext,
  migrateLog,
  migrateProgram,
} from "@/lib/storage/migrations/v10Identity";
import {
  canonicalNormalizationOverride,
  normalizationOverrideKey,
  validateNormalizationOverrideInput,
} from "@/lib/storage/normalizationOverrideRepo";

// Every store a backup covers, in one list, so the export snapshot and the
// restore write set cannot drift apart. `backups` is deliberately absent: the
// in-app snapshots are undo points for *this* database, not user data to carry
// between installs.
const BACKED_UP_STORES = [
  "profile", "programs", "logs", "aliases",
  "userExercises", "bodyweight", "promptPresets", "normalizationOverrides",
] as const;

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

const isStringOrNull = (v: unknown) => v === null || typeof v === "string";
const isArrayOfStrings = (v: unknown) =>
  Array.isArray(v) && v.every((e) => typeof e === "string");

// Runs before the write transaction opens, so a bad override set leaves the
// existing workspace exactly as it was. Two rows can carry different ids and
// still name the same target once normalized, in which case the store would
// keep one and silently lose the other — that is a corrupt file, not a merge to
// resolve here.
function validateRestoredOverrides(
  overrides: readonly NormalizationOverrideDocument[],
  userExercises: readonly Record<string, unknown>[] | undefined,
): void {
  const userExerciseIds = new Set(
    (userExercises ?? [])
      .map((exercise) => exercise["id"])
      .filter((id): id is string => typeof id === "string"),
  );
  const seenTargets = new Set<string>();
  for (const override of overrides) {
    // The same validation the override editor applies, against the same bundled
    // movement/modifier definitions, so a restored file cannot install an
    // override the app itself would have refused to save.
    validateNormalizationOverrideInput(override, userExerciseIds);
    const key = normalizationOverrideKey(override.targetKind, override.targetValue);
    if (seenTargets.has(key)) {
      throw new Error(`Invalid backup: duplicate normalization override target: ${key}.`);
    }
    seenTargets.add(key);
  }
}

export async function exportBackup(): Promise<BackupDocumentV2> {
  // One readonly transaction across every exported store: the file is a
  // consistent point-in-time snapshot even if another tab writes mid-export.
  const db = await getDb();
  const tx = db.transaction(BACKED_UP_STORES, "readonly");
  // tx.done is included in the same Promise.all (last, resolves to
  // undefined, ignored below) rather than awaited afterward — if a getAll()
  // rejects, Promise.all rejects immediately and control would otherwise
  // never reach a standalone `await tx.done`, leaving its rejection (the
  // transaction aborts when a request fails) unhandled.
  const [
    profiles, programs, logs, aliases,
    userExercises, bodyweight, promptPresets, normalizationOverrides,
  ] = await Promise.all([
    tx.objectStore("profile").getAll(),
    tx.objectStore("programs").getAll(),
    tx.objectStore("logs").getAll(),
    tx.objectStore("aliases").getAll(),
    tx.objectStore("userExercises").getAll(),
    tx.objectStore("bodyweight").getAll(),
    tx.objectStore("promptPresets").getAll(),
    tx.objectStore("normalizationOverrides").getAll(),
    tx.done,
  ]);
  return {
    version: 2,
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
    normalizationOverrides,
  };
}

export async function restoreBackup(backup: unknown): Promise<void> {
  // C7: Validate structure before touching the database
  if (backup === null || typeof backup !== "object") {
    throw new Error("Invalid backup: expected an object.");
  }
  const doc = backup as Record<string, unknown>;
  // Version 1 is accepted only while the temporary legacy-id compatibility
  // table exists (see the spec's September 30 removal date). A *newer* version
  // is rejected rather than read as a version 2: dropping fields this build does
  // not recognize would silently destroy whatever they held.
  if (doc["version"] !== 1 && doc["version"] !== 2) {
    throw new Error(`Unsupported backup version: ${doc["version"]}. Expected 1 or 2.`);
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

  // The `profile` store has keyPath "id", so put() on a primitive — or on an
  // object with no string `id` — throws DataError *inside* the write
  // transaction, after every clear() has been issued. An uncaught JS exception
  // does not abort an IndexedDB transaction, so those clears would commit while
  // the puts never ran: the whole workspace gone, and the caller told the
  // restore failed. Absent or null is legal (a workspace with no profile yet).
  const profile = doc["profile"];
  if (profile !== undefined && profile !== null) {
    if (
      typeof profile !== "object" ||
      Array.isArray(profile) ||
      typeof (profile as Record<string, unknown>)["id"] !== "string"
    ) {
      throw new Error("Invalid backup: 'profile' must be an object with a string id.");
    }
  }

  // Version 2 carries normalization overrides. Absent is only legal in a
  // version-1 file, where it means "none"; a version-2 file that lost the field
  // is a truncated file, not an empty override set.
  if (doc["version"] === 2) {
    if (!isArrayOfObjects(doc["normalizationOverrides"])) {
      throw new Error("Invalid backup: 'normalizationOverrides' must be an array of objects.");
    }
    // No id check, deliberately: canonicalNormalizationOverride derives the id
    // from the target, so a file's id is never read. A guard that cannot fail
    // for any input is exactly what the recipe in v10Identity.ts legislates
    // against — it reads as protection while asserting nothing.
    requireFields(doc["normalizationOverrides"], "normalizationOverrides", [
      { name: "targetKind", check: isString, expected: "a string" },
      { name: "targetValue", check: isString, expected: "a string" },
      { name: "movementId", check: isStringOrNull, expected: "a string or null" },
      { name: "movementModifierIds", check: isArrayOfStrings, expected: "an array of strings" },
      { name: "updatedAt", check: isString, expected: "a string timestamp" },
    ]);
    validateRestoredOverrides(
      doc["normalizationOverrides"] as unknown as NormalizationOverrideDocument[],
      doc["userExercises"] as Record<string, unknown>[] | undefined,
    );
  }

  const b = backup as BackupDocument;

  // getDb() runs any pending schema upgrade against whatever is in the stores
  // *right now* — never against the file, which is cleared in and repopulated
  // from the transaction below. So the restored records are put through the same
  // pure transforms the upgrade uses, from the same module: without this, a
  // legacy canonical id or an unclassified alias in the file would survive
  // forever, because the stored version is already current and the upgrade
  // block never runs again. Reusing the transforms rather than restating the
  // rules is what keeps the two paths from diverging.
  //
  // Version-2 records were exported already normalized, so this is a fixed
  // point for them; running it unconditionally is what makes a file exported by
  // an older build safe to restore into a newer one.
  const userExercises = (b.userExercises ?? []) as UserExerciseDocument[];
  // classifyAliases does two separable jobs here, and only one of them is
  // version-dependent:
  //
  //  - Integrity, for every version: `normalizedAlias` is what
  //    `by-normalized-alias` (the schema's only unique index) is keyed on, so
  //    two rows landing on one token get the second write rejected outright. The
  //    file's own `normalizedAlias` IS what gets written — put through the
  //    normalize pass, and deduped on the result. Re-deriving it from the
  //    display text instead was the NEW-A defect: it silently moved a row off
  //    the key its writer chose, and an exported file's tokens are distinct by
  //    construction (they came out of a database with that unique index), so
  //    keeping them cannot introduce a collision the source did not have,
  //    whereas recomputing can collapse two live keys onto one. A version-2 file
  //    is hand-editable JSON, so the normalize-and-dedupe pass cannot be
  //    narrowed to version 1.
  //  - Classification, scoped by the file's *version*, not by the individual
  //    row. A version-1 file predates the provenance field, so every one of its
  //    rows goes through the same retain-as-"legacy-auto"-or-purge rules as the
  //    v10 database migration (spec line 373) — otherwise a hand-added
  //    provenance smuggles an ambiguous alias past the purge on exactly the
  //    format that is only accepted during the compatibility window. In a
  //    version-2 file a provenance is real, written by a build that classified
  //    the row, so those rows keep it: nothing re-classifies on read either, so
  //    re-running the rules against a grown catalogue would make restore delete
  //    aliases the live database it copied keeps using. `remembered` survives
  //    either way (spec line 560).
  const aliases = classifyAliases(
    b.aliases as AliasDocument[],
    userExercises,
    b.version === 1 ? "all" : "unclassified",
  );
  const context = createMigrationContext(
    aliases,
    userExercises,
    // Overrides are a read-time input. Baking override-derived identity into
    // the restored records would outlive the override being deleted.
    [],
  );
  const normalizationOverrides = (
    b.version === 2 ? b.normalizationOverrides : []
  ).map((override) => canonicalNormalizationOverride(override));

  // Every transform runs to completion out here, before a single store is
  // cleared. A throw from one of them (an unguarded read the guards do not cover
  // yet, say) then rejects with nothing touched, rather than mid-transaction
  // with the clears already issued.
  const programs = b.programs.map((program) => migrateProgram(program, context));
  const logs = b.logs.map((log) => migrateLog(log, context));

  // Fix 1: Atomic multi-store transaction — either fully restores or fully rolls back
  const db = await getDb();
  const tx = db.transaction(BACKED_UP_STORES, "readwrite");

  // idb turns every request into a promise. The individual writes are
  // deliberately not awaited — `tx.done` is the authoritative outcome, and a
  // failed request aborts its own transaction — so each rejection is handled as
  // it is issued. Without that, aborting below turns every in-flight request
  // into a separate unhandled AbortError.
  //
  // Handled, not discarded: the first rejection is *kept*, because it is the only
  // place the real cause exists. `tx.done` then rejects with the AbortError from
  // the rollback, and reporting that to a user whose only copy of their data will
  // not restore is a support dead-end. Same recipe as the upgrade callback's
  // `upgradeError ??= error`, and `??=` for the same reason: the abort must not
  // overwrite what caused it. Measured under fake-indexeddb, `=` would behave
  // identically — the AbortError rejections of requests queued behind the failing
  // one arrive a tick *after* `tx.done` rejects, so nothing overwrites anything
  // before the throw. That ordering is not something to depend on across engines,
  // and first-cause-wins costs one character.
  //
  // The name carries an invariant the type cannot: pass it object-store requests
  // only. Any promise would type-check, and handing it something like a
  // validation call would silently swallow that failure and let the clears
  // commit.
  let writeError: unknown;
  const issueTransactionWrite = (request: Promise<IDBValidKey | void>): void => {
    void request.catch((error: unknown) => {
      writeError ??= error;
    });
  };

  try {
    for (const store of BACKED_UP_STORES) issueTransactionWrite(tx.objectStore(store).clear());

    if (b.profile) issueTransactionWrite(tx.objectStore("profile").put(b.profile));
    for (const p of programs) issueTransactionWrite(tx.objectStore("programs").put(p));
    for (const l of logs) issueTransactionWrite(tx.objectStore("logs").put(l));
    for (const a of aliases) issueTransactionWrite(tx.objectStore("aliases").put(a));
    for (const ue of b.userExercises ?? []) issueTransactionWrite(tx.objectStore("userExercises").put(ue));
    for (const e of b.bodyweight ?? []) issueTransactionWrite(tx.objectStore("bodyweight").put(e));
    for (const p of b.promptPresets ?? []) issueTransactionWrite(tx.objectStore("promptPresets").put(p));
    for (const o of normalizationOverrides) issueTransactionWrite(tx.objectStore("normalizationOverrides").put(o));

    await tx.done;
  } catch (error) {
    // An uncaught JS exception does not abort an IndexedDB transaction: it would
    // simply auto-commit whatever was already issued, and the clears are always
    // issued first. Aborting is what makes "the restore failed" true. The
    // rejection of `done` is marked handled before aborting, because the abort
    // rejects it with an AbortError nobody is listening for; the original cause
    // is what the caller sees.
    void tx.done.catch(() => {});
    try {
      tx.abort();
    } catch {
      // Already finished — a failed request aborts its own transaction, and
      // abort() on a finished transaction throws.
    }
    // The request's own error, when there was one: `error` here is whatever
    // `await tx.done` rejected with, which after a rollback is the AbortError the
    // rollback itself produced. Falls back to `error` for the synchronous-throw
    // path, where no request ever failed.
    throw writeError ?? error;
  }
  // After the commit, never before: a listener that re-reads identity must not
  // see a half-cleared workspace. One event for the whole restore.
  dispatchExerciseIdentityChanged();
}

export async function resetWorkspace(onBlocked?: () => void): Promise<void> {
  resetDbConnection(); // close cached connection first — deleteDatabase blocks on open connections
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // IndexedDB gives no way to cancel a deleteDatabase request once it's
    // blocked — onblocked is purely informational per spec. The request
    // stays live and WILL fire onsuccess as soon as the last blocking
    // connection (e.g. another open tab) closes. The only honest options
    // here are "wait" (leave this promise pending and let the eventual
    // onsuccess/onerror settle it) or "lie" (reject now, then silently
    // erase the database after telling the caller it failed). We wait —
    // and let the caller show a truthful "waiting" state instead.
    req.onblocked = () => onBlocked?.();
  });
}
