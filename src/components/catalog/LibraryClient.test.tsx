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
import { resolveExerciseIdentity, type ExerciseIdentityInput } from "@/lib/catalog/identity";
import { createMigrationContext } from "@/lib/storage/migrations/v10Identity";
import { deriveNeedsReview, LibraryClient } from "./LibraryClient";

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

// The section is quiet by default, so every test that reads rows opens it the
// way a user would.
async function openNeedsReview(user: ReturnType<typeof userEvent.setup>) {
  const section = await screen.findByRole("region", { name: "Needs review" });
  await user.click(within(section).getByRole("button", { name: /needs review/ }));
  return section;
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
    const user = userEvent.setup();
    renderLibrary();

    const section = await openNeedsReview(user);
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

    const user = userEvent.setup();
    renderLibrary();

    const section = await openNeedsReview(user);
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

    const section = await openNeedsReview(user);
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

  it("keeps the review list collapsed behind its count", async () => {
    renderLibrary();

    const section = await screen.findByRole("region", { name: "Needs review" });
    // Waited, not sampled: the count must reach 3 (routine, log, and custom all
    // loaded) before absence of rows means "collapsed" rather than "not loaded".
    await waitFor(() =>
      expect(within(section).getByRole("button", { name: /needs review/ })).toHaveTextContent("3"));

    // The count is the instrument; the rows are the detail you ask for.
    expect(within(section).queryByRole("button", { name: /Wobble Board Thing/ })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /My squat/ })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /Hatfield Squat/ })).not.toBeInTheDocument();
  });

  it("caps the open list and reveals the rest on request", async () => {
    await programRepo.save({
      ...program,
      id: "program-2",
      title: "Long block",
      days: [
        {
          id: "day-3",
          dayNumber: 3,
          title: "Everything",
          sections: [
            {
              id: "section-3",
              type: "strength",
              name: "Strength",
              groups: [
                {
                  id: "group-3",
                  type: "single",
                  exercises: Array.from({ length: 12 }, (_, index) =>
                    programExercise(`Zzz Unmatched Lift ${index + 1}`)),
                },
              ],
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderLibrary();

    const section = await openNeedsReview(user);
    // 15 unresolved targets in total; wait for all three sources to land.
    await waitFor(() =>
      expect(within(section).getByRole("button", { name: /needs review/ })).toHaveTextContent("15"));
    const rowCount = () => within(section).getAllByRole("button", { name: /Zzz Unmatched Lift/ }).length;
    expect(rowCount()).toBeLessThanOrEqual(10);

    await user.click(within(section).getByRole("button", { name: "+5 more" }));

    expect(rowCount()).toBe(12);
  });

  it("keeps two open sheets' fields independent", async () => {
    const user = userEvent.setup();
    renderLibrary();

    const section = await openNeedsReview(user);
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

describe("deriveNeedsReview", () => {
  function countingContext(userExercises: UserExerciseDocument[] = []) {
    const context = createMigrationContext([], userExercises, []);
    const inputs: ExerciseIdentityInput[] = [];
    const resolve = (input: ExerciseIdentityInput) => {
      inputs.push(input);
      return resolveExerciseIdentity(input, context);
    };
    return { context, resolve, inputs };
  }

  function programOfExercises(exercises: ReturnType<typeof programExercise>[]): ProgramDocument {
    return {
      ...program,
      days: [
        {
          id: "day-x",
          dayNumber: 1,
          title: "Day",
          sections: [
            {
              id: "section-x",
              type: "strength",
              name: "Strength",
              groups: [{ id: "group-x", type: "single", exercises }],
            },
          ],
        },
      ],
    };
  }

  function programOf(names: string[]): ProgramDocument {
    return programOfExercises(names.map(programExercise));
  }

  it("resolves each distinct identity once, however often it recurs", () => {
    const { context, resolve, inputs } = countingContext();

    // Three occurrences of one name, plus one other name. Resolving a name-only
    // entry is a full catalogue scan, and this list exists precisely for the
    // entries that have no id to short-circuit it.
    const items = deriveNeedsReview(
      context,
      resolve,
      [programOf(["Zzz Unmatched Lift", "Zzz Unmatched Lift", "zzz unmatched lift", "Zzz Other Lift"])],
      [],
    );

    expect(inputs).toHaveLength(2);
    expect(items.map((item) => [item.label, item.occurrences])).toEqual([
      ["Zzz Unmatched Lift", 3],
      ["Zzz Other Lift", 1],
    ]);
  });

  it("does not collapse two entries that share a name but not a canonical id", () => {
    const { context, resolve, inputs } = countingContext();
    const backfilled = {
      ...programExercise("Zzz Unmatched Lift"),
      id: "slot-backfilled",
      canonicalExerciseId: "barbell-high-bar-squat",
    };
    const notBackfilled = { ...programExercise("Zzz Unmatched Lift"), id: "slot-bare" };

    const items = deriveNeedsReview(context, resolve, [programOfExercises([backfilled, notBackfilled])], []);

    // `v10Identity` backfills `canonicalExerciseId` only for exact matches, so
    // one spelling of a name can be backfilled and another not. Keying on the
    // name alone would let the backfilled one — which resolves to a movement and
    // needs no review — answer for the bare one, silently dropping a row the
    // user has to act on.
    expect(inputs).toHaveLength(2);
    expect(items.map((item) => item.target)).toEqual([
      { kind: "normalized-name", value: "Zzz Unmatched Lift" },
    ]);
  });

  it("does not collapse two custom exercises that share a name", () => {
    const { context, resolve, inputs } = countingContext([
      { id: "user-a", name: "My squat", createdAt: "2026-08-01T00:00:00.000Z" },
      { id: "user-b", name: "My squat", createdAt: "2026-08-02T00:00:00.000Z" },
    ]);

    const items = deriveNeedsReview(context, resolve, [], []);

    // A custom exercise resolves by id, not by name, so keying on the name
    // would merge two genuinely different targets into one row.
    expect(inputs).toHaveLength(2);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.target)).toEqual([
      { kind: "user-exercise", exerciseId: "user-a", name: "My squat" },
      { kind: "user-exercise", exerciseId: "user-b", name: "My squat" },
    ]);
  });
});
