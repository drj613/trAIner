import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffReview } from "./DiffReview";
import type { ExerciseDiff } from "@/lib/workout/programDiff";
import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";
import type { ProgramEditPreview } from "@/lib/programs/edits";

const mockDay: ProgramDay = {
  id: "day-1",
  dayNumber: 1,
  title: "Leg Day",
  sections: [],
};

function buildExercise(partial: Partial<ProgramExercise> & { id: string; name: string }): ProgramExercise {
  return {
    tags: emptyTags(),
    ...partial,
  };
}

const addedDiff: ExerciseDiff = {
  exerciseId: "ex-1",
  exerciseName: "Squat",
  type: "added",
  after: buildExercise({ id: "ex-1", name: "Squat", sets: 3, reps: "8", load: "80kg" }),
};

const removedDiff: ExerciseDiff = {
  exerciseId: "ex-2",
  exerciseName: "Leg Press",
  type: "removed",
  before: buildExercise({ id: "ex-2", name: "Leg Press", sets: 4, reps: "10" }),
};

const modifiedDiff: ExerciseDiff = {
  exerciseId: "ex-3",
  exerciseName: "Romanian Deadlift",
  type: "modified",
  before: buildExercise({ id: "ex-3", name: "Romanian Deadlift", sets: 3, reps: "8" }),
  after: buildExercise({ id: "ex-3", name: "Romanian Deadlift", sets: 4, reps: "10" }),
};

describe("DiffReview", () => {
  it("shows 'No changes detected' when diffs is empty", () => {
    render(
      <DiffReview diffs={[]} replacement={mockDay} onAccept={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText(/No changes detected/i)).toBeInTheDocument();
  });

  it("calls onDiscard when Back button is clicked with empty diffs", async () => {
    const user = userEvent.setup();
    const onDiscard = jest.fn();
    render(
      <DiffReview diffs={[]} replacement={mockDay} onAccept={jest.fn()} onDiscard={onDiscard} />,
    );
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("renders exercise names from diffs", () => {
    render(
      <DiffReview
        diffs={[addedDiff, removedDiff, modifiedDiff]}
        replacement={mockDay}
        onAccept={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByText("Leg Press")).toBeInTheDocument();
    expect(screen.getByText("Romanian Deadlift")).toBeInTheDocument();
  });

  it("calls onAccept when Apply changes is clicked", async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    render(
      <DiffReview
        diffs={[addedDiff]}
        replacement={mockDay}
        onAccept={onAccept}
        onDiscard={jest.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /apply changes/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onDiscard when Discard is clicked", async () => {
    const user = userEvent.setup();
    const onDiscard = jest.fn();
    render(
      <DiffReview
        diffs={[addedDiff]}
        replacement={mockDay}
        onAccept={jest.fn()}
        onDiscard={onDiscard}
      />,
    );
    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("shows type badge labels for added and removed exercises", () => {
    render(
      <DiffReview
        diffs={[addedDiff, removedDiff]}
        replacement={mockDay}
        onAccept={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(screen.getByText(/added/i)).toBeInTheDocument();
    expect(screen.getByText(/removed/i)).toBeInTheDocument();
  });

  it("shows shared scope and impact information when a preview is supplied", () => {
    const preview = {
      changes: [{ dayId: "day-1", elementId: "ex-3", field: "sets", before: 3, after: 4 }],
      preservedExceptions: [{ dayId: "day-2", reason: "Preserved reps exception" }],
      unmappedTargets: [],
      validationResults: [],
    } as unknown as ProgramEditPreview;
    render(
      <DiffReview diffs={[modifiedDiff]} replacement={mockDay} onAccept={jest.fn()} onDiscard={jest.fn()}
        editPreview={preview} scope="routine-day" scopeTitle="Leg Day" onScopeChange={jest.fn()} />,
    );
    expect(screen.getByRole("radio", { name: /remaining occurrences of Leg Day/i })).toBeChecked();
    expect(screen.getByText(/3 → 4/)).toBeInTheDocument();
    expect(screen.getAllByText(/Preserved reps exception/).length).toBeGreaterThan(0);
  });

  it("resets the apply button after a failed save attempt", async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn().mockRejectedValue(new Error("save failed"));
    render(<DiffReview diffs={[addedDiff]} replacement={mockDay} onAccept={onAccept} onDiscard={jest.fn()} />);
    const button = screen.getByRole("button", { name: /apply changes/i });
    await user.click(button);
    expect(button).toBeEnabled();
  });
});
