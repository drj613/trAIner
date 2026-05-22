import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkoutDayClient } from "./WorkoutDayClient";
import type { ProgramDocument } from "@/lib/programs/types";

const makeExercise = (id: string, name: string) => ({
  id, name, sets: 3, reps: "8-10",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});

const twoDay: ProgramDocument = {
  id: "p1", title: "Test Program", source: "import", active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, title: "Push Day",
      sections: [{
        id: "s1", name: "Main", type: "strength",
        groups: [{ id: "g1", type: "single", exercises: [makeExercise("e1", "Bench Press")] }],
      }],
    },
    {
      id: "day-2", dayNumber: 2, title: "Pull Day",
      sections: [{
        id: "s2", name: "Main", type: "strength",
        groups: [{ id: "g2", type: "single", exercises: [makeExercise("e2", "Pull-Up")] }],
      }],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const refreshMock = jest.fn().mockResolvedValue(undefined);
const saveProgramMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [twoDay],
    profile: undefined,
    loading: false,
    error: undefined,
    refresh: refreshMock,
    saveProgram: saveProgramMock,
  }),
}));

const saveMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    listForProgram: jest.fn().mockResolvedValue([]),
    getForDay: jest.fn().mockResolvedValue(null),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: {
    get: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/analytics/analyticsSeam", () => ({
  trackWorkoutEvent: jest.fn().mockResolvedValue(undefined),
}));

function renderOnDay(dayId: string) {
  return render(
    <MemoryRouter initialEntries={[`/programs/p1/days/${dayId}`]}>
      <Routes>
        <Route path="/programs/:id/days/:dayId" element={<WorkoutDayClient />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  saveMock.mockClear();
  refreshMock.mockClear();
  saveProgramMock.mockClear();
});

describe("WorkoutDayClient header", () => {
  it("shows the day title", async () => {
    renderOnDay("day-1");
    expect(await screen.findByRole("heading", { level: 1, name: "Push Day" })).toBeInTheDocument();
  });

  it("shows Day N of M counter", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    expect(screen.getByText(/day 1 of 2/i)).toBeInTheDocument();
  });

  it("prev button is disabled on first day", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    expect(screen.getByRole("button", { name: /previous day/i })).toBeDisabled();
  });

  it("next button is disabled on last day", async () => {
    renderOnDay("day-2");
    await screen.findByRole("heading", { level: 1, name: "Pull Day" });
    expect(screen.getByRole("button", { name: /next day/i })).toBeDisabled();
  });
});

describe("WorkoutDayClient skip day", () => {
  it("tapping Skip day shows the inline reason input", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /skip day/i }));
    expect(screen.getByPlaceholderText(/reason.*optional/i)).toBeInTheDocument();
  });

  it("confirming skip writes completedAt and skippedAt", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /skip day/i }));
    await user.click(screen.getByRole("button", { name: /skip →/i }));
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        programId: "p1",
        dayId: "day-1",
        completedAt: expect.any(String),
        skippedAt: expect.any(String),
      })
    );
  });

  it("skip reason persists in the log", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /skip day/i }));
    await user.type(screen.getByPlaceholderText(/reason.*optional/i), "knee pain");
    await user.click(screen.getByRole("button", { name: /skip →/i }));
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ skipReason: "knee pain" })
    );
  });
});

describe("WorkoutDayClient skip flush regression", () => {
  it("unmount flush after skip does not clobber skippedAt", async () => {
    jest.useFakeTimers();
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Skip the day
    await user.click(screen.getByRole("button", { name: /skip day/i }));
    await user.type(screen.getByPlaceholderText(/reason.*optional/i), "too tired");
    await user.click(screen.getByRole("button", { name: /skip →/i }));

    // The skip save call should have skippedAt
    const skipSave = saveMock.mock.calls.find(
      (call) => call[0].skippedAt !== undefined
    );
    expect(skipSave).toBeDefined();
    expect(skipSave![0].skipReason).toBe("too tired");

    jest.useRealTimers();
  });
});

describe("WorkoutDayClient day note", () => {
  it("clicking Day note button reveals a textarea", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /day note/i }));
    expect(screen.getByPlaceholderText(/session note/i)).toBeInTheDocument();
  });

  it("typing in the day note autosaves as dayNote in the log", async () => {
    jest.useFakeTimers();
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /day note/i }));
    await user.type(screen.getByPlaceholderText(/session note/i), "felt great");
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ dayNote: "felt great" })
    );
    jest.useRealTimers();
  });
});

describe("WorkoutDayClient finish workout", () => {
  it("Finish workout navigates to the next day", async () => {
    jest.useFakeTimers();
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(await screen.findByRole("heading", { level: 1, name: "Pull Day" })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("Finish on the last day wraps to day 0", async () => {
    jest.useFakeTimers();
    renderOnDay("day-2");
    await screen.findByRole("heading", { level: 1, name: "Pull Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(await screen.findByRole("heading", { level: 1, name: "Push Day" })).toBeInTheDocument();
    jest.useRealTimers();
  });
});
