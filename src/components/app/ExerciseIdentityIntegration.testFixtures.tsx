import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, type RenderResult } from "@testing-library/react";
import { ExerciseNormalizationProvider, useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { LibraryClient } from "@/components/catalog/LibraryClient";
import { HistoryClient } from "@/components/workout/HistoryClient";
import { WorkoutDayClient } from "@/components/workout/WorkoutDayClient";
import { lookupCatalogExercise } from "@/lib/analysis/muscles";
import { emptyTags, type ProgramDocument, type WorkoutLogDocument } from "@/lib/programs/types";
import type { NormalizationOverrideSaveInput } from "@/lib/storage/normalizationOverrideRepo";

/**
 * One provider, four consumers, one committed correction.
 *
 * The fixture turns on three real catalogue entries, chosen so that a single
 * override is observable on every surface at once:
 *
 * - `ssb-hatfield-squat` ("Hatfield Squat") ships with `movementId: null`, so
 *   before the correction it is a family of its own everywhere.
 * - `barbell-high-bar-squat` already carries `movementId: "squat"`, so the
 *   `Squat` family exists independently and the correction has somewhere real
 *   to move Hatfield INTO. Without it the test could not tell "regrouped" from
 *   "relabelled".
 * - The correction assigns `squat` + `barbell`, which is a modifier the squat
 *   family actually allows; an invalid one would be rejected by the repository
 *   and the whole test would pass on a write that never happened.
 */
export const HATFIELD_ID = "ssb-hatfield-squat";
export const HIGH_BAR_ID = "barbell-high-bar-squat";

export const hatfieldJoinsSquat: NormalizationOverrideSaveInput = {
  targetKind: "exercise-id",
  targetValue: HATFIELD_ID,
  movementId: "squat",
  movementModifierIds: ["barbell"],
};

export const program: ProgramDocument = {
  id: "p1",
  title: "Integration block",
  source: "manual",
  active: true,
  days: [
    {
      id: "day-1",
      dayNumber: 1,
      title: "Lower",
      sections: [
        {
          id: "s1",
          name: "Main",
          type: "strength",
          groups: [
            {
              id: "g1",
              type: "single",
              exercises: [
                { id: "e1", name: "Hatfield Squat", sets: 3, reps: "5", canonicalExerciseId: HATFIELD_ID, tags: emptyTags() },
              ],
            },
          ],
        },
      ],
    },
  ],
  overrides: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/**
 * Two logs on two different days, one per concrete version. Two days rather
 * than one so the all-time index's workout count is a number the grouping can
 * actually change, and distinct set numbers so the Today drawer's contents are
 * readable as "which versions are in this list".
 */
export const logs: WorkoutLogDocument[] = [
  {
    id: "log-hatfield",
    programId: "p1",
    dayId: "day-1",
    performedAt: "2026-08-10T12:00:00.000Z",
    performedDate: "2026-08-10",
    entries: [
      {
        exerciseId: "e1",
        exerciseName: "Hatfield Squat",
        canonicalExerciseId: HATFIELD_ID,
        sets: [{ setNumber: 1, weight: 315, reps: 5 }],
      },
    ],
  } as WorkoutLogDocument,
  {
    id: "log-high-bar",
    programId: "p1",
    dayId: "day-1",
    performedAt: "2026-08-12T12:00:00.000Z",
    performedDate: "2026-08-12",
    entries: [
      {
        exerciseId: "e-other-slot",
        exerciseName: "High Bar Back Squat",
        canonicalExerciseId: HIGH_BAR_ID,
        sets: [{ setNumber: 1, weight: 225, reps: 3 }],
      },
    ],
  } as WorkoutLogDocument,
];

/**
 * Analysis, rendered inside the same provider as everything else.
 *
 * It reads `lookupCatalogExercise`, the real analysis entry point, and prints
 * the muscles it found. The assertion on it is that a correction does NOT move
 * it: grouping and metadata are separate, and this probe is what makes that a
 * measured claim rather than a comment. See `muscles.ts` for why the analysis
 * lookup is exact-only.
 */
function AnalysisProbe() {
  const item = lookupCatalogExercise(program.days[0].sections[0].groups[0].exercises[0]);
  return <span data-testid="analysis-metadata">{item ? item.muscles.primary.join(",") : "none"}</span>;
}

function IdentityVersionProbe() {
  const { version, loaded } = useExerciseNormalization();
  return (
    <>
      <span data-testid="identity-version">{version}</span>
      <span data-testid="identity-loaded">{String(loaded)}</span>
    </>
  );
}

export function renderIdentityHarness(): RenderResult {
  return render(
    <MemoryRouter initialEntries={["/programs/p1/days/day-1"]}>
      <ExerciseNormalizationProvider>
        <LocalDataProvider>
          <IdentityVersionProbe />
          <AnalysisProbe />
          <div data-testid="all-time-surface">
            <HistoryClient />
          </div>
          <div data-testid="library-surface">
            <LibraryClient />
          </div>
          <div data-testid="today-surface">
            <Routes>
              <Route path="/programs/:id/days/:dayId" element={<WorkoutDayClient />} />
            </Routes>
          </div>
        </LocalDataProvider>
      </ExerciseNormalizationProvider>
    </MemoryRouter>,
  );
}
