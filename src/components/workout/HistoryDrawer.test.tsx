import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDrawer } from "./HistoryDrawer";
import type { ExerciseSessionRow } from "@/lib/workout/historyUtils";

const rows: ExerciseSessionRow[] = [
  { date: "2026-04-22", sets: ["65x10", "65x9"], volume: 1235 },
  { date: "2026-04-15", sets: ["60x10", "60x10"], volume: 1200 },
];

describe("HistoryDrawer", () => {
  it("renders exercise name as heading", () => {
    render(<HistoryDrawer exerciseName="DB Bench Press" rows={rows} onClose={jest.fn()} />);
    expect(screen.getByRole("heading", { name: /DB Bench Press/i })).toBeInTheDocument();
  });

  it("renders session rows", () => {
    render(<HistoryDrawer exerciseName="DB Bench Press" rows={rows} onClose={jest.fn()} />);
    expect(screen.getByText("2026-04-22")).toBeInTheDocument();
    expect(screen.getByText("65x10")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", async () => {
    const onClose = jest.fn();
    render(<HistoryDrawer exerciseName="DB Bench Press" rows={rows} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("history-drawer-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows empty state when rows is empty", () => {
    render(<HistoryDrawer exerciseName="New Move" rows={[]} onClose={jest.fn()} />);
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });
});
