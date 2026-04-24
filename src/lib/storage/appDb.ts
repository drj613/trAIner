import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AliasDocument, BackupDocument, ProfileDocument, ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";

export const DB_NAME = "trainer-local-first";
export const DB_VERSION = 1;

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
}

let dbPromise: Promise<IDBPDatabase<TrainerDb>> | undefined;
let dbInstance: IDBPDatabase<TrainerDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TrainerDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("profile")) {
          db.createObjectStore("profile", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("programs")) {
          db.createObjectStore("programs", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("logs")) {
          const store = db.createObjectStore("logs", { keyPath: "id" });
          store.createIndex("by-program", "programId");
          store.createIndex("by-day", "dayId");
        }

        if (!db.objectStoreNames.contains("aliases")) {
          const store = db.createObjectStore("aliases", { keyPath: "id" });
          store.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
          store.createIndex("by-exercise", "canonicalExerciseId");
        }

        if (!db.objectStoreNames.contains("backups")) {
          db.createObjectStore("backups", { keyPath: "id" });
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
