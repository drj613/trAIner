import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { emptyTags, type ProgramDocument, type UserExerciseDocument, type WorkoutLogDocument } from "@/lib/programs/types";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { logRepo } from "@/lib/storage/logRepo";
import { normalizationOverrideRepo } from "@/lib/storage/normalizationOverrideRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { LibraryClient } from "./LibraryClient";

// `Hatfield Squat` and `Barbell Back Squat` are both real catalogue entries
// carrying `movementId: null`, so they resolve concretely but nest under no
// family — the shape `Needs review` exists for. `High Bar Back Squat` is the
// control: it already carries `movementId: "squat"`.
function programExercise(name: string) {
  return { id: `slot-${name.toLowerCase().replace(/\W+/g, "-")}`, name, tags: emptyTags() };
}

const program: ProgramDocument = {
  id: "program-1",
  title: "Test block",
  source: "manual",
  active: true,
  days: [
    {
      id: "day-1",
      dayNumber: 1,
      title: "Lower",
      sections: [
        {
          id: "section-1",
          type: "strength",
          name: "Strength",
          groups: [
            {
              id: "group-1",
              type: "single",
              exercises: [
                programExercise("Hatfield Squat"),
                programExercise("High Bar Back Squat"),
              ],
            },
          ],
        },
      ],
    },
    {
      id: "day-2",
      dayNumber: 2,
      title: "Lower again",
      sections: [
        {
          id: "section-2",
          type: "strength",
          name: "Strength",
          groups: [
            { id: "group-2", type: "single", exercises: [programExercise("Hatfield Squat")] },
          ],
        },
      ],
    },
  ],
  overrides: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const log: WorkoutLogDocument = {
  id: "log-1",
  programId: "program-1",
  dayId: "day-1",
  performedAt: "2026-08-10T12:00:00.000Z",
  performedDate: "2026-08-10",
  // Two spellings of one unmatched name: they must review as ONE target,
  // because that is what a stored override or alias for the name would key on.
  entries: [
    { exerciseId: "slot-wobble", exerciseName: "Wobble Board Thing", sets: [] },
    { exerciseId: "slot-wobble", exerciseName: "wobble board thing", sets: [] },
  ],
};

const customExercise: UserExerciseDocument = {
  id: "user-1",
  name: "My squat",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function renderLibrary() {
  render(
    <LocalDataProvider>
      <ExerciseNormalizationProvider>
        <LibraryClient />
      </ExerciseNormalizationProvider>
    </LocalDataProvider>,
  );
}

function needsReview() {
  return screen.getByRole("region", { name: "Needs review" });
}

describe("LibraryClient — needs review and corrections", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await programRepo.save(program);
    await logRepo.save(log);
    await (await getDb()).put("userExercises", customExercise);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDbConnection();
  });

  it("lists unresolved program, log, and custom exercises with their occurrence counts", async () => {
    renderLibrary();

    const section = await screen.findByRole("region", { name: "Needs review" });
    expect(await within(section).findByRole("button", { name: /Hatfield Squat/ })).toHaveTextContent("2");
    expect(within(section).getByRole("button", { name: /Wobble Board Thing/ })).toHaveTextContent("2");
    expect(within(section).getByRole("button", { name: /My squat/ })).toBeInTheDocument();
    // Already carries a movement, so there is nothing to review.
    expect(within(section).queryByRole("button", { name: /High Bar Back Squat/ })).not.toBeInTheDocument();
  });

  it("leaves out a target the user has already returned to standalone", async () => {
    await normalizationOverrideRepo.save({
      targetKind: "exercise-id",
      targetValue: "ssb-hatfield-squat",
      movementId: null,
      movementModifierIds: [],
    });

    renderLibrary();

    const section = await screen.findByRole("region", { name: "Needs review" });
    // Canary: the other two unresolved targets must still be listed, or this
    // test would also pass with the whole section broken.
    expect(await within(section).findByRole("button", { name: /Wobble Board Thing/ })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /My squat/ })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /Hatfield Squat/ })).not.toBeInTheDocument();
  });

  it("regroups live after a correction, without reloading logs", async () => {
    const logList = jest.spyOn(logRepo, "list");
    const user = userEvent.setup();
    renderLibrary();

    const section = await screen.findByRole("region", { name: "Needs review" });
    await user.click(await within(section).findByRole("button", { name: /Hatfield Squat/ }));

    await user.selectOptions(await screen.findByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(within(needsReview()).queryByRole("button", { name: /Hatfield Squat/ })).not.toBeInTheDocument(),
    );
    expect(within(needsReview()).getByRole("button", { name: /Wobble Board Thing/ })).toBeInTheDocument();
    expect(logList).toHaveBeenCalledTimes(1);
  });

  it("opens the shared correction sheet from catalogue detail", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole("region", { name: "Needs review" });

    await user.type(screen.getByPlaceholderText(/search exercises/i), "hatfield");
    const catalogue = screen.getByRole("region", { name: "Catalogue" });
    // The muscle group was already mounted collapsed before the query narrowed
    // it, so it is opened the way a user would open it.
    await user.click(within(catalogue).getByRole("button", { name: /^quads/ }));
    await user.click(within(catalogue).getByRole("button", { name: /Hatfield Squat/ }));
    await user.click(within(catalogue).getByRole("button", { name: "Change movement" }));

    expect(
      within(catalogue).getByRole("region", { name: "Correct Hatfield Squat" }),
    ).toBeInTheDocument();
  });

  it("keeps two open sheets' fields independent", async () => {
    const user = userEvent.setup();
    renderLibrary();

    const section = await screen.findByRole("region", { name: "Needs review" });
    await user.click(await within(section).findByRole("button", { name: /Hatfield Squat/ }));

    await user.type(screen.getByPlaceholderText(/search exercises/i), "hatfield");
    const catalogue = screen.getByRole("region", { name: "Catalogue" });
    await user.click(within(catalogue).getByRole("button", { name: /^quads/ }));
    await user.click(within(catalogue).getByRole("button", { name: /Hatfield Squat/ }));
    await user.click(within(catalogue).getByRole("button", { name: "Change movement" }));

    // Shared literal field ids would make both labels resolve to the same
    // control, so the two selects would come back as one element twice.
    const selects = screen.getAllByLabelText("Primary movement");
    expect(selects).toHaveLength(2);
    expect(new Set(selects).size).toBe(2);
  });
});
