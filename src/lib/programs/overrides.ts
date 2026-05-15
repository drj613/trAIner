import type { ProgramDay, ProgramDocument, ProgramOverride } from "./types";

export function getRenderableDays(program: ProgramDocument): ProgramDay[] {
  // M5: apply week-scope overrides first, then day-scope so day-level wins
  const sorted = [...program.overrides].sort((a, b) => {
    const rank = (scope: string) => (scope === "day" ? 1 : 0);
    return rank(a.scope) - rank(b.scope);
  });
  return sorted.reduce((days, override) => applyOverride(days, override), program.days);
}

function applyOverride(days: ProgramDay[], override: ProgramOverride): ProgramDay[] {
  // M6: normalize single replacement to array
  const replacements = Array.isArray(override.replacement) ? override.replacement : [override.replacement];

  if (override.scope === "week" && override.weekNumber !== undefined) {
    return days.map((day) => {
      if (day.weekNumber !== override.weekNumber) return day;
      const match = replacements.find((replacement) => replacement.dayNumber === day.dayNumber);
      // Preserve the slot's structural identity (id + week/day placement); the override only supplies content.
      return match ? { ...match, id: day.id, weekNumber: day.weekNumber, dayNumber: day.dayNumber } : day;
    });
  }

  if (override.scope === "day" && override.dayId) {
    return days.map((day) =>
      day.id === override.dayId
        ? { ...replacements[0], id: day.id, weekNumber: day.weekNumber, dayNumber: day.dayNumber }
        : day
    );
  }

  return days;
}
