import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
} from "@/lib/programs/types";

export type ResolutionItem = {
  rawName: string;
  suggestions: ExerciseSuggestion[];
};

export type Resolution = {
  rawName: string;
  canonicalId: string;
};

export function extractUnresolvedExercises(
  warnings: ImportWarning[],
): ResolutionItem[] {
  const items: ResolutionItem[] = [];
  for (const w of warnings) {
    if (!w.suggestions || w.suggestions.length === 0) continue;
    const match = w.message.match(/^(.+) was imported without a catalog match\.$/);
    if (!match) continue;
    items.push({ rawName: match[1], suggestions: w.suggestions });
  }
  return items;
}

export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.rawName, r.canonicalId]));

  function patchExercise(ex: ProgramExercise): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(ex.name);
    if (!id) return ex;
    return { ...ex, canonicalExerciseId: id };
  }

  function patchGroup(g: ProgramGroup): ProgramGroup {
    return { ...g, exercises: g.exercises.map(patchExercise) };
  }

  function patchSection(s: ProgramSection): ProgramSection {
    return { ...s, groups: s.groups.map(patchGroup) };
  }

  function patchDay(d: ProgramDay): ProgramDay {
    return { ...d, sections: d.sections.map(patchSection) };
  }

  return { ...program, days: program.days.map(patchDay) };
}
