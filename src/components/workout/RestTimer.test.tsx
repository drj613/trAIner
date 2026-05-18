import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestTimer } from "./RestTimer";

jest.useFakeTimers();

describe("RestTimer", () => {
  it("shows the prescribed duration parsed from rest text", () => {
    render(<RestTimer restText="90s" />);
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it("prompts for input when no duration can be parsed", () => {
    render(<RestTimer restText="" />);
    expect(screen.getByPlaceholderText(/seconds/i)).toBeInTheDocument();
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
});
