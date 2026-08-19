import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import type { ProgramExercise } from "@/lib/programs/types";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { ExerciseEditSheet } from "./ExerciseEditSheet";

const baseExercise = {
  id: "e1",
  name: "Bench Press",
  sets: 3,
  reps: "8-10",
  load: "70kg",
  rest: "90s",
  notes: "pause 1s at chest",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
};

describe("ExerciseEditSheet", () => {
  it("renders the existing values into inputs", () => {
    render(<ExerciseEditSheet exercise={baseExercise} onSave={() => undefined} onClose={() => undefined} />);
    expect(screen.getByLabelText(/sets/i)).toHaveValue(3);
    expect(screen.getByLabelText(/reps/i)).toHaveValue("8-10");
    expect(screen.getByLabelText(/load/i)).toHaveValue("70kg");
    expect(screen.getByLabelText(/rest/i)).toHaveValue("90s");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("pause 1s at chest");
  });

  it("calls onSave with the edited values", async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<ExerciseEditSheet exercise={baseExercise} onSave={onSave} onClose={() => undefined} />);
    await user.clear(screen.getByLabelText(/reps/i));
    await user.type(screen.getByLabelText(/reps/i), "6");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      sets: 3, reps: "6", load: "70kg", rest: "90s",
    }));
  });

  it("has no unit field — unit lives on the exercise row toggle", () => {
    render(<ExerciseEditSheet exercise={baseExercise} onSave={() => undefined} onClose={() => undefined} />);
    expect(screen.queryByLabelText(/unit/i)).toBeNull();
  });

  it("never touches unit in the saved patch", async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<ExerciseEditSheet exercise={{ ...baseExercise, unit: "kg" as const }} onSave={onSave} onClose={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect("unit" in onSave.mock.calls[0][0]).toBe(false);
  });

  it("drops blank values rather than persisting empty strings", async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<ExerciseEditSheet exercise={baseExercise} onSave={onSave} onClose={() => undefined} />);
    await user.clear(screen.getByLabelText(/load/i));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave.mock.calls[0][0].load).toBeUndefined();
  });
});

// The editor links to the shared correction sheet rather than growing its own
// identity controls between the sets/reps/load fields.
describe("ExerciseEditSheet — identity correction", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  // The provider reads three stores when it mounts. A test that asserts
  // something is ABSENT never waits for those reads, so without this flush the
  // next `deleteDB` races a live connection and fake-indexeddb throws
  // `InvalidStateError` after the suite has already reported green.
  // The provider reads three stores on mount. Every test below waits for the
  // correction sheet, so those reads have landed by the time the connection is
  // closed — a test that asserted only an absence would race the close and make
  // fake-indexeddb throw `InvalidStateError` after the suite reported green.
  afterEach(() => {
    resetDbConnection();
  });

  function renderInApp(exercise: ProgramExercise) {
    render(
      <ExerciseNormalizationProvider>
        <ExerciseEditSheet exercise={exercise} onSave={() => undefined} onClose={() => undefined} />
      </ExerciseNormalizationProvider>,
    );
  }

  it("opens the shared correction sheet for a catalogue exercise, but only when asked", async () => {
    const user = userEvent.setup();
    renderInApp({ ...baseExercise, name: "High Bar Back Squat", canonicalExerciseId: "barbell-high-bar-squat" });

    // Quiet by default: the editor is sets, reps, load and notes until the user
    // asks about identity.
    expect(screen.queryByRole("region", { name: /^Correct / })).toBeNull();

    await user.click(screen.getByRole("button", { name: /change movement/i }));

    const sheet = await screen.findByRole("region", { name: "Correct High Bar Back Squat" });
    // The bundled entry, not the text: a name-only target would carry the same
    // label, so the kind tag is what tells the two apart.
    expect(within(sheet).getByText("bundled")).toBeInTheDocument();
  });

  it("corrects a name-only exercise by its name", async () => {
    const user = userEvent.setup();
    renderInApp({ ...baseExercise, name: "Wobble Board Thing" });

    await user.click(screen.getByRole("button", { name: /change movement/i }));

    const sheet = await screen.findByRole("region", { name: "Correct Wobble Board Thing" });
    expect(within(sheet).getByText("name only")).toBeInTheDocument();
  });
});
