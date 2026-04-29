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
 * Falls back to position within each group when names don't match.
 * This is needed because the parser generates fresh UUIDs — without re-mapping,
 * every exercise would appear as removed+added instead of modified.
 */
export function remapExerciseIds(original: ProgramDay, parsed: ProgramDay): ProgramDay {
  // Build name -> id map from original
  const nameToId = new Map<string, string>();
  for (const section of original.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        nameToId.set(ex.name.toLowerCase().trim(), ex.id);
      }
    }
  }

  // Also build positional maps: sectionIndex -> groupIndex -> exerciseIndex -> id
  const positionalIds: string[][][] = original.sections.map((s) =>
    s.groups.map((g) => g.exercises.map((e) => e.id))
  );

  const remappedSections = parsed.sections.map((section, si) =>
    ({
      ...section,
      groups: section.groups.map((group, gi) =>
        ({
          ...group,
          exercises: group.exercises.map((ex, ei) => {
            const byName = nameToId.get(ex.name.toLowerCase().trim());
            if (byName) return { ...ex, id: byName };
            // fallback: position
            const posId = positionalIds[si]?.[gi]?.[ei];
            if (posId) return { ...ex, id: posId };
            return ex;
          }),
        })
      ),
    })
  );

  return { ...parsed, sections: remappedSections };
}
