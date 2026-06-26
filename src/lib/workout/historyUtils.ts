import type { WorkoutLogDocument, WorkoutSetLog } from "@/lib/programs/types";
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
  return s.reps ? `${s.weight}${sep}${s.reps}` : `${s.weight}`;
}

function setVolume(s: WorkoutSetLog): number {
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  canonicalExerciseId?: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    const entry = log.entries.find((e) => {
      // Prefer canonical-id match when both sides supply one.
      if (canonicalExerciseId && e.canonicalExerciseId) {
        return e.canonicalExerciseId === canonicalExerciseId;
      }
      // Legacy / pre-canonical fallback: slot-id match.
      return e.exerciseId === exerciseId;
    });
    if (!entry) continue;

    rows.push({
      date: logLocalDate(log),
      sets: entry.sets.map((s) => formatSetLabel(s)).filter(Boolean),
      note: entry.notes,
      volume: entry.sets.reduce((sum, s) => sum + setVolume(s), 0),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
