import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import {
  prepareImportName,
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type NormalizationOverrideDocument,
} from "@/lib/catalog/identity";
import { dispatchExerciseIdentityChanged } from "@/lib/catalog/identityEvents";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import {
  disambiguationsByNormalizedName,
  legacyExerciseIdRedirects,
  modifiersById,
  movementsById,
} from "@/lib/catalog/registries";
import { localDateOf } from "@/lib/workout/localDate";
import type {
  AliasDocument,
  BackupDocument,
  BodyweightEntry,
  ProfileDocument,
  ProgramDay,
  ProgramDocument,
  ProgramExercise,
  PromptPresetDocument,
  UserExerciseDocument,
  WorkoutLogDocument,
  WorkoutLogEntry,
} from "@/lib/programs/types";

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

const catalogById = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

export function createMigrationContext(
  aliases: readonly AliasDocument[],
  userExercises: readonly UserExerciseDocument[],
): ExerciseIdentityContext {
  return {
    catalogById,
    movementsById,
    modifiersById,
    redirects: legacyExerciseIdRedirects,
    disambiguations: disambiguationsByNormalizedName,
    aliases,
    userExercises,
    normalizationOverrides: [],
  };
}

function canonicalizeExplicitExerciseId(
  canonicalExerciseId: string,
  context: ExerciseIdentityContext,
): string {
  return resolveExerciseIdentity(
    { kind: "catalog-reference", canonicalExerciseId },
    context,
  ).concreteExerciseId ?? canonicalExerciseId;
}

// Legacy documents are not guaranteed to have every array this traversal
// walks: the v7/v8 blocks above already read `(log.entries ?? [])` because
// pre-entries logs exist, and backup.ts validates null override replacements
// because those exist too. An unguarded `.map` here would reject the whole
// upgrade transaction, and since getDb() clears dbPromise on failure, every
// later retry would fail identically — the database would become permanently
// unopenable. Tolerate the malformed shape and pass the record through
// untouched instead; a record we cannot read is a record we must not rewrite.
function mapArray<T>(value: T[], mapper: (item: T) => T): T[] {
  return Array.isArray(value) ? value.map(mapper) : value;
}

function isRecord(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function migrateProgramExercise(
  exercise: ProgramExercise,
  context: ExerciseIdentityContext,
): ProgramExercise {
  if (!isRecord(exercise)) return exercise;
  if (exercise.canonicalExerciseId) {
    return {
      ...exercise,
      canonicalExerciseId: canonicalizeExplicitExerciseId(exercise.canonicalExerciseId, context),
    };
  }
  const resolved = resolveExerciseIdentity({
    kind: "stored-exercise",
    slotId: exercise.id,
    performedName: exercise.name,
  }, context);
  return resolved.specificity === "exact" && resolved.concreteExerciseId
    ? { ...exercise, canonicalExerciseId: resolved.concreteExerciseId }
    : exercise;
}

function migrateProgramDay(day: ProgramDay, context: ExerciseIdentityContext): ProgramDay {
  if (!isRecord(day)) return day;
  return {
    ...day,
    sections: mapArray(day.sections, (section) => (isRecord(section) ? {
      ...section,
      groups: mapArray(section.groups, (group) => (isRecord(group) ? {
        ...group,
        exercises: mapArray(group.exercises, (exercise) => migrateProgramExercise(exercise, context)),
      } : group)),
    } : section)),
  };
}

function migrateProgramReplacement(
  replacement: ProgramDocument["overrides"][number]["replacement"],
  context: ExerciseIdentityContext,
): ProgramDocument["overrides"][number]["replacement"] {
  if (Array.isArray(replacement)) {
    return replacement.map((day) => migrateProgramDay(day, context));
  }
  return migrateProgramDay(replacement, context);
}

export function migrateProgram(
  program: ProgramDocument,
  context: ExerciseIdentityContext,
): ProgramDocument {
  return {
    ...program,
    days: mapArray(program.days, (day) => migrateProgramDay(day, context)),
    overrides: mapArray(program.overrides, (override) => (isRecord(override) ? {
      ...override,
      replacement: migrateProgramReplacement(override.replacement, context),
    } : override)),
    ...(program.import ? {
      import: {
        ...program.import,
        warnings: mapArray(program.import.warnings, (warning) => (isRecord(warning) ? {
          ...warning,
          ...(warning.suggestions ? {
            suggestions: mapArray(warning.suggestions, (suggestion) => (isRecord(suggestion) ? {
              ...suggestion,
              exerciseId: canonicalizeExplicitExerciseId(suggestion.exerciseId, context),
            } : suggestion)),
          } : {}),
        } : warning)),
      },
    } : {}),
  };
}

function migrateLogEntry(
  entry: WorkoutLogEntry,
  context: ExerciseIdentityContext,
): WorkoutLogEntry {
  if (!isRecord(entry)) return entry;
  if (entry.canonicalExerciseId) {
    return {
      ...entry,
      canonicalExerciseId: canonicalizeExplicitExerciseId(entry.canonicalExerciseId, context),
    };
  }
  if (!entry.exerciseName) return entry;
  const resolved = resolveExerciseIdentity({
    kind: "stored-exercise",
    slotId: entry.exerciseId,
    performedName: entry.exerciseName,
  }, context);
  return resolved.specificity === "exact" && resolved.concreteExerciseId
    ? { ...entry, canonicalExerciseId: resolved.concreteExerciseId }
    : entry;
}

export function migrateLog(
  log: WorkoutLogDocument,
  context: ExerciseIdentityContext,
): WorkoutLogDocument {
  return {
    ...log,
    entries: mapArray(log.entries, (entry) => migrateLogEntry(entry, context)),
  };
}

function concreteOutcomesForToken(
  normalizedAlias: string,
  userExercises: readonly UserExerciseDocument[],
): Set<string> {
  const outcomes = new Set<string>();
  for (const exercise of exerciseCatalog) {
    if (
      normalizeExerciseName(exercise.name) === normalizedAlias ||
      exercise.aliases.some((alias) => normalizeExerciseName(alias) === normalizedAlias)
    ) {
      outcomes.add(exercise.id);
    }
  }
  for (const exercise of userExercises) {
    if (normalizeExerciseName(exercise.name) === normalizedAlias) outcomes.add(exercise.id);
  }
  return outcomes;
}

export function classifyAliases(
  aliases: readonly AliasDocument[],
  userExercises: readonly UserExerciseDocument[],
): AliasDocument[] {
  const context = createMigrationContext([], userExercises);
  const classified: AliasDocument[] = [];
  for (const alias of aliases) {
    const canonicalExerciseId = canonicalizeExplicitExerciseId(alias.canonicalExerciseId, context);
    const normalizedAlias = normalizeExerciseName(alias.alias);
    if (alias.provenance === "remembered") {
      classified.push({ ...alias, normalizedAlias, canonicalExerciseId, provenance: "remembered" });
      continue;
    }

    const prepared = prepareImportName(alias.alias, disambiguationsByNormalizedName);
    const disambiguation = disambiguationsByNormalizedName.get(prepared.normalizedName);
    if (
      !normalizedAlias ||
      prepared.hasAlternative ||
      disambiguation?.kind === "underspecified-name"
    ) {
      continue;
    }

    // Spec: retain and redirect only legacy aliases whose token still has one
    // unique concrete outcome. That single check is what deletes collisions
    // and removed noise (a prescription like "3x8 @ RPE 7" has zero
    // outcomes); no separate noise heuristic is needed, and any digit-based
    // one would wrongly delete the 70 shipped catalogue names that contain a
    // digit or degree sign ("90/90 Hamstring", "45° Side Bend", ...).
    const outcomes = concreteOutcomesForToken(normalizedAlias, userExercises);
    if (outcomes.size !== 1 || !outcomes.has(canonicalExerciseId)) continue;
    classified.push({ ...alias, normalizedAlias, canonicalExerciseId, provenance: "legacy-auto" });
  }
  return classified;
}

let dbPromise: Promise<IDBPDatabase<TrainerDb>> | undefined;
let dbInstance: IDBPDatabase<TrainerDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    let shouldDispatchIdentityChange = false;
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

        // v8 → v9: add promptPresets store. Create-only; no existing data to migrate.
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains("promptPresets")) {
            db.createObjectStore("promptPresets", { keyPath: "id" });
          }
        }

        // v9 → v10: persist normalization overrides, normalize every stored
        // catalogue reference in the same upgrade transaction, classify old
        // automatic aliases, and drop the unused derived metrics cache.
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
          const context = createMigrationContext(classifiedAliases, userExercises);

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
        dbInstance = undefined;
        dbPromise = undefined;
      },
    }).then((db) => {
      dbInstance = db;
      // Whatever open request was previously stuck behind another
      // connection (if any) has now resolved on its own — clear any
      // "blocked" banner the UI may be showing. No-op if nothing was
      // blocked.
      window.dispatchEvent(new CustomEvent("trainer-db-unblocked"));
      if (shouldDispatchIdentityChange) dispatchExerciseIdentityChanged();
      return db;
    }).catch((e) => {
      dbPromise = undefined; // let the next getDb() retry instead of re-throwing forever
      throw e;
    });
  }

  return dbPromise;
}

export function resetDbConnection() {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}
