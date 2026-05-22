import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AliasDocument, BackupDocument, BodyweightEntry, ProfileDocument, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
import type { ExerciseMetricsDocument } from "./metricsRepo";

export const DB_NAME = "trainer-local-first";
export const DB_VERSION = 6;

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
