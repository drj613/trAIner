import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { ExercisePickerSheet } from "./ExercisePickerSheet";

const customExercise: UserExerciseDocument = {
  id: "user-1",
  name: "Zercher hold squat",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function renderPicker(onAdd = jest.fn()) {
  render(
    <ExerciseNormalizationProvider>
      <ExercisePickerSheet onAdd={onAdd} onClose={() => undefined} />
    </ExerciseNormalizationProvider>,
  );
  return onAdd;
}

async function search(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.type(screen.getByPlaceholderText(/search exercises/i), query);
}

function squatFamily() {
  return screen.getByRole("button", { name: /^Squat movement, \d+ versions$/ });
}

describe("ExercisePickerSheet — nested versions", () => {
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
    renderPicker();
    await search(user, "high bar back squat");

    expect(squatFamily()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /High Bar Back Squat/ })).toBeInTheDocument();
  });

  // THE INVARIANT. A family names a group of exercises, not an exercise; if it
  // could be picked, the routine would store a movement id where a concrete
  // version belongs.
  it("cannot select a family row — clicking it selects nothing", async () => {
    const user = userEvent.setup();
    const onAdd = renderPicker();
    await search(user, "high bar back squat");

    await user.click(squatFamily());

    expect(screen.getByRole("button", { name: "Add exercises" })).toBeDisabled();
    expect(squatFamily()).not.toHaveAttribute("aria-pressed");

    // Canary: the sheet is working — a concrete version under the same family
    // selects as soon as it is reachable again.
    await user.click(squatFamily());
    await user.click(screen.getByRole("button", { name: /High Bar Back Squat/ }));
    expect(screen.getByRole("button", { name: "Add 1 exercise" })).toBeEnabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds the concrete version the user picked, not its family", async () => {
    const user = userEvent.setup();
    const onAdd = renderPicker();
    await search(user, "high bar back squat");

    await user.click(screen.getByRole("button", { name: /High Bar Back Squat/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 exercise" }));

    // The whole catalogue entry, not a name-and-id stub: the routine builder
    // copies `muscles` and `equipment` straight off it onto the stored exercise.
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "barbell-high-bar-squat",
        name: "High Bar Back Squat",
        equipment: ["barbell", "rack"],
        muscles: { primary: ["quads", "glutes"], secondary: expect.arrayContaining(["hamstrings"]) },
      }),
    ]);
  });

  it("keeps a family closed until it is opened", async () => {
    const user = userEvent.setup();
    renderPicker();

    // No query: families are listed, their versions are not.
    const family = squatFamily();
    expect(screen.queryByRole("button", { name: /High Bar Back Squat/ })).toBeNull();

    await user.click(family);

    expect(screen.getByRole("button", { name: /High Bar Back Squat/ })).toBeInTheDocument();
  });

  it("offers the user's own exercises alongside the bundled catalogue", async () => {
    const user = userEvent.setup();
    const onAdd = renderPicker();
    await search(user, "zercher hold");

    await user.click(await screen.findByRole("button", { name: /Zercher Hold Squat/i }));
    await user.click(screen.getByRole("button", { name: "Add 1 exercise" }));

    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ id: "user-1" })]);
  });

  it("says how many matches it is not showing rather than rendering the whole catalogue", async () => {
    const user = userEvent.setup();
    renderPicker();
    await search(user, "squat");

    expect(screen.getByText(/more matches/)).toBeInTheDocument();
  });

  it("still applies the muscle filter to the versions inside a family", async () => {
    const user = userEvent.setup();
    renderPicker();
    await search(user, "high bar back squat");
    expect(squatFamily()).toBeInTheDocument();

    // No squat version is primarily an abs exercise, so the family has nothing
    // left to show and disappears with its versions.
    await user.click(screen.getByRole("button", { name: "abs" }));

    expect(screen.queryByRole("button", { name: /Squat movement/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /High Bar Back Squat/ })).toBeNull();
  });
});
