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
 * Whether a log entry belongs in exercise history: at least one recorded set,
 * or an exercise note. A note-only entry is history the user wrote by hand, so
 * it must survive; an entry with no sets and no note (a skipped placeholder)
 * has nothing to show.
 */
export function entryHasHistoryData(entry: WorkoutLogEntry): boolean {
  return entry.sets.some(setHasData) || Boolean(entry.notes?.trim());
}

/** Display labels for an entry's sets, dropping labels with nothing in them. */
export function entrySetLabels(entry: WorkoutLogEntry, sep: string = "x"): string[] {
  return entry.sets.map((s) => formatSetLabel(s, sep)).filter(Boolean);
}

/** Tonnage of an entry in lb (kg sets converted). */
export function entryVolumeLb(entry: WorkoutLogEntry): number {
  return entry.sets.reduce((sum, s) => sum + setVolume(s), 0);
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
    for (const entry of log.entries) {
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
