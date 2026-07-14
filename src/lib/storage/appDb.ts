import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { localDateOf } from "@/lib/workout/localDate";
import type { AliasDocument, BackupDocument, BodyweightEntry, ProfileDocument, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
import type { ExerciseMetricsDocument } from "./metricsRepo";

export const DB_NAME = "trainer-local-first";
export const DB_VERSION = 8;

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
  metrics: {
    key: string;
    value: ExerciseMetricsDocument;
  };
  userExercises: {
    key: string;
    value: UserExerciseDocument;
  };
  bodyweight: {
    key: string;
    value: BodyweightEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<TrainerDb>> | undefined;
let dbInstance: IDBPDatabase<TrainerDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TrainerDb>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
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
          if (!db.objectStoreNames.contains("metrics")) {
            db.createObjectStore("metrics", { keyPath: "exerciseId" });
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
            const hasData =
              !!log.completedAt || !!log.skippedAt || !!log.dayNote || !!log.notes ||
              (log.entries ?? []).some((e) => (e.sets?.length ?? 0) > 0 || !!e.notes);
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
            const entries = (log.entries ?? []).map((entry) => ({
              ...entry,
              sets: (entry.sets ?? []).map((set) => {
                if (set.weight !== undefined || !set.rawCell) return set;
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
            }));
            if (changed) await cursor.update({ ...log, entries });
            cursor = await cursor.continue();
          }
        }
      }
    }).then((db) => {
      dbInstance = db;
      return db;
    });
  }

  return dbPromise;
}

export function resetDbConnection() {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}
