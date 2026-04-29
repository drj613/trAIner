import type { ProgramDay } from "@/lib/programs/types";

export type WeekRow = {
  weekNumber: number;
  days: ProgramDay[];
};

export function buildWeekGrid(days: ProgramDay[]): WeekRow[] {
  const map = new Map<number, ProgramDay[]>();

  for (const day of days) {
    const week = day.weekNumber ?? 1;
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(day);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, weekDays]) => ({
      weekNumber,
      days: weekDays.sort((a, b) => a.dayNumber - b.dayNumber),
    }));
}
