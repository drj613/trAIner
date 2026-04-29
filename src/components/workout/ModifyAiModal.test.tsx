import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModifyAiModal } from "./ModifyAiModal";
import type { ProgramDay } from "@/lib/programs/types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

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
});
