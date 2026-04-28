import type { WorkoutLogDocument, WorkoutSetLog } from "@/lib/programs/types";

export type ExerciseSessionRow = {
  date: string;
  sets: string[];
  volume: number;
};

function formatSet(s: WorkoutSetLog): string {
  if (!s.weight) return s.reps ? `BWx${s.reps}` : "";
  return s.reps ? `${s.weight}x${s.reps}` : String(s.weight);
}

function setVolume(s: WorkoutSetLog): number {
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    const entry = log.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;

    rows.push({
      date: log.performedAt.slice(0, 10),
      sets: entry.sets.map(formatSet).filter(Boolean),
      volume: entry.sets.reduce((sum, s) => sum + setVolume(s), 0),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
