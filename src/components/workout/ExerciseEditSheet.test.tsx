import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
