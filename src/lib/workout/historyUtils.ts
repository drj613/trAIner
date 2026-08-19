import type { WorkoutLogDocument, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";
import { logLocalDate } from "./localDate";

export type ExerciseSessionRow = {
  date: string;
  sets: string[];
  note?: string;
  volume: number;
};

/**
 * Label a logged set for display. Returns the raw cell verbatim when the value
 * was unparseable free text (e.g. "2.5kg x10", "40s hold", "skip"); otherwise
 * formats the numeric weight/reps with `sep` between them ("x" in the drawer,
 * "×" on the analysis page).
 */
export function formatSetLabel(s: WorkoutSetLog, sep: string = "x"): string {
  if (s.rawCell && s.rawCell.trim()) return s.rawCell;
  if (!s.weight) return s.reps ? `BW${sep}${s.reps}` : "";
  const w = s.unit === "kg" ? `${s.weight}kg` : `${s.weight}`;
  return s.reps ? `${w}${sep}${s.reps}` : w;
}

const KG_TO_LB = 2.2046226218;

/** Logged weight normalized to lb, so kg and lb sets aggregate coherently. */
export function setWeightInLb(s: WorkoutSetLog): number {
  return (s.weight ?? 0) * (s.unit === "kg" ? KG_TO_LB : 1);
}

/** Tonnage of a set in lb (kg sets converted). */
export function setVolume(s: WorkoutSetLog): number {
  return setWeightInLb(s) * (s.reps ?? 0);
}

/**
 * Whether a set carries anything the user actually recorded. `rpe` and set
 * notes count even though no current writer produces them alone: a set we can
 * read but do not display is still recorded work, and history must not drop it.
 */
export function setHasData(s: WorkoutSetLog): boolean {
  return Boolean(s.rawCell?.trim())
    || s.weight != null
    || s.reps != null
    || s.rpe != null
    || Boolean(s.notes?.trim());
}

/**
 * A log entry's readable sets. `sets` that is present but not an array is data
 * we cannot render and must not drop: `src/lib/storage/appDb.ts:186-195` keeps
 * such a log on purpose, because it "may be standing in for real sets we have no
 * way to recover", so those entries reach this module and one of them must never
 * remove another exercise's readable history from view.
 */
function readableSets(entry: WorkoutLogEntry): readonly WorkoutSetLog[] {
  return Array.isArray(entry.sets) ? entry.sets : [];
}

/**
 * Whether `sets` is present but unreadable. Same rule as `unreadableValue` in
 * `src/lib/storage/migrations/v10Identity.ts:158` — absent (`undefined`/`null`)
 * is the legitimate shape of an entry with nothing logged, while anything else
 * that is not our array is unreadable and therefore counts as data-bearing. The
 * two definitions encode one rule; the duplication is forced by this module's
 * no-storage-import seam (pinned by `historyProjection.test.ts`'s import scan),
 * not an oversight.
 */
function setsUnreadable(entry: WorkoutLogEntry): boolean {
  return entry.sets !== undefined && entry.sets !== null && !Array.isArray(entry.sets);
}

/**
 * Whether a log entry belongs in exercise history: at least one recorded set,
 * or an exercise note. A note-only entry is history the user wrote by hand, so
 * it must survive; an entry with no sets and no note (a skipped placeholder)
 * has nothing to show. Sets we cannot read count as recorded work, so the entry
 * still earns a row (with no set labels and no volume) rather than vanishing.
 */
export function entryHasHistoryData(entry: WorkoutLogEntry): boolean {
  return setsUnreadable(entry)
    || readableSets(entry).some(setHasData)
    || Boolean(entry.notes?.trim());
}

/** Display labels for an entry's sets, dropping labels with nothing in them. */
export function entrySetLabels(entry: WorkoutLogEntry, sep: string = "x"): string[] {
  return readableSets(entry).map((s) => formatSetLabel(s, sep)).filter(Boolean);
}

/** Tonnage of an entry in lb (kg sets converted). */
export function entryVolumeLb(entry: WorkoutLogEntry): number {
  return readableSets(entry).reduce((sum, s) => sum + setVolume(s), 0);
}

/** A log entry paired with its position in the stored `entries` array. */
export type IndexedLogEntry = { entry: WorkoutLogEntry; entryIndex: number };

/**
 * The entries of a log we can actually read, each keeping its stored position.
 *
 * `src/lib/storage/appDb.ts:186-195` deliberately retains a log whose `entries`
 * is not an array and whose elements are not records, and the plan's v7 ruling
 * retains a log whose only entry is `null` — in both cases because the
 * unreadable value may stand in for real sets. Those logs therefore exist in
 * storage by design, and one of them must never remove another workout's
 * readable history from view.
 *
 * The index is carried through rather than recomputed after filtering, because
 * a row's identity is `(logId, entryIndex)` against the stored array; skipping
 * an unreadable element must not renumber the ones after it.
 */
export function readableEntries(log: WorkoutLogDocument): IndexedLogEntry[] {
  if (!Array.isArray(log.entries)) return [];
  const readable: IndexedLogEntry[] = [];
  log.entries.forEach((entry, entryIndex) => {
    // Same shape rule as `isRecord` in `v10Identity.ts:148`: an array-shaped
    // entry is not a record either.
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      readable.push({ entry, entryIndex });
    }
  });
  return readable;
}

/**
 * Volume trend over chronologically ordered session volumes: the mean of the
 * last three sessions against the three before them, with a 3% dead band so
 * ordinary noise reads as flat.
 */
export function deriveVolumeTrend(volumes: readonly number[]): "up" | "flat" | "down" {
  if (volumes.length < 3) return "flat";
  const recent = volumes.slice(-3);
  const prior = volumes.slice(-6, -3);
  if (prior.length === 0) return "flat";
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const recentAverage = average(recent);
  const priorAverage = average(prior);
  if (recentAverage > priorAverage * 1.03) return "up";
  if (recentAverage < priorAverage * 0.97) return "down";
  return "flat";
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  canonicalExerciseId?: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    // Every matching entry, never `find`: one workout can log the same
    // exercise twice (a top set plus a back-off block), and dropping the
    // second entry would silently lose recorded work.
    for (const { entry } of readableEntries(log)) {
      const matches = canonicalExerciseId && entry.canonicalExerciseId
        // Prefer canonical-id match when both sides supply one.
        ? entry.canonicalExerciseId === canonicalExerciseId
        // Legacy / pre-canonical fallback: slot-id match.
        : entry.exerciseId === exerciseId;
      if (!matches) continue;

      rows.push({
        date: logLocalDate(log),
        sets: entrySetLabels(entry),
        note: entry.notes,
        volume: entryVolumeLb(entry),
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
