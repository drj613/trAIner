import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

/**
 * Choose which day to render on Today.
 *
 *  - Advance to the day immediately after the most recent COMPLETED log
 *    (one with `completedAt` set by the Finish button).
 *  - Skip logs whose dayId no longer exists in `days`.
 *  - First-time / no completed logs → `days[0]`.
 *
 * Resume of an in-progress workout falls out naturally: the autosave log
 * for the in-progress day has no `completedAt`, so the resolver returns
 * the day after the previous completed log — which is the in-progress day.
 */
export function resolveNextDay(
  days: ProgramDay[],
  logs: WorkoutLogDocument[],
  _todayDate: string,
): ProgramDay | undefined {
  if (days.length === 0) return undefined;

  const dayIds = new Set(days.map((d) => d.id));

  const completed = logs
    .filter((l) => l.completedAt && dayIds.has(l.dayId))
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));

  if (completed.length === 0) return days[0];

  const idx = days.findIndex((d) => d.id === completed[0].dayId);
  return days[(idx + 1) % days.length];
}
