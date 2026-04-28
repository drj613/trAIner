import type { ProgramDay, SectionType } from "./types";

const KNOWN_SECTION_TYPES: SectionType[] = [
  "warmup", "explosive", "strength", "power", "hypertrophy", "accessory",
  "metcon", "cardio", "conditioning", "rehab", "mobility", "cooldown", "training",
];

export function effectiveWeekNumber(day: ProgramDay): number {
  return day.weekNumber && day.weekNumber > 0 ? day.weekNumber : 1;
}

export function normalizeSectionType(raw: string): SectionType {
  const lower = raw.toLowerCase().trim() as SectionType;
  if (KNOWN_SECTION_TYPES.includes(lower)) return lower;
  return "training";
}

export function isRestDay(day: ProgramDay): boolean {
  return day.sections.length === 0;
}
