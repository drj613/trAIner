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
    a.notes === b.notes
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
  // Build name -> id map from original (name is the stable semantic key)
  const nameToId = new Map<string, string>();
  for (const section of original.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        nameToId.set(ex.name.toLowerCase().trim(), ex.id);
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
            const originalId = nameToId.get(ex.name.toLowerCase().trim());
            // Only remap when name matches — keeps added exercises with fresh UUIDs
            return originalId ? { ...ex, id: originalId } : ex;
          }),
        })
      ),
    })
  );

  return { ...parsed, sections: remappedSections };
}
