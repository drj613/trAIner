import type { ProgramDay, SectionType } from "./types";
import { SECTION_TYPES } from "./types";

export function effectiveWeekNumber(day: ProgramDay): number {
  return day.weekNumber && day.weekNumber > 0 ? day.weekNumber : 1;
}

export function normalizeSectionType(raw: string): SectionType {
  const lower = raw.toLowerCase().trim();
  if ((SECTION_TYPES as readonly string[]).includes(lower)) {
    return lower as SectionType;
  }
  return "training";
}

export function isRestDay(day: ProgramDay): boolean {
  return day.sections.length === 0;
}
