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

// One import occurrence needing a decision. `path` is the AUTHORITATIVE
// address — grouping is a presentation convenience, and patching always goes
// back through these paths (see applyResolutions). Two occurrences that share
// a name are never collapsed into one identity.
export type ResolutionOccurrence = {
  path: string;
  rawName: string;
  kind: "underspecified" | "unmatched";
  candidates: ExerciseSuggestion[];
};

// A derived (never persisted) view: every occurrence sharing a resolution kind
// and a normalized raw name, so the user makes ONE decision that fans out to
// all of them. `remember` starts false — an ordinary grouped choice is local
// to this import, and only an explicit "Remember this interpretation" marks
// the group for alias persistence.
export type ResolutionGroup = {
  groupKey: string;
  normalizedRawName: string;
  kind: "underspecified" | "unmatched";
  occurrences: ResolutionOccurrence[];
  occurrenceCount: number;
  remember: boolean;
};

// Shared by extractUnresolvedExercises and groupResolutionOccurrences so the
// two surfaces can never disagree about which warnings are exercise
// resolutions. Structural warnings (duplicate day number, unsupported nested
// override variant, unknown section type) carry no `rawName` and never match
// the legacy message shape, so they stay out of both — and, because neither
// function mutates `warnings`, they survive untouched in the program.
function exerciseWarningName(warning: ImportWarning): string | undefined {
  if (warning.rawName !== undefined) return warning.rawName;
  // Warnings persisted before `rawName` existed: recover the name from the
  // one message shape the old parser produced.
  if (/^.+ was imported without a catalog match\.$/.test(warning.message)) {
    return warning.message.split(" was imported")[0];
  }
  return undefined;
}

export function extractUnresolvedExercises(
  warnings: ImportWarning[],
): ResolutionItem[] {
  const items: ResolutionItem[] = [];
  for (const w of warnings) {
    const rawName = exerciseWarningName(w);
    if (rawName === undefined) continue;
    items.push({
      path: w.path,
      rawName,
      sectionType: w.sectionType ?? "strength",
      suggestions: w.suggestions ?? [],
    });
  }
  return items;
}

/**
 * Groups the occurrences that still need a decision by
 * `${kind}:${normalizeExerciseName(rawName)}`.
 *
 * Kind is part of the key on purpose: an underspecified `back squat` (a
 * movement whose concrete version is missing) and an unmatched `back squat`
 * (no identity at all) offer different choices, so they must not share one
 * selector even though their normalized text is identical.
 *
 * Group order is first-appearance order and occurrence order is warning order,
 * both of which follow the parse walk (base days, then their variants, then
 * override replacement days). No path is ever dropped or merged: a repeated
 * name FANS OUT to every path, and structural safeguards stay authoritative —
 * `applyResolutions` still refuses to patch a day whose path is ambiguous, so
 * a grouped choice cannot bypass them.
 *
 * A warning with no `resolutionKind` predates the tri-state matcher and counts
 * as `unmatched`; that is the only kind the old two-state matcher produced.
 */
export function groupResolutionOccurrences(warnings: ImportWarning[]): ResolutionGroup[] {
  const groups = new Map<string, ResolutionGroup>();
  for (const warning of warnings) {
    const rawName = exerciseWarningName(warning);
    if (rawName === undefined) continue;
    const kind = warning.resolutionKind ?? "unmatched";
    const normalizedRawName = normalizeExerciseName(rawName);
    const groupKey = `${kind}:${normalizedRawName}`;
    const occurrence: ResolutionOccurrence = {
      path: warning.path,
      rawName,
      kind,
      candidates: warning.suggestions ?? [],
    };
    const existing = groups.get(groupKey);
    if (existing) {
      existing.occurrences.push(occurrence);
      existing.occurrenceCount = existing.occurrences.length;
      continue;
    }
    groups.set(groupKey, {
      groupKey,
      normalizedRawName,
      kind,
      occurrences: [occurrence],
      occurrenceCount: 1,
      remember: false,
    });
  }
  return [...groups.values()];
}

/**
 * Pre-fills only the decisions that are NOT a catalogue-identity choice:
 * warmup/cooldown items and items with no suggestion at all become custom
 * exercises, exactly as before.
 *
 * It deliberately does NOT pick a concrete exercise. Fuzzy similarity is
 * suggestion-only, so an underspecified set is never auto-selected and a fuzzy
 * suggestion is never finalized just because it scores highly (the old `0.65`
 * threshold did both, which silently answered the very question the
 * disambiguation flow exists to ask — and then persisted that guess as a
 * global alias).
 */
export function buildInitialResolutions(
  items: ResolutionItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (AUTO_CUSTOM_SECTION_TYPES.has(item.sectionType) || item.suggestions.length === 0) {
      result[item.path] = CUSTOM_ID;
    }
  }
  return result;
}

export type AliasSaveInput = {
  alias: string;
  canonicalExerciseId: string;
  provenance: "remembered";
};

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
        input: { alias: item.rawName, canonicalExerciseId, provenance: "remembered" },
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

  // path -> rawName, built from the pre-filter warning set (warnings are only
  // filtered at the very end, so this map is complete during patching). This
  // is what lets patching NAME-GUARD each slot: a resolution only lands on the
  // clone whose `name` matches the warning's rawName, preventing base<->variant
  // cross-patching when a variant swap occupies the same slot as its base.
  const warningRawNames = new Map<string, string>();
  for (const w of program.import?.warnings ?? []) {
    if (w.rawName !== undefined) warningRawNames.set(w.path, w.rawName);
  }
  const allKnownPaths = new Set<string>([...resMap.keys(), ...warningRawNames.keys()]);

  function patchExercise(ex: ProgramExercise, basePath: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    // Candidate paths for this slot: the base path plus any `.variants.{v}`
    // path known to resolutions or warnings for this slot.
    const candidatePaths = [basePath];
    for (const key of allKnownPaths) {
      if (key.startsWith(`${basePath}.variants.`)) candidatePaths.push(key);
    }
    // Name guard: only the candidate whose warning rawName equals ex.name may
    // patch this exercise — blocks base<->variant cross-patching in BOTH
    // directions.
    for (const p of candidatePaths) {
      const rawName = warningRawNames.get(p);
      if (rawName !== undefined && rawName === ex.name) {
        const id = resMap.get(p);
        if (id && id !== CUSTOM_ID) {
          resolvedPaths.add(p);
          return { ...ex, canonicalExerciseId: id };
        }
        return ex; // matched the guard but no usable resolution; stop
      }
    }
    // Fallback: the base path carries no warning entry (e.g. a hand-built
    // program with no import warnings, or a name matched at import). Retain
    // the pre-variant behavior — patch by base path alone. In the real import
    // flow every unmatched exercise HAS a warning, so this only preserves
    // legacy/no-warning callers.
    if (warningRawNames.get(basePath) === undefined) {
      const id = resMap.get(basePath);
      if (id && id !== CUSTOM_ID) {
        resolvedPaths.add(basePath);
        return { ...ex, canonicalExerciseId: id };
      }
    }
    return ex;
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
