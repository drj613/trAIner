import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
} from "@/lib/programs/types";

export const CUSTOM_ID = "__custom__";

const AUTO_CUSTOM_SECTION_TYPES = new Set(["warmup", "cooldown"]);
const AUTO_RESOLVE_THRESHOLD = 0.65;

export type ResolutionItem = {
  path: string;
  rawName: string;
  sectionType: string;
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
    const isExerciseWarning =
      w.rawName !== undefined ||
      /^.+ was imported without a catalog match\.$/.test(w.message);
    if (!isExerciseWarning) continue;
    items.push({
      path: w.path,
      rawName,
      sectionType: w.sectionType ?? "strength",
      suggestions: w.suggestions ?? [],
    });
  }
  return items;
}

export function buildInitialResolutions(
  items: ResolutionItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (AUTO_CUSTOM_SECTION_TYPES.has(item.sectionType) || item.suggestions.length === 0) {
      result[item.path] = CUSTOM_ID;
    } else if (item.suggestions[0].score >= AUTO_RESOLVE_THRESHOLD) {
      result[item.path] = item.suggestions[0].exerciseId;
    }
  }
  return result;
}

export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.path, r.canonicalId]));

  function patchExercise(ex: ProgramExercise, path: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(path);
    if (!id || id === CUSTOM_ID) return ex;
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

  function patchDay(d: ProgramDay, _index: number): ProgramDay {
    const dayPath = `days.${d.dayNumber}`;
    return {
      ...d,
      sections: d.sections.map((s, i) =>
        patchSection(s, `${dayPath}.sections.${i}`),
      ),
    };
  }

  return { ...program, days: program.days.map((d, i) => patchDay(d, i)) };
}
