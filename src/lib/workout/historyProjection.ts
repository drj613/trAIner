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
import type { WorkoutLogDocument, WorkoutLogEntry } from "@/lib/programs/types";
import {
  deriveVolumeTrend,
  entryHasHistoryData,
  entrySetLabels,
  entryVolumeLb,
  formatSetLabel,
  setVolume,
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
  return JSON.stringify([entry.canonicalExerciseId ?? null, entry.exerciseId, entry.exerciseName ?? null]);
}

function performedAtOrder(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return right.localeCompare(left);
  return rightTime - leftTime;
}

/** Newest first, then logId, then entry order within the workout. */
function compareRows(left: ExerciseHistoryRow, right: ExerciseHistoryRow): number {
  return performedAtOrder(left.performedAt, right.performedAt)
    || left.logId.localeCompare(right.logId)
    || left.entryIndex - right.entryIndex;
}

/** Oldest first, keeping entry order within a workout so sets read forward. */
function compareRowsChronologically(left: ExerciseHistoryRow, right: ExerciseHistoryRow): number {
  return -performedAtOrder(left.performedAt, right.performedAt)
    || left.logId.localeCompare(right.logId)
    || left.entryIndex - right.entryIndex;
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
        performedName: entry.exerciseName,
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
    log.entries.forEach((entry, entryIndex) => {
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
          performedName: entry.exerciseName?.trim() || identity.displayLabel || entry.exerciseId,
          concreteExerciseId: identity.concreteExerciseId,
          movementId: identity.movementId,
          currentVersionLabel: identity.currentVersionLabel,
          sets: entrySetLabels(entry),
          note: entry.notes,
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
      label: latest.identity.movementName ?? latest.identity.displayLabel ?? latest.row.performedName,
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

    const allSets = chronological.flatMap((item) => item.entry.sets);
    const bestSet = allSets.reduce<typeof allSets[number] | undefined>(
      (best, candidate) => (best && setVolume(best) >= setVolume(candidate) ? best : candidate),
      undefined,
    );
    const lastSession = sessions[sessions.length - 1];

    versionSummaries.set(versionKey, {
      versionKey,
      concreteExerciseId: latest.identity.concreteExerciseId,
      familyKey: latest.familyKey,
      label: latest.identity.currentVersionLabel ?? latest.identity.displayLabel ?? latest.row.performedName,
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
