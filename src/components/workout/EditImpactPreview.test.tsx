import { fireEvent, render, screen } from "@testing-library/react";
import { EditImpactPreview } from "./EditImpactPreview";
import type { ProgramEditPreview } from "@/lib/programs/edits";

const preview = {
  changes: [{ dayId: "week-2-lower", weekNumber: 2, elementId: "squat", field: "sets", before: 3, after: 4 }],
  preservedExceptions: [{ dayId: "week-3-lower", reason: "Preserved reps exception" }],
  unmappedTargets: [{ dayId: "week-4-lower", reason: "No unambiguous routine lineage" }],
  validationResults: [{ code: "superset-set-mismatch", path: "x", message: "Superset set counts differ." }],
} as unknown as ProgramEditPreview;

describe("EditImpactPreview", () => {
  it("shows field changes, preserved exceptions, unbound targets, and validation warnings", () => {
    render(<EditImpactPreview preview={preview} />);
    expect(screen.getByText(/3 → 4/)).toBeInTheDocument();
    expect(screen.getAllByText(/Preserved reps exception/)).toHaveLength(2);
    expect(screen.getByText(/No unambiguous routine lineage/)).toBeInTheDocument();
    expect(screen.getByText(/Superset set counts differ/)).toBeInTheDocument();
  });

  it("lets the reviewer explicitly include a preserved exception", () => {
    const onChange = jest.fn();
    render(<EditImpactPreview preview={preview} onIncludeExceptionDayIdsChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /week-3-lower/i }));
    expect(onChange).toHaveBeenCalledWith(["week-3-lower"]);
  });

  it("keeps separate field exceptions on the same occurrence independently selectable", () => {
    const onChange = jest.fn();
    const previewWithTwoFields = {
      ...preview,
      preservedExceptions: [
        { dayId: "week-3-lower", selectionId: '["week-3-lower","squat","sets"]', reason: "Preserved sets exception" },
        { dayId: "week-3-lower", selectionId: '["week-3-lower","squat","reps"]', reason: "Preserved reps exception" },
      ],
    } as unknown as ProgramEditPreview;
    render(<EditImpactPreview preview={previewWithTwoFields} onIncludeExceptionDayIdsChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith(['["week-3-lower","squat","sets"]']);
  });
});
