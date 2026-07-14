import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
  ProgramOverride,
} from "@/lib/programs/types";
import { baseExercisePath, overrideExercisePath } from "@/lib/import/paths";
import { getOverrideReplacementDays } from "@/lib/programs/overrides";
import { normalizeExerciseName } from "@/lib/catalog/normalize";

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

export type AliasSaveInput = { alias: string; canonicalExerciseId: string };

/**
 * Collapses resolved items down to one alias-save per normalizedAlias. A
 * week-4 deload/override day can reuse the same exercise name as a base
 * day, producing multiple resolved items with the same rawName; saving
 * each once avoids redundant writes and a same-key race when saves run
 * concurrently (aliases' `by-normalized-alias` index in appDb.ts is
 * unique).
 *
 * CONFLICT HANDLING: the global alias table is a permanent "this raw name →
 * this canonical exercise" memory used to auto-resolve FUTURE imports. If the
 * same normalized name resolved to DIFFERENT canonical ids across occurrences
 * (e.g. an ambiguous "Press" mapped to bench in one slot and overhead in
 * another), we must NOT silently persist an arbitrary winner — that would
 * poison every later import of that name. Conflicting names are dropped from
 * the global save entirely. The imported program is unaffected: each
 * occurrence's own choice is applied to the program by applyResolutions; only
 * the global alias write is skipped for the conflicting name.
 */
export function dedupeAliasResolutions(
  resolvedItems: ResolutionItem[],
  resolutions: Record<string, string>,
): AliasSaveInput[] {
  const byNormalizedAlias = new Map<string, { input: AliasSaveInput; conflict: boolean }>();
  for (const item of resolvedItems) {
    const normalized = normalizeExerciseName(item.rawName);
    const canonicalExerciseId = resolutions[item.path];
    const existing = byNormalizedAlias.get(normalized);
    if (!existing) {
      byNormalizedAlias.set(normalized, {
        input: { alias: item.rawName, canonicalExerciseId },
        conflict: false,
      });
    } else if (existing.input.canonicalExerciseId !== canonicalExerciseId) {
      existing.conflict = true;
    }
  }
  return [...byNormalizedAlias.values()].filter((e) => !e.conflict).map((e) => e.input);
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
  // Populated ONLY when an exercise is successfully patched (a resolution
  // existed for its path and it didn't already have a canonicalExerciseId).
  // Used below to drop exactly those warnings — a failed/absent resolution
  // must leave its warning in place.
  const resolvedPaths = new Set<string>();

  function patchExercise(ex: ProgramExercise, path: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(path);
    if (!id || id === CUSTOM_ID) return ex;
    resolvedPaths.add(path);
    return { ...ex, canonicalExerciseId: id };
  }

  // buildPath maps (sectionIndex, groupIndex, exerciseIndex) -> warning/
  // resolution path. Callers bind this to either baseExercisePath or
  // overrideExercisePath so base and override traversal share the exact
  // same patch logic below.
  function patchGroup(
    g: ProgramGroup,
    buildPath: (sectionIndex: number, groupIndex: number, exerciseIndex: number) => string,
    sectionIndex: number,
    groupIndex: number,
  ): ProgramGroup {
    return {
      ...g,
      exercises: g.exercises.map((ex, i) =>
        patchExercise(ex, buildPath(sectionIndex, groupIndex, i)),
      ),
    };
  }

  function patchSection(
    s: ProgramSection,
    buildPath: (sectionIndex: number, groupIndex: number, exerciseIndex: number) => string,
    sectionIndex: number,
  ): ProgramSection {
    return {
      ...s,
      groups: s.groups.map((g, i) => patchGroup(g, buildPath, sectionIndex, i)),
    };
  }

  function patchDay(
    d: ProgramDay,
    buildPath: (sectionIndex: number, groupIndex: number, exerciseIndex: number) => string,
  ): ProgramDay {
    return {
      ...d,
      sections: d.sections.map((s, i) => patchSection(s, buildPath, i)),
    };
  }

  const ambiguousDayGroups = findAmbiguousDayGroups(program.days);
  const days = program.days.map((d) => {
    // Duplicate base day numbers make this day's exercise paths ambiguous
    // (two different exercises could collide on the same path). Skip
    // resolution entirely rather than risk patching the wrong exercise.
    if (ambiguousDayGroups.has(dayGroupKey(d))) return d;
    return patchDay(d, (sectionIndex, groupIndex, exerciseIndex) =>
      baseExercisePath(d.dayNumber, d.templateWeek, sectionIndex, groupIndex, exerciseIndex),
    );
  });

  function patchOverride(override: ProgramOverride, overrideIndex: number): ProgramOverride {
    const replacementDays = getOverrideReplacementDays(override);
    // Ambiguity is scoped to this override's own replacement days — the
    // overrideIndex prefix already keeps different overrides' paths apart.
    const ambiguousInOverride = findAmbiguousDayGroups(replacementDays);
    const patchedDays = replacementDays.map((d) => {
      if (ambiguousInOverride.has(dayGroupKey(d))) return d;
      return patchDay(d, (sectionIndex, groupIndex, exerciseIndex) =>
        overrideExercisePath(overrideIndex, d.dayNumber, d.templateWeek, sectionIndex, groupIndex, exerciseIndex),
      );
    });
    // Preserve the stored shape: single replacement stays single, array
    // replacement stays an array. Never rewrite it to the other shape.
    const replacement = Array.isArray(override.replacement) ? patchedDays : patchedDays[0];
    return { ...override, replacement };
  }

  const overrides = program.overrides.map((o, i) => patchOverride(o, i));

  const importSection = program.import
    ? { import: { ...program.import, warnings: program.import.warnings.filter((w) => !resolvedPaths.has(w.path)) } }
    : {};

  return { ...program, days, overrides, ...importSection };
}
