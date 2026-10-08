import { fireEvent, render, screen, within } from "@testing-library/react";
import { ImportWarnings } from "./ImportWarnings";

describe("ImportWarnings", () => {
  it("shows repeated warning text once and keeps each target reviewable in a collapsed list", () => {
    const onSelectTarget = jest.fn();
    const warnings = [
      { code: "superset-set-mismatch", path: "days.1", targetId: "ex-a", affectedWeeks: [1], message: "Superset set counts differ." },
      { code: "superset-set-mismatch", path: "days.2", targetId: "ex-b", affectedWeeks: [2, 3], message: "Superset set counts differ." },
      { code: "superset-set-mismatch", path: "days.3", targetId: "ex-c", affectedWeeks: [4], message: "Superset set counts differ." },
    ];

    render(<ImportWarnings warnings={warnings} onSelectTarget={onSelectTarget} />);

    expect(screen.getAllByText("Superset set counts differ.")).toHaveLength(1);
    const affected = screen.getByText("3 affected items");
    expect(affected).toBeInTheDocument();
    expect(affected.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(affected);
    const detail = affected.closest("details")!;
    expect(within(detail).getByText("Workout 2 · Weeks 2, 3")).toBeVisible();
    const reviewButtons = within(detail).getAllByRole("button", { name: "Review" });
    expect(reviewButtons).toHaveLength(3);
    fireEvent.click(reviewButtons[1]);
    expect(onSelectTarget).toHaveBeenCalledWith("ex-b", [2, 3]);
  });

  it("shows at most three distinct warnings by default and puts the rest behind a count", () => {
    render(<ImportWarnings warnings={[
      { path: "a", message: "First warning" },
      { path: "b", message: "Second warning" },
      { path: "c", message: "Third warning" },
      { path: "d", message: "Fourth warning" },
      { path: "e", message: "Fifth warning" },
    ]} />);

    expect(screen.getByText("First warning")).toBeVisible();
    expect(screen.getByText("Second warning")).toBeVisible();
    expect(screen.getByText("Third warning")).toBeVisible();
    expect(screen.getByText("Fourth warning")).not.toBeVisible();
    const more = screen.getByText("2 more warning types");
    expect(more.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(more);
    expect(screen.getByText("Fourth warning")).toBeVisible();
    expect(screen.getByText("Fifth warning")).toBeVisible();
  });

  it("keeps correction history in its existing collapsed disclosure", () => {
    render(<ImportWarnings warnings={[]} corrections={[
      { path: "days.1", code: "sets-defaulted", message: "Set count corrected." },
    ]} />);
    expect(screen.getByText("1 correction made to the imported input").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Set count corrected.")).not.toBeVisible();
  });
});
