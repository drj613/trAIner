import type { ProgramDay, ProgramGroup } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

export function swapExercise(
  day: ProgramDay,
  targetId: string,
  item: ExerciseCatalogItem,
): ProgramDay {
  const found = day.sections.some((s) =>
    s.groups.some((g) => g.exercises.some((e) => e.id === targetId))
  );
  if (!found) return day;

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
            // explicit even though the spread above already carries it — the volume
            // role is an editorial decision on the slot, not the catalog item, so a
            // swap must never let it silently drop.
            countsTowardVolume: ex.countsTowardVolume,
            // catalog items have no incidental/modifier data; reset to empty on swap
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

export function addExercise(
  day: ProgramDay,
  sectionId: string,
  item: ExerciseCatalogItem,
): ProgramDay {
  const found = day.sections.some((s) => s.id === sectionId);
  if (!found) return day;

  return {
    ...day,
    sections: day.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const newGroup: ProgramGroup = {
        id: crypto.randomUUID(),
        type: "single",
        exercises: [
          {
            id: crypto.randomUUID(),
            name: item.name,
            canonicalExerciseId: item.id,
            sets: 3,
            reps: "8-10",
            tags: {
              primary: item.muscles.primary,
              secondary: item.muscles.secondary,
              incidental: [],
              modifiers: [],
            },
          },
        ],
      };
      return { ...section, groups: [...section.groups, newGroup] };
    }),
  };
}
