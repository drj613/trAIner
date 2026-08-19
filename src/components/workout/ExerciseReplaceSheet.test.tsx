import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";

const customExercise: UserExerciseDocument = {
  id: "user-1",
  name: "Zercher hold squat",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function renderSheet(onSelect = jest.fn()) {
  render(
    <ExerciseNormalizationProvider>
      <ExerciseReplaceSheet onSelect={onSelect} onClose={() => undefined} />
    </ExerciseNormalizationProvider>,
  );
  return onSelect;
}

async function search(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.type(screen.getByPlaceholderText(/search exercises/i), query);
}

function squatFamily() {
  return screen.getByRole("button", { name: /^Squat movement, \d+ versions$/ });
}

describe("ExerciseReplaceSheet — nested versions", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await (await getDb()).put("userExercises", customExercise);
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("nests concrete versions under one movement family row", async () => {
    const user = userEvent.setup();
    renderSheet();
    await search(user, "high bar back squat");

    expect(squatFamily()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /High Bar Back Squat/ })).toBeInTheDocument();
  });

  // THE INVARIANT, on the surface that overwrites an exercise the user already
  // has: a family row must never become the replacement.
  it("cannot select a family row — the confirm button stays unarmed", async () => {
    const user = userEvent.setup();
    const onSelect = renderSheet();
    await search(user, "high bar back squat");

    await user.click(squatFamily());

    expect(screen.getByRole("button", { name: "Select an exercise" })).toBeDisabled();
    expect(squatFamily()).not.toHaveAttribute("aria-pressed");
    // The click navigated: it closed the family rather than choosing it.
    expect(screen.queryByRole("button", { name: /High Bar Back Squat/ })).toBeNull();

    // Canary: a concrete version under the same family arms it as soon as it
    // is reachable again.
    await user.click(squatFamily());
    await user.click(screen.getByRole("button", { name: /High Bar Back Squat/ }));
    expect(screen.getByRole("button", { name: "Replace exercise" })).toBeEnabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("replaces with the concrete version the user picked", async () => {
    const user = userEvent.setup();
    const onSelect = renderSheet();
    await search(user, "high bar back squat");

    await user.click(screen.getByRole("button", { name: /High Bar Back Squat/ }));
    await user.click(screen.getByRole("button", { name: "Replace exercise" }));

    // The whole catalogue entry, not a name-and-id stub — the swap copies its
    // metadata onto the stored exercise.
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "barbell-high-bar-squat",
        name: "High Bar Back Squat",
        equipment: ["barbell", "rack"],
        muscles: { primary: ["quads", "glutes"], secondary: expect.arrayContaining(["hamstrings"]) },
      }),
    );
  });

  it("offers the user's own exercises alongside the bundled catalogue", async () => {
    const user = userEvent.setup();
    const onSelect = renderSheet();
    await search(user, "zercher hold");

    await user.click(await screen.findByRole("button", { name: /Zercher Hold Squat/i }));
    await user.click(screen.getByRole("button", { name: "Replace exercise" }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }));
  });
});
