/**
 * The one lossless, family-aware history projection.
 *
 * All-time history and the Today drawer both read from here so a single
 * classification rules both surfaces. Two invariants govern this module:
 *
 * 1. **Lossless.** Every data-bearing log entry becomes exactly one row.
 *    Workout logs are the sole history source of truth in a local-first app,
 *    so dropping an entry is data loss, not a display quirk. Entries combine
 *    only inside *summaries*, only for the same concrete version, and only
 *    within one workout log.
 * 2. **No storage reads.** The projection is a pure function of logs plus an
 *    identity context, so an identity-context change (a saved correction, a
 *    new alias) recomputes grouping without reloading logs.
 */

import {
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type ExerciseIdentityResult,
} from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import type { WorkoutLogDocument, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";
import {
  deriveVolumeTrend,
  entryHasHistoryData,
  entrySetLabels,
  entryNote,
  entryPerformedName,
  entryVolumeLb,
  formatSetLabel,
  readableSets,
  textOf,
  readableEntries,
  setVolume,
  setWeightInLb,
} from "./historyUtils";
import { logLocalDate } from "./localDate";

/** One logged exercise entry, addressable by (logId, entryIndex). */
export type ExerciseHistoryRow = {
  logId: string;
  entryIndex: number;
  performedAt: string;
  performedDate: string;
  performedName: string;
  concreteExerciseId?: string;
  movementId?: string;
  currentVersionLabel?: string;
  sets: string[];
  note?: string;
  volumeLb: number;
};

/**
 * Family-level facts only. A movement family deliberately carries no PR, best
 * set, or volume trend: those are not comparable across mechanically different
 * versions of the same movement.
 */
export type FamilyHistorySummary = {
  familyKey: string;
  movementId?: string;
  label: string;
  workoutCount: number;
  latestDate: string;
  latestPerformedAt: string;
  versionKeys: string[];
};

/** Performance metrics, which stay specific to one concrete version. */
export type VersionHistorySummary = {
  versionKey: string;
  concreteExerciseId?: string;
  familyKey: string;
  label: string;
  /** Distinct workout logs containing this version. */
  sessionCount: number;
  /** Rows folded into this version, kept so losslessness is checkable. */
  entryCount: number;
  /** One volume per workout log, oldest first; same-log entries summed. */
  sessionVolumesLb: number[];
  bestSetLabel?: string;
  lastSets: string[];
  lastDate: string;
  trend: "up" | "flat" | "down";
};

export type ExerciseHistoryProjection = {
  rows: ExerciseHistoryRow[];
  rowsByFamilyKey: ReadonlyMap<string, ExerciseHistoryRow[]>;
  rowsByVersionKey: ReadonlyMap<string, ExerciseHistoryRow[]>;
  familySummaries: ReadonlyMap<string, FamilyHistorySummary>;
  versionSummaries: ReadonlyMap<string, VersionHistorySummary>;
};

/**
 * Key for an identity the resolver could not tie to a concrete catalogue
 * version. `groupKey` on its own is not enough: for a stored exercise it is
 * `slot:<slotId>` (`src/lib/catalog/identity.ts:177-178`), derived from the slot
 * alone and ignoring the performed name, so two genuinely different exercises
 * logged into one slot — a legacy pre-canonical log plus one exercise swap
 * (`src/lib/workout/exerciseSwap.ts`) — would collapse into a single summary
 * carrying one exercise's name and the other's best set, and blend their volumes
 * into a trend that never happened. The resolver already distinguishes them
 * (`identityCacheKey` below keys on the performed name too); qualifying the key
 * the same way keeps that distinction instead of throwing it away here.
 *
 * Normalizing means casing and punctuation do not split one exercise in two.
 */
function unresolvedKey(identity: ExerciseIdentityResult): string {
  const normalized = identity.performedName ? normalizeExerciseName(identity.performedName) : "";
  return normalized ? `${identity.groupKey}#${normalized}` : identity.groupKey;
}

/** The history bucket an identity belongs to: its movement family, else itself. */
export function familyKeyForIdentity(identity: ExerciseIdentityResult): string {
  if (identity.movementId) return identity.movementId;
  // A concrete version identifies itself, so `exercise:<id>` needs no qualifier.
  if (identity.concreteExerciseId) return identity.groupKey;
  return unresolvedKey(identity);
}

/** The metrics bucket an identity belongs to: its concrete version, else itself. */
export function versionKeyForIdentity(identity: ExerciseIdentityResult): string {
  return identity.concreteExerciseId ?? unresolvedKey(identity);
}

/** Every row for the identity's whole movement family, newest first. */
export function rowsForIdentity(
  projection: ExerciseHistoryProjection,
  identity: ExerciseIdentityResult,
): ExerciseHistoryRow[] {
  return projection.rowsByFamilyKey.get(familyKeyForIdentity(identity)) ?? [];
}

/** Every row for one concrete version, newest first. */
export function rowsForVersion(
  projection: ExerciseHistoryProjection,
  identity: ExerciseIdentityResult,
): ExerciseHistoryRow[] {
  return projection.rowsByVersionKey.get(versionKeyForIdentity(identity)) ?? [];
}

type ProjectedEntry = {
  row: ExerciseHistoryRow;
  entry: WorkoutLogEntry;
  identity: ExerciseIdentityResult;
  familyKey: string;
  versionKey: string;
};

function identityCacheKey(entry: WorkoutLogEntry): string {
  return JSON.stringify([
    entry.canonicalExerciseId ?? null,
    entry.exerciseId,
    entryPerformedName(entry) ?? null,
  ]);
}

/**
 * Newest first, as a genuine total order.
 *
 * A hand-edited or foreign backup can carry a `performedAt` that does not parse.
 * Switching to a string comparison only when one side is unparseable made this
 * comparator intransitive across a mix of readable and unreadable timestamps,
 * and `Array.prototype.sort` over an intransitive comparator has
 * implementation-defined output. Unparseable now sorts as the oldest possible
 * instant and the string comparison is the tiebreak on every path, so the order
 * is consistent and reproducible whatever the input order.
 */
function instantOf(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? -Infinity : time;
}

function performedAtOrder(left: string, right: string): number {
  const leftTime = instantOf(left);
  const rightTime = instantOf(right);
  // Compared as an ordering rather than a subtraction, because two unparseable
  // timestamps are both -Infinity and the difference would be NaN.
  if (leftTime !== rightTime) return leftTime < rightTime ? 1 : -1;
  // `String(...)` because a corrupt log can hold a non-string here, and a
  // record we cannot read must not take readable records down with it.
  return String(right).localeCompare(String(left));
}

/** Newest first, then logId, then entry order within the workout. */
function compareRows(left: ExerciseHistoryRow, right: ExerciseHistoryRow): number {
  return performedAtOrder(left.performedAt, right.performedAt)
    || left.logId.localeCompare(right.logId)
    || left.entryIndex - right.entryIndex;
}

/**
 * Oldest first, keeping entry order within a workout so sets read forward.
 *
 * The `logId` tiebreak is what makes same-workout rows adjacent, which the
 * session-bucketing loop below depends on. It is load-bearing, not redundant
 * with the `compareRows` sort that precedes it: when two workouts share one
 * `performedAt` instant, the first two keys tie for rows from *different* logs,
 * so without this key `entryIndex` interleaves them (`l-x#0, l-y#0, l-x#1,
 * l-y#1`) and one workout is bucketed as several sessions. Measured — deleting
 * this line fails `keeps same-workout rows adjacent so one workout is one
 * session`.
 */
function compareRowsChronologically(left: ExerciseHistoryRow, right: ExerciseHistoryRow): number {
  return -performedAtOrder(left.performedAt, right.performedAt)
    || left.logId.localeCompare(right.logId)
    || left.entryIndex - right.entryIndex;
}

/**
 * Total order for "best set", strongest first: volume descending, then load
 * descending, then reps descending, then the earliest set.
 *
 * Volume stays the headline metric. Load breaks a volume tie the conventional
 * strength way — of `100x10` and `200x5`, both 1,000 lb, the 200 is the heavier
 * set. Reps then rescue bodyweight work, where every set has volume 0 and no
 * load, so ranking by volume alone always returned the *first* set and reported
 * `BWx5` as better than `BWx8`. Load is compared in pounds so a kg set is not
 * read as lighter than its raw number suggests. Falling through to the earliest
 * set keeps the result deterministic for genuinely identical sets.
 */
function compareSetsByStrength(left: WorkoutSetLog, right: WorkoutSetLog): number {
  return setVolume(right) - setVolume(left)
    || setWeightInLb(right) - setWeightInLb(left)
    || (right.reps ?? 0) - (left.reps ?? 0);
}

/**
 * A summary label as text, or `undefined` when there is nothing there, so an
 * absent `displayLabel` falls through to the next candidate rather than becoming
 * an empty label — `textOf` alone returns `""`, which is not nullish.
 *
 * Measured: replacing this with plain `textOf` kills 0 tests, and by
 * construction it cannot be killed. For a stored exercise `displayLabel` is
 * absent only when the performed name, canonical id and slot id are all absent,
 * and then `row.performedName` is `""` as well, so the two branches agree. The
 * nullish check is here so the fall-through survives a change to either
 * fallback, not because a current input distinguishes them.
 */
function labelOf(value: unknown): string | undefined {
  return value == null ? undefined : textOf(value);
}

function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function projectExerciseHistory(
  logs: readonly WorkoutLogDocument[],
  context: ExerciseIdentityContext,
): ExerciseHistoryProjection {
  const identityCache = new Map<string, ExerciseIdentityResult>();
  const resolveEntry = (entry: WorkoutLogEntry): ExerciseIdentityResult => {
    const key = identityCacheKey(entry);
    const cached = identityCache.get(key);
    if (cached) return cached;
    const identity = resolveExerciseIdentity(
      {
        kind: "stored-exercise",
        canonicalExerciseId: entry.canonicalExerciseId,
        slotId: entry.exerciseId,
        performedName: entryPerformedName(entry),
      },
      context,
    );
    identityCache.set(key, identity);
    return identity;
  };

  const projected: ProjectedEntry[] = [];

  for (const log of logs) {
    const performedDate = logLocalDate(log);
    // Iterate every entry — never `find`. One workout can log the same
    // exercise twice, and the second entry is real recorded work.
    readableEntries(log).forEach(({ entry, entryIndex }) => {
      if (!entryHasHistoryData(entry)) return;
      const identity = resolveEntry(entry);
      projected.push({
        entry,
        identity,
        familyKey: familyKeyForIdentity(identity),
        versionKey: versionKeyForIdentity(identity),
        row: {
          logId: log.id,
          entryIndex,
          performedAt: log.performedAt,
          performedDate,
          // The stored name is what the user logged; corrections never rewrite it.
          // `textOf` on the fallbacks because a corrupt log can hold a
          // non-string slot id or display label, and the row type promises a
          // string.
          performedName: entryPerformedName(entry)?.trim()
            || textOf(identity.displayLabel)
            || textOf(entry.exerciseId),
          concreteExerciseId: identity.concreteExerciseId,
          movementId: identity.movementId,
          currentVersionLabel: identity.currentVersionLabel,
          sets: entrySetLabels(entry),
          note: entryNote(entry),
          volumeLb: entryVolumeLb(entry),
        },
      });
    });
  }

  projected.sort((left, right) => compareRows(left.row, right.row));

  const rowsByFamilyKey = new Map<string, ExerciseHistoryRow[]>();
  const rowsByVersionKey = new Map<string, ExerciseHistoryRow[]>();
  const familyGroups = new Map<string, ProjectedEntry[]>();
  const versionGroups = new Map<string, ProjectedEntry[]>();

  for (const item of projected) {
    pushInto(rowsByFamilyKey, item.familyKey, item.row);
    pushInto(rowsByVersionKey, item.versionKey, item.row);
    pushInto(familyGroups, item.familyKey, item);
    pushInto(versionGroups, item.versionKey, item);
  }

  const familySummaries = new Map<string, FamilyHistorySummary>();
  for (const [familyKey, items] of familyGroups) {
    const latest = items[0];
    familySummaries.set(familyKey, {
      familyKey,
      movementId: latest.identity.movementId,
      // `labelOf` for the same reason as the row label: `displayLabel` falls
      // back to the stored slot id, which a corrupt log can hold as a
      // non-string.
      label: latest.identity.movementName
        ?? labelOf(latest.identity.displayLabel)
        ?? latest.row.performedName,
      workoutCount: new Set(items.map((item) => item.row.logId)).size,
      latestDate: latest.row.performedDate,
      latestPerformedAt: latest.row.performedAt,
      versionKeys: [...new Set(items.map((item) => item.versionKey))],
    });
  }

  const versionSummaries = new Map<string, VersionHistorySummary>();
  for (const [versionKey, items] of versionGroups) {
    const latest = items[0];
    // Oldest first, so session volumes read forward in time for the trend.
    const chronological = [...items].sort((left, right) =>
      compareRowsChronologically(left.row, right.row),
    );

    // One bucket per workout log: same-version entries in one workout are one
    // session for metrics, while both rows stay in the combined table above.
    const sessions: { logId: string; performedDate: string; volumeLb: number; sets: string[] }[] = [];
    for (const item of chronological) {
      const current = sessions[sessions.length - 1];
      if (current && current.logId === item.row.logId) {
        current.volumeLb += item.row.volumeLb;
        current.sets.push(...item.row.sets);
        continue;
      }
      sessions.push({
        logId: item.row.logId,
        performedDate: item.row.performedDate,
        volumeLb: item.row.volumeLb,
        sets: [...item.row.sets],
      });
    }

    const allSets = chronological.flatMap((item) => readableSets(item.entry));
    // Keeping the incumbent unless the candidate is strictly stronger is what
    // resolves a full tie to the earliest set.
    const bestSet = allSets.reduce<typeof allSets[number] | undefined>(
      (best, candidate) => (best && compareSetsByStrength(best, candidate) <= 0 ? best : candidate),
      undefined,
    );
    const lastSession = sessions[sessions.length - 1];

    versionSummaries.set(versionKey, {
      versionKey,
      concreteExerciseId: latest.identity.concreteExerciseId,
      familyKey: latest.familyKey,
      label: latest.identity.currentVersionLabel
        ?? labelOf(latest.identity.displayLabel)
        ?? latest.row.performedName,
      sessionCount: sessions.length,
      entryCount: items.length,
      sessionVolumesLb: sessions.map((session) => session.volumeLb),
      bestSetLabel: bestSet ? formatSetLabel(bestSet) || undefined : undefined,
      lastSets: lastSession.sets,
      lastDate: lastSession.performedDate,
      trend: deriveVolumeTrend(sessions.map((session) => session.volumeLb)),
    });
  }

  return {
    rows: projected.map((item) => item.row),
    rowsByFamilyKey,
    rowsByVersionKey,
    familySummaries,
    versionSummaries,
  };
}
