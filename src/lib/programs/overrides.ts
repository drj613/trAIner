import type { ProgramDay, ProgramDocument, ProgramOverride } from "./types";

export function getRenderableDays(program: ProgramDocument): ProgramDay[] {
  return program.overrides.reduce((days, override) => applyOverride(days, override), program.days);
}

function applyOverride(days: ProgramDay[], override: ProgramOverride): ProgramDay[] {
  const replacements = Array.isArray(override.replacement) ? override.replacement : [override.replacement];

  if (override.scope === "week" && override.weekNumber !== undefined) {
    return days.map((day) => {
      if (day.weekNumber !== override.weekNumber) return day;
      return replacements.find((replacement) => replacement.dayNumber === day.dayNumber) ?? day;
    });
  }

  if (override.scope === "day" && override.dayId) {
    return days.map((day) => (day.id === override.dayId ? replacements[0] : day));
  }

  return days;
}
