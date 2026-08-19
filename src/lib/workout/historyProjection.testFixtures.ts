import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";
import {
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type ExerciseIdentityResult,
} from "@/lib/catalog/identity";
import {
  backRack,
  barbell,
  highBar,
  highBarModifier,
  makeIdentityContext,
  squat,
} from "@/lib/catalog/identity.testFixtures";
import type { MovementModifierDefinition } from "@/lib/catalog/registries";
import type { WorkoutLogDocument } from "@/lib/programs/types";

export const lowBarModifier: MovementModifierDefinition = {
  id: "low-bar",
  name: "Low Bar",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 4,
};

export const lowBar: ExerciseCatalogItem = {
  id: "barbell-low-bar-squat",
  name: "Low Bar Back Squat",
  aliases: ["low bar squat"],
  equipment: ["barbell"],
  movementPatterns: ["squat"],
  muscles: { primary: ["quads"], secondary: [] },
  tags: ["strength"],
  movementId: "squat",
  movementModifierIds: ["barbell", "back-rack", "low-bar"],
};

export const bench: ExerciseCatalogItem = {
  id: "barbell-bench-press",
  name: "Barbell Bench Press",
  aliases: [],
  equipment: ["barbell"],
  movementPatterns: ["horizontal-press"],
  muscles: { primary: ["chest"], secondary: [] },
  tags: ["strength"],
  movementId: "bench-press",
  movementModifierIds: ["barbell"],
};

/** Identity context covering two squat versions in one family plus a bench version. */
export function makeHistoryProjectionContext(): ExerciseIdentityContext {
  return makeIdentityContext({
    catalogById: new Map([
      [highBar.id, highBar],
      [lowBar.id, lowBar],
      [bench.id, bench],
    ]),
    movementsById: new Map([
      [squat.id, squat],
      ["bench-press", { ...squat, id: "bench-press", name: "Bench Press", sortOrder: 2 }],
    ]),
    modifiersById: new Map([
      [barbell.id, barbell],
      [backRack.id, backRack],
      [highBarModifier.id, highBarModifier],
      [lowBarModifier.id, lowBarModifier],
    ]),
  });
}

export type HistoryProjectionFixture = {
  context: ExerciseIdentityContext;
  squatIdentity: ExerciseIdentityResult;
  logWithHighAndLowBar: WorkoutLogDocument;
  logsWithDuplicateHighBarEntries: WorkoutLogDocument[];
  totalVolumeAcrossBothEntries: number;
};

export function makeHistoryProjectionFixture(): HistoryProjectionFixture {
  const context = makeHistoryProjectionContext();
  const squatIdentity = resolveExerciseIdentity(
    { kind: "catalog-reference", canonicalExerciseId: highBar.id },
    context,
  );

  const logWithHighAndLowBar: WorkoutLogDocument = {
    id: "log-both", programId: "p1", dayId: "d1",
    performedAt: "2026-05-04T14:00:00.000Z", performedDate: "2026-05-04",
    completedAt: "2026-05-04T15:00:00.000Z",
    entries: [
      {
        exerciseId: "slot-a", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight: 225, reps: 5 }],
      },
      {
        exerciseId: "slot-b", exerciseName: "Low Bar Back Squat", canonicalExerciseId: lowBar.id,
        sets: [{ setNumber: 1, weight: 275, reps: 3 }],
      },
    ],
  };

  // One workout carrying the same concrete version twice (e.g. a top set and a
  // later back-off block logged into two slots), plus an unrelated workout that
  // must not inflate the squat version's session count.
  const logsWithDuplicateHighBarEntries: WorkoutLogDocument[] = [
    {
      id: "log-dupe", programId: "p1", dayId: "d1",
      performedAt: "2026-05-11T14:00:00.000Z", performedDate: "2026-05-11",
      completedAt: "2026-05-11T15:00:00.000Z",
      entries: [
        {
          exerciseId: "slot-a", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
          sets: [{ setNumber: 1, weight: 240, reps: 3 }],
        },
        {
          exerciseId: "slot-c", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
          sets: [{ setNumber: 1, weight: 200, reps: 8 }],
        },
      ],
    },
    {
      id: "log-bench", programId: "p1", dayId: "d2",
      performedAt: "2026-05-12T14:00:00.000Z", performedDate: "2026-05-12",
      completedAt: "2026-05-12T15:00:00.000Z",
      entries: [
        {
          exerciseId: "slot-d", exerciseName: "Barbell Bench Press", canonicalExerciseId: bench.id,
          sets: [{ setNumber: 1, weight: 185, reps: 5 }],
        },
      ],
    },
  ];

  return {
    context,
    squatIdentity,
    logWithHighAndLowBar,
    logsWithDuplicateHighBarEntries,
    totalVolumeAcrossBothEntries: 240 * 3 + 200 * 8,
  };
}
