import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";

export type DiffType = "added" | "removed" | "modified";

export type ExerciseDiff = {
  exerciseId: string;
  exerciseName: string;
  type: DiffType;
  before?: ProgramExercise;
  after?: ProgramExercise;
};

function flatExercises(day: ProgramDay): Map<string, ProgramExercise> {
  const map = new Map<string, ProgramExercise>();
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        map.set(ex.id, ex);
      }
    }
  }
  return map;
}

function exercisesEqual(a: ProgramExercise, b: ProgramExercise): boolean {
  return (
    a.name === b.name &&
    a.sets === b.sets &&
    a.reps === b.reps &&
    a.load === b.load &&
    a.rest === b.rest &&
    a.notes === b.notes &&
    a.tempo === b.tempo &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags)
  );
}

export function diffDays(before: ProgramDay, after: ProgramDay): ExerciseDiff[] {
  const beforeMap = flatExercises(before);
  const afterMap = flatExercises(after);
  const result: ExerciseDiff[] = [];

  for (const [id, beforeEx] of beforeMap) {
    const afterEx = afterMap.get(id);
    if (!afterEx) {
      result.push({ exerciseId: id, exerciseName: beforeEx.name, type: "removed", before: beforeEx });
    } else if (!exercisesEqual(beforeEx, afterEx)) {
      result.push({ exerciseId: id, exerciseName: beforeEx.name, type: "modified", before: beforeEx, after: afterEx });
    }
  }

  for (const [id, afterEx] of afterMap) {
    if (!beforeMap.has(id)) {
      result.push({ exerciseId: id, exerciseName: afterEx.name, type: "added", after: afterEx });
    }
  }

  return result;
}

/**
 * Re-maps exercise IDs in `parsed` to match IDs in `original` by exercise name.
 * This is needed because the parser generates fresh UUIDs — without re-mapping,
 * every exercise would appear as removed+added instead of modified.
 *
 * Only matches by name (case-insensitive, trimmed). If an exercise name is new,
 * the parser-generated UUID is kept so it correctly appears as "added" in the diff.
 * Positional fallback is intentionally omitted: if AI replaces Row with Pull-up
 * at the same slot, we want "Row removed, Pull-up added", not "Row modified to Pull-up".
 */
export function remapExerciseIds(original: ProgramDay, parsed: ProgramDay): ProgramDay {
  // Build sectionId:name -> id map from original to avoid collisions when
  // two exercises in different sections share the same name (H9).
  // Falls back to a global name lookup if the section id doesn't match,
  // so the remapping still works when the AI rearranges sections.
  const sectionNameToId = new Map<string, string>(); // "${sectionId}:${name}" -> id
  const globalNameToId = new Map<string, string>();  // fallback: name -> id

  for (const section of original.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        const key = `${section.id}:${ex.name.toLowerCase().trim()}`;
        sectionNameToId.set(key, ex.id);
        // Only set global entry if name is unique (first occurrence wins)
        if (!globalNameToId.has(ex.name.toLowerCase().trim())) {
          globalNameToId.set(ex.name.toLowerCase().trim(), ex.id);
        } else {
          // Mark as ambiguous so we don't fall back to the wrong id
          globalNameToId.set(ex.name.toLowerCase().trim(), "");
        }
      }
    }
  }

  const remappedSections = parsed.sections.map((section) =>
    ({
      ...section,
      groups: section.groups.map((group) =>
        ({
          ...group,
          exercises: group.exercises.map((ex) => {
            const nameLower = ex.name.toLowerCase().trim();
            // Try section-scoped key first
            const sectionKey = `${section.id}:${nameLower}`;
            const sectionId = sectionNameToId.get(sectionKey);
            if (sectionId) return { ...ex, id: sectionId };
            // Fall back to global only if the name is unambiguous
            const globalId = globalNameToId.get(nameLower);
            if (globalId) return { ...ex, id: globalId };
            // No match or ambiguous — keep fresh UUID (it's a new or renamed exercise)
            return ex;
          }),
        })
      ),
    })
  );

  return { ...parsed, sections: remappedSections };
}
