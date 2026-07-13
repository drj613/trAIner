import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
} from "@/lib/programs/types";
import { baseExercisePath } from "@/lib/import/paths";

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

// A day number is ambiguous within its week when two or more base days
// declared the same number (e.g. `[{day:3},{day:3}]`). Legitimate weekly
// expansion also produces multiple ProgramDay entries sharing a dayNumber,
// but those are distinguished by weekNumber, so they are never ambiguous.
function dayGroupKey(day: ProgramDay): string {
  return `${day.weekNumber ?? "base"}:${day.dayNumber}`;
}

function findAmbiguousDayGroups(days: ProgramDay[]): Set<string> {
  const counts = new Map<string, number>();
  for (const day of days) {
    const key = dayGroupKey(day);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ambiguous = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) ambiguous.add(key);
  }
  return ambiguous;
}

export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.path, r.canonicalId]));
  const ambiguousDayGroups = findAmbiguousDayGroups(program.days);

  function patchExercise(ex: ProgramExercise, path: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(path);
    if (!id || id === CUSTOM_ID) return ex;
    return { ...ex, canonicalExerciseId: id };
  }

  function patchGroup(g: ProgramGroup, dayNumber: number, sectionIndex: number, groupIndex: number): ProgramGroup {
    return {
      ...g,
      exercises: g.exercises.map((ex, i) =>
        patchExercise(ex, baseExercisePath(dayNumber, sectionIndex, groupIndex, i)),
      ),
    };
  }

  function patchSection(s: ProgramSection, dayNumber: number, sectionIndex: number): ProgramSection {
    return {
      ...s,
      groups: s.groups.map((g, i) => patchGroup(g, dayNumber, sectionIndex, i)),
    };
  }

  function patchDay(d: ProgramDay): ProgramDay {
    // Duplicate base day numbers make this day's exercise paths ambiguous
    // (two different exercises could collide on the same path). Skip
    // resolution entirely rather than risk patching the wrong exercise.
    if (ambiguousDayGroups.has(dayGroupKey(d))) return d;
    return {
      ...d,
      sections: d.sections.map((s, i) => patchSection(s, d.dayNumber, i)),
    };
  }

  return { ...program, days: program.days.map((d) => patchDay(d)) };
}
