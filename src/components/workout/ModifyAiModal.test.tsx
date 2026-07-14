import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModifyAiModal, buildPrompt } from "./ModifyAiModal";
import type { ProgramDay } from "@/lib/programs/types";

const mockDay: ProgramDay = {
  id: "day-1",
  dayNumber: 1,
  title: "Test Day",
  sections: [],
};

describe("ModifyAiModal", () => {
  it("renders with disabled Review button when textarea is empty", () => {
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText(/Review changes/)).toBeDisabled();
  });

  it("enables Review button when textarea has content", async () => {
    const user = userEvent.setup();
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await user.type(screen.getByRole("textbox"), "{{}}");
    expect(screen.getByText(/Review changes/)).not.toBeDisabled();
  });

  it("shows error for invalid JSON", async () => {
    const user = userEvent.setup();
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await user.type(screen.getByRole("textbox"), "not valid json");
    await user.click(screen.getByText(/Review changes/));
    expect(await screen.findByText(/Invalid JSON/i)).toBeInTheDocument();
  });

  it("shows error when JSON is not an object", async () => {
    const user = userEvent.setup();
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await user.type(screen.getByRole("textbox"), "[[1, 2, 3]");
    await user.click(screen.getByText(/Review changes/));
    expect(await screen.findByText(/must be an object/i)).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps the placeholder in a highlighted element", () => {
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const placeholder = screen.getByText(/Describe what you want to change here/i);
    expect(placeholder.tagName).toMatch(/mark|strong|em|span/i);
  });

  it("includes countsTowardVolume: true in the inline exercise example", () => {
    const prompt = buildPrompt(mockDay);
    expect(prompt).toMatch(/"countsTowardVolume":\s*true/);
  });

  it("instructs preserving countsTowardVolume for unchanged exercises", () => {
    const prompt = buildPrompt(mockDay);
    expect(prompt).toContain("Preserve `countsTowardVolume` for unchanged exercises.");
    expect(prompt).toContain(
      "Use `true` for productive working sets and `false` for ordinary warmup, activation, mobility, cooldown, rehabilitation, prehabilitation, or low-fatigue practice.",
    );
    expect(prompt).toContain("Do not remove the field when modifying a day.");
  });

  it("instructs preserving fields unrelated to the requested modification", () => {
    const prompt = buildPrompt(mockDay);
    expect(prompt).toMatch(/preserve all fields unrelated to the requested modification/i);
  });

  it("renders the replace instruction note", () => {
    render(
      <ModifyAiModal
        currentDay={mockDay}
        programId="prog-1"
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText(/replace/i)).toBeInTheDocument();
  });
});
