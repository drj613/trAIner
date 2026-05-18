import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

/**
 * Choose which day to render on Today.
 *
 *  - If a log was performed on `todayDate`, resume that day.
 *  - Otherwise advance to the day immediately after the most recent valid log.
 *  - Skip logs whose dayId no longer exists in `days` (handles days removed
 *    from the program after a log was written).
 *  - First-time / unresolved → `days[0]`.
 *  - `todayDate` is the local YYYY-MM-DD string used to detect "today".
 */
export function resolveNextDay(
  days: ProgramDay[],
  logs: WorkoutLogDocument[],
  todayDate: string,
): ProgramDay | undefined {
  if (days.length === 0) return undefined;

  const dayIds = new Set(days.map((d) => d.id));

  const todayLog = logs.find(
    (l) => l.performedAt.slice(0, 10) === todayDate && dayIds.has(l.dayId),
  );
  if (todayLog) {
    return days.find((d) => d.id === todayLog.dayId) ?? days[0];
  }

  const sortedLogs = [...logs].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const validLog = sortedLogs.find((log) => dayIds.has(log.dayId));
  if (validLog) {
    const idx = days.findIndex((d) => d.id === validLog.dayId);
    return days[(idx + 1) % days.length];
  }

  return days[0];
}
