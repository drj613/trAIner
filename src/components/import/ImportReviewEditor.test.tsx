import { fireEvent, render, screen, within } from "@testing-library/react";
import { ImportReviewEditor } from "./ImportReviewEditor";
import { parseProgramJson } from "@/lib/import/parser";
import { createImportDraft } from "@/lib/import/draft";

function fixture() {
  const text = JSON.stringify({ title: "Twelve weeks", weeks: 12, days: [{ day: 1, title: "Lower", sections: [{ name: "Strength", type: "strength", groups: [{ type: "single", exercises: [{ name: "Goblet Squat", sets: 3, reps: "8-12", countsTowardVolume: true, tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] } }] }] }] }] });
  return createImportDraft(parseProgramJson(text), text);
}

test("confirmation shows one compact week and opens details and editing on demand", () => {
  const draft = fixture();
  render(<ImportReviewEditor program={draft.program} warnings={[]} corrections={[]} onChange={jest.fn()} />);
  const preview = screen.getByRole("region", { name: "Weekly preview" });
  expect(within(preview).getAllByRole("button", { name: /^Select / })).toHaveLength(1);
  expect(screen.queryByLabelText("Sets")).not.toBeInTheDocument();
  expect(screen.queryByText("Goblet Squat")).not.toBeVisible();
  fireEvent.click(screen.getByText("View exercises"));
  expect(screen.getByText("Goblet Squat")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Preview week"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Select Lower week 12" }));
  expect(screen.getByLabelText("Week")).toHaveValue(draft.program.days.find((day) => day.weekNumber === 12)!.id);
  expect(screen.getByLabelText("Sets")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
  expect(screen.queryByLabelText("Sets")).not.toBeInTheDocument();
});

test("warning review opens the affected workout editor", () => {
  const draft = fixture();
  const targetId = draft.program.days[0].sections[0].groups[0].exercises[0].id;
  render(<ImportReviewEditor program={draft.program} warnings={[{ path: "days.0", message: "Review the prescription", targetId, affectedWeeks: [4] }]} corrections={[]} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(screen.getByLabelText("Sets")).toBeVisible();
  expect(screen.getByLabelText("Week")).toHaveValue(draft.program.days.find((day) => day.weekNumber === 4)!.id);
});
