import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineText } from "./InlineText";

describe("InlineText", () => {
  it("renders as a span with the given value by default", () => {
    render(<InlineText value="Squat" onChange={jest.fn()} />);
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches to an input when clicked", async () => {
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={jest.fn()} />);
    await user.click(screen.getByText("Squat"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits new value on blur and calls onChange", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={handleChange} />);
    await user.click(screen.getByText("Squat"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Deadlift");
    await user.tab();
    expect(handleChange).toHaveBeenCalledWith("Deadlift");
  });

  it("reverts on Escape and returns to span", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={handleChange} />);
    await user.click(screen.getByText("Squat"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Deadlift");
    await user.keyboard("{Escape}");
    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Squat")).toBeInTheDocument();
  });
});
