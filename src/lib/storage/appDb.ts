import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { NormalizationOverrideDocument } from "@/lib/catalog/identity";
import { dispatchExerciseIdentityChanged } from "@/lib/catalog/identityEvents";
import { localDateOf } from "@/lib/workout/localDate";
import type {
  AliasDocument,
  BackupDocument,
  BodyweightEntry,
  ProfileDocument,
  ProgramDocument,
  PromptPresetDocument,
  UserExerciseDocument,
  WorkoutLogDocument,
} from "@/lib/programs/types";
import {
  classifyAliases,
  createMigrationContext,
  isReadableText,
  isRecord,
  mapArrayOrKeep,
  migrateLog,
  migrateProgram,
  unreadableValue,
} from "./migrations/v10Identity";

export const DB_NAME = "trainer-local-first";
export const DB_VERSION = 10;

export interface TrainerDb extends DBSchema {
  profile: {
    key: string;
    value: ProfileDocument;
  };
  programs: {
    key: string;
    value: ProgramDocument;
  };
  logs: {
    key: string;
    value: WorkoutLogDocument;
    indexes: { "by-program": string; "by-day": string };
  };
  aliases: {
    key: string;
    value: AliasDocument;
    indexes: { "by-normalized-alias": string; "by-exercise": string };
  };
  backups: {
    key: string;
    value: BackupDocument & { id: string };
  };
  userExercises: {
    key: string;
    value: UserExerciseDocument;
  };
  bodyweight: {
    key: string;
    value: BodyweightEntry;
  };
  promptPresets: {
    key: string;
    value: PromptPresetDocument;
  };
  normalizationOverrides: {
    key: string;
    value: NormalizationOverrideDocument;
  };
}

interface LegacyMetricsDb extends DBSchema {
  metrics: {
    key: string;
    value: { exerciseId: string } & Record<string, unknown>;
  };
}

let dbPromise: Promise<IDBPDatabase<TrainerDb>> | undefined;
let dbInstance: IDBPDatabase<TrainerDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    let shouldDispatchIdentityChange = false;
    let upgradeError: unknown;
    // `attempt` is read only by callbacks that cannot run before the open
    // returns (`terminated` needs a live connection; the settle handlers need a
    // settled promise), so referencing it from inside its own initialiser is
    // safe. Comparing against it is what stops a late failure from clearing a
    // newer connection that resetDbConnection() has since installed.
    const attempt: Promise<IDBPDatabase<TrainerDb>> = openDB<TrainerDb>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        // Installed before anything is issued, not inside the catch below: a
        // commit-time failure (QuotaExceededError, UnknownError) arrives *after*
        // the last awaited request, so the try/catch cannot see it. Without a
        // handler already attached it becomes an unhandled rejection and skips
        // the `upgradeError` routing that makes getDb() reject with the real
        // cause instead of a bare AbortError. `??=` keeps whichever cause came
        // first, so the AbortError from the deliberate abort below can never
        // overwrite the failure that triggered it.
        void tx.done.catch((error: unknown) => {
          upgradeError ??= error;
        });
        // idb does not await this callback, so an unhandled throw after the
        // first `await` does NOT abort anything: the versionchange transaction
        // commits whatever was already issued and the new version is stamped,
        // so the block that failed never runs again — a silent, permanent
        // half-migration (and, past the v10 alias clear(), an emptied alias
        // store). Spec: "Migration and restore failures abort their
        // transaction rather than committing a partially normalized
        // database." Every block is wrapped, not just the newest one, so the
        // older backfills and whatever v11 adds get the same guarantee.
        try {
          // v0 → v1: create all initial stores
          if (oldVersion < 1) {
            db.createObjectStore("profile", { keyPath: "id" });
            db.createObjectStore("programs", { keyPath: "id" });
            const logs = db.createObjectStore("logs", { keyPath: "id" });
            logs.createIndex("by-program", "programId");
            logs.createIndex("by-day", "dayId");
            const aliases = db.createObjectStore("aliases", { keyPath: "id" });
            aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
            aliases.createIndex("by-exercise", "canonicalExerciseId");
            db.createObjectStore("backups", { keyPath: "id" });
          }

          // v1 → v2: add metrics store
          if (oldVersion < 2) {
            if (!(db.objectStoreNames as unknown as DOMStringList).contains("metrics")) {
              (db as unknown as IDBPDatabase<LegacyMetricsDb>)
                .createObjectStore("metrics", { keyPath: "exerciseId" });
            }
          }

          // v2 → v3: add userExercises store
          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains("userExercises")) {
              db.createObjectStore("userExercises", { keyPath: "id" });
            }
          }

          // v3 → v4: add bodyweight store
          if (oldVersion < 4) {
            if (!db.objectStoreNames.contains("bodyweight")) {
              db.createObjectStore("bodyweight", { keyPath: "id" });
            }
          }

          // v4 → v5: backfill completedAt on pre-existing logs.
          // Before this version, every saved log was effectively a finished
          // workout (no autosave-only logs existed beyond a ~2-day window).
          // Treat any log lacking completedAt as completed at its performedAt.
          if (oldVersion < 5 && oldVersion >= 1) {
            const store = tx.objectStore("logs");
            let cursor = await store.openCursor();
            while (cursor) {
              const log = cursor.value as WorkoutLogDocument;
              if (!log.completedAt) {
                await cursor.update({ ...log, completedAt: log.performedAt });
              }
              cursor = await cursor.continue();
            }
          }

          // v5 → v6: dayNote, skippedAt, skipReason added as optional fields on logs.
          // No migration needed; existing records are valid as-is.
          if (oldVersion < 6) {
            // intentionally empty — optional fields, no schema change
          }

          // v6 → v7: session-identity hardening.
          //  - Backfill performedDate (the local calendar date the session
          //    belongs to) from performedAt, using the device timezone.
          //  - Delete phantom logs: an autosave bug used to write an empty log
          //    whenever a day page was merely visited. A log with no recorded
          //    sets, no notes, and no completion/skip marker carries zero
          //    information and only pollutes history and session lookup.
          if (oldVersion < 7 && oldVersion >= 1) {
            const store = tx.objectStore("logs");
            let cursor = await store.openCursor();
            while (cursor) {
              const log = cursor.value as WorkoutLogDocument;
              // One rule, applied at every level: unreadable content is never
              // grounds for deletion. `?? []` guards undefined but not a
              // corrupt non-array, and the callback below dereferences each
              // element. Absent entries still mean "no information" (unchanged,
              // and what the phantom rule exists for), but anything present
              // that we cannot read — a non-array `entries`, a non-record
              // entry, a non-array `sets` — may be standing in for real sets we
              // have no way to recover, so the log counts as having data and is
              // kept. Retaining an empty log costs the user one deletion;
              // deleting a real one destroys their only copy.
              const hasData =
                !!log.completedAt || !!log.skippedAt || !!log.dayNote || !!log.notes ||
                unreadableValue(log.entries) ||
                (log.entries ?? []).some((e) => !isRecord(e) ||
                  unreadableValue(e.sets) || (e.sets?.length ?? 0) > 0 || !!e.notes);
              if (!hasData) {
                await cursor.delete();
              } else if (!log.performedDate) {
                await cursor.update({ ...log, performedDate: localDateOf(log.performedAt) });
              }
              cursor = await cursor.continue();
            }
          }

          // v7 → v8: rescue kg cells. Before per-exercise units existed, a cell
          // like "10kg x10" failed to parse and was stored as unparseable
          // rawCell text (contributing zero volume). Re-parse those into
          // weight/reps with unit "kg". Unitless numeric weights stay as-is
          // (absent unit = lb).
          if (oldVersion < 8 && oldVersion >= 1) {
            const kgCell = /^\+?\s*(\d+(?:\.\d+)?)\s*kgs?\s*x\s*(\d+)$/i;
            const store = tx.objectStore("logs");
            let cursor = await store.openCursor();
            while (cursor) {
              const log = cursor.value as WorkoutLogDocument;
              let changed = false;
              // Same class as the v7 block: `?? []` does not make a corrupt
              // non-array iterable, `!set.rawCell` does not make a non-string
              // trimmable, and neither guard survives a null element. mapArray
              // returns its input untouched when it is not an array, so an
              // unreadable log is passed through instead of aborting the
              // upgrade for every load.
              const entries = mapArrayOrKeep(log.entries ?? [], (entry) => (isRecord(entry) ? {
                ...entry,
                sets: mapArrayOrKeep(entry.sets ?? [], (set) => {
                  if (!isRecord(set)) return set;
                  if (set.weight !== undefined || !isReadableText(set.rawCell)) return set;
                  const m = kgCell.exec(set.rawCell.trim());
                  if (!m) return set;
                  changed = true;
                  const { rawCell: _drop, ...rest } = set;
                  return {
                    ...rest,
                    weight: parseFloat(m[1]),
                    unit: "kg" as const,
                    reps: parseInt(m[2], 10),
                  };
                }),
              } : entry));
              if (changed) await cursor.update({ ...log, entries });
              cursor = await cursor.continue();
            }
          }

          // v8 → v9: add promptPresets store. Create-only; no existing data to migrate.
          if (oldVersion < 9) {
            if (!db.objectStoreNames.contains("promptPresets")) {
              db.createObjectStore("promptPresets", { keyPath: "id" });
            }
          }

          // v9 → v10: persist normalization overrides, normalize every stored
          // catalogue reference in the same upgrade transaction, classify the
          // aliases that predate provenance, and drop the unused derived
          // metrics cache.
          if (oldVersion < 10) {
            if (!db.objectStoreNames.contains("normalizationOverrides")) {
              db.createObjectStore("normalizationOverrides", { keyPath: "id" });
            }

            const programsStore = tx.objectStore("programs");
            const logsStore = tx.objectStore("logs");
            const aliasesStore = tx.objectStore("aliases");
            const userExercisesStore = tx.objectStore("userExercises");
            const [programs, logs, aliases, userExercises] = await Promise.all([
              programsStore.getAll(),
              logsStore.getAll(),
              aliasesStore.getAll(),
              userExercisesStore.getAll(),
            ]);
            const classifiedAliases = classifyAliases(aliases, userExercises);
            const context = createMigrationContext(
              classifiedAliases,
              userExercises,
              // The store was created empty a few lines above, and stored
              // records must not bake in override-derived identity anyway.
              [],
            );

            await aliasesStore.clear();
            await Promise.all([
              ...programs.map((program) => programsStore.put(migrateProgram(program, context))),
              ...logs.map((log) => logsStore.put(migrateLog(log, context))),
              ...classifiedAliases.map((alias) => aliasesStore.put(alias)),
            ]);

            if ((db.objectStoreNames as unknown as DOMStringList).contains("metrics")) {
              (db as unknown as IDBPDatabase<LegacyMetricsDb>).deleteObjectStore("metrics");
            }
            shouldDispatchIdentityChange = oldVersion > 0;
          }
        } catch (error) {
          upgradeError ??= error;
          // The `done` rejection is already handled — see the unconditional
          // catch at the top of this callback — so aborting cannot surface an
          // unhandled AbortError.
          try {
            tx.abort();
          } catch {
            // Already aborted — a failed IDB request aborts its own
            // transaction, and abort() on a finished transaction throws.
          }
          // Deliberately not rethrown: idb never awaits this callback, so a
          // throw here would only become another unhandled rejection. The
          // abort is what fails the open request; the catch below then reports
          // this real cause instead of the generic AbortError.
        }
      },
      blocked() {
        // Another tab holds an older connection; this open will hang until
        // it closes. Tell the UI so the user gets an instruction, not a
        // silent forever-spinner.
        window.dispatchEvent(new CustomEvent("trainer-db-blocked"));
      },
      blocking() {
        // This tab's open connection is blocking another IDBOpenDBRequest
        // from proceeding. Two distinct triggers land here: a newer tab/
        // deploy trying to upgrade to a higher DB_VERSION, or another tab
        // calling indexedDB.deleteDatabase during a workspace reset (see
        // resetWorkspace in src/lib/backup/backup.ts). Either way, this
        // tab's connection must close before the other side can continue.
        //
        // We deliberately do NOT close the connection or reload here. A
        // queued-but-not-yet-started autosave write, or an edit the user
        // makes right after this fires, would be discarded by a reload the
        // user never asked for — exactly the data loss this whole effort
        // exists to prevent. Surface it instead and let the user choose
        // when to reload; the other tab is already showing its own
        // "blocked" banner telling *them* to close tabs, so both sides give
        // coherent, actionable advice without anything being destroyed
        // without consent.
        window.dispatchEvent(new CustomEvent("trainer-db-blocking"));
      },
      terminated() {
        // Browser killed the connection (e.g. storage pressure); allow reopen.
        // Both globals are cleared only when they still describe *this* open,
        // for the same reason as the failure path below: resetDbConnection()
        // may already have installed a newer connection, and clearing
        // unconditionally would discard it and leave two live opens racing.
        if (dbPromise !== attempt) return;
        dbInstance = undefined;
        dbPromise = undefined;
      },
    }).then((db) => {
      if (dbPromise !== attempt) {
        // resetDbConnection() (or a terminated connection) installed a newer
        // open while this one was still in flight, so nothing will ever read
        // this connection — and resetDbConnection cannot close a connection
        // that did not exist yet when it ran. Left open it blocks the next
        // upgrade and the next deleteDatabase, which is exactly what
        // resetWorkspace needs to succeed. The identity event still fires
        // below if the migration committed: the data really did change, and
        // listeners re-read through whichever connection is installed now.
        db.close();
        if (shouldDispatchIdentityChange) dispatchExerciseIdentityChanged();
        return db;
      }
      dbInstance = db;
      // Whatever open request was previously stuck behind another
      // connection (if any) has now resolved on its own — clear any
      // "blocked" banner the UI may be showing. No-op if nothing was
      // blocked.
      window.dispatchEvent(new CustomEvent("trainer-db-unblocked"));
      if (shouldDispatchIdentityChange) dispatchExerciseIdentityChanged();
      return db;
    }).catch((e) => {
      // Only retire this attempt. If resetDbConnection() (or a terminated
      // connection) already installed a newer promise, clearing unconditionally
      // would throw that one away and leave two live opens racing.
      if (dbPromise === attempt) dbPromise = undefined;
      // A failed migration surfaces its real cause rather than the AbortError
      // that the deliberate rollback produces.
      throw upgradeError ?? e;
    });
    dbPromise = attempt;
  }

  return dbPromise;
}

export function resetDbConnection() {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}
