import type { ProgramDay } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

export function swapExercise(
  day: ProgramDay,
  targetId: string,
  item: ExerciseCatalogItem,
): ProgramDay {
  return {
    ...day,
    sections: day.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        exercises: group.exercises.map((ex) => {
          if (ex.id !== targetId) return ex;
          return {
            ...ex,
            name: item.name,
            canonicalExerciseId: item.id,
            tags: {
              primary: item.muscles.primary,
              secondary: item.muscles.secondary,
              incidental: [],
              modifiers: [],
            },
          };
        }),
      })),
    })),
  };
}
