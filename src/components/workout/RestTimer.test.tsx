import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestTimer } from "./RestTimer";

jest.useFakeTimers();

describe("RestTimer", () => {
  it("shows the prescribed duration parsed from rest text", () => {
    render(<RestTimer restText="90s" />);
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it("prompts to set duration when none can be parsed", () => {
    render(<RestTimer restText="" />);
    expect(screen.getByRole("button", { name: /set rest duration/i })).toBeInTheDocument();
  });

  it("counts down by one second after start", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText(/0:59/)).toBeInTheDocument();
  });

  it("stops at zero", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="2s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
  });

  it("pause and reset return to the original duration", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(5000); });
    await user.click(screen.getByRole("button", { name: /pause/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByText(/1:00/)).toBeInTheDocument();
  });

  it("commits a multi-digit value typed into the empty input on Enter", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="" />);
    // Empty state shows a clickable placeholder; click to enter edit mode.
    await user.click(screen.getByRole("button", { name: /set rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.type(input, "90");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it("commits multi-digit value on blur", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="" />);
    await user.click(screen.getByRole("button", { name: /set rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.type(input, "75");
    await act(async () => { input.blur(); });
    expect(screen.getByText(/1:15/)).toBeInTheDocument();
  });

  it("allows editing an already-set duration", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    // Displayed time is clickable when not running.
    await user.click(screen.getByRole("button", { name: /edit rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    // Input is pre-filled with current value.
    expect(input).toHaveValue(60);
    await user.clear(input);
    await user.type(input, "120");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/2:00/)).toBeInTheDocument();
  });

  it("Escape cancels edit without changing the value", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /edit rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.clear(input);
    await user.type(input, "999");
    await user.keyboard("{Escape}");
    expect(screen.getByText(/1:00/)).toBeInTheDocument();
  });
});
