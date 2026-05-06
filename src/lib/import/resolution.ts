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
  path: string;
  rawName: string;
  suggestions: ExerciseSuggestion[];
};

export type Resolution = {
  path: string;
  canonicalId: string;
};

export function extractUnresolvedExercises(
  warnings: ImportWarning[],
): ResolutionItem[] {
  const items: ResolutionItem[] = [];
  for (const w of warnings) {
    const rawName = w.rawName ?? w.message.split(" was imported")[0];
    // Only include exercise-import warnings (identified by rawName or message pattern)
    const isExerciseWarning =
      w.rawName !== undefined ||
      /^.+ was imported without a catalog match\.$/.test(w.message);
    if (!isExerciseWarning) continue;
    items.push({ path: w.path, rawName, suggestions: w.suggestions ?? [] });
  }
  return items;
}

export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.path, r.canonicalId]));

  function patchExercise(ex: ProgramExercise, path: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(path);
    if (!id) return ex;
    return { ...ex, canonicalExerciseId: id };
  }

  function patchGroup(g: ProgramGroup, path: string): ProgramGroup {
    return {
      ...g,
      exercises: g.exercises.map((ex, i) =>
        patchExercise(ex, `${path}.exercises.${i}`),
      ),
    };
  }

  function patchSection(s: ProgramSection, path: string): ProgramSection {
    return {
      ...s,
      groups: s.groups.map((g, i) => patchGroup(g, `${path}.groups.${i}`)),
    };
  }

  function patchDay(d: ProgramDay, index: number): ProgramDay {
    const dayPath = `days.${index + 1}`;
    return {
      ...d,
      sections: d.sections.map((s, i) =>
        patchSection(s, `${dayPath}.sections.${i}`),
      ),
    };
  }

  return { ...program, days: program.days.map((d, i) => patchDay(d, i)) };
}
