import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

/**
 * Choose which day to render on Today.
 *
 *  - Return the first day (in routine order) of the current pass that has
 *    not been completed yet, so doing days out of order (e.g. day 4 then
 *    day 3) still resolves to the next incomplete day rather than
 *    "most recent + 1".
 *  - A "pass" is tracked per day by counting COMPLETED logs (those with
 *    `completedAt`, which the Finish/Skip actions set). When every day has
 *    been completed the same number of times, a new pass starts at days[0].
 *  - Skip logs whose dayId no longer exists in `days`.
 *  - First-time / no completed logs → `days[0]`.
 *
 * Resume of an in-progress workout falls out naturally: the autosave log
 * for the in-progress day has no `completedAt`, so that day is still
 * "incomplete" and the resolver returns it.
 */
export function resolveNextDay(
  days: ProgramDay[],
  logs: WorkoutLogDocument[],
  _todayDate: string,
): ProgramDay | undefined {
  if (days.length === 0) return undefined;

  const completions = new Map<string, number>(days.map((d) => [d.id, 0]));
  for (const l of logs) {
    if (!l.completedAt) continue;
    const count = completions.get(l.dayId);
    if (count !== undefined) completions.set(l.dayId, count + 1);
  }

  const currentPass = Math.min(...completions.values());
  return days.find((d) => completions.get(d.id) === currentPass);
}
