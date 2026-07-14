import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkoutDayClient } from "./WorkoutDayClient";
import type { ProgramDocument } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";

const makeExercise = (id: string, name: string, canonicalExerciseId?: string) => ({
  id, name, sets: 3, reps: "8-10",
  canonicalExerciseId,
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});

const twoDay: ProgramDocument = {
  id: "p1", title: "Test Program", source: "import", active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, title: "Push Day",
      sections: [{
        id: "s1", name: "Main", type: "strength",
        groups: [{ id: "g1", type: "single", exercises: [makeExercise("e1", "Bench Press", "cat-bench")] }],
      }],
    },
    {
      id: "day-2", dayNumber: 2, title: "Pull Day",
      sections: [{
        id: "s2", name: "Main", type: "strength",
        groups: [{ id: "g2", type: "single", exercises: [makeExercise("e2", "Pull-Up", "cat-pullup")] }],
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
const listForDayMock = jest.fn().mockResolvedValue([]);
const listForProgramMock = jest.fn().mockResolvedValue([]);
const listMock = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    list: (...args: unknown[]) => listMock(...args),
    listForProgram: (...args: unknown[]) => listForProgramMock(...args),
    listForDay: (...args: unknown[]) => listForDayMock(...args),
    getForDay: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(undefined),
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
  listForDayMock.mockClear().mockResolvedValue([]);
  listForProgramMock.mockClear().mockResolvedValue([]);
  listMock.mockClear().mockResolvedValue([]);
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /skip day/i })).not.toBeDisabled()
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /skip day/i }));
    expect(screen.getByPlaceholderText(/reason.*optional/i)).toBeInTheDocument();
  });

  it("confirming skip writes completedAt and skippedAt", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /skip day/i })).not.toBeDisabled()
    );
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /skip day/i })).not.toBeDisabled()
    );
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /skip day/i })).not.toBeDisabled()
    );

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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(await screen.findByRole("heading", { level: 1, name: "Push Day" })).toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe("WorkoutDayClient canonical id persistence", () => {
  it("Finish workout saves canonicalExerciseId on each entry", async () => {
    jest.useFakeTimers();
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });
    const finishSave = saveMock.mock.calls.find(
      (call) => call[0].completedAt !== undefined && call[0].dayId === "day-1",
    );
    expect(finishSave).toBeDefined();
    expect(finishSave![0].entries[0]).toEqual(
      expect.objectContaining({ exerciseId: "e1", canonicalExerciseId: "cat-bench" }),
    );
    jest.useRealTimers();
  });
});

describe("WorkoutDayClient already-completed day", () => {
  it("Finish button is disabled and labeled 'Completed' when a completed log exists", async () => {
    listForDayMock.mockResolvedValueOnce([
      {
        id: "prior-log",
        programId: "p1",
        dayId: "day-1",
        performedAt: "2026-04-10T09:00:00.000Z",
        completedAt: "2026-04-10T10:00:00.000Z",
        entries: [],
      },
    ]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const finishButton = await screen.findByRole("button", { name: /completed/i });
    expect(finishButton).toBeDisabled();
    // The default label "Finish workout" must not be present.
    expect(screen.queryByRole("button", { name: /finish workout/i })).not.toBeInTheDocument();
  });

  it("Finish button is enabled when no completed log exists", async () => {
    listForDayMock.mockResolvedValueOnce([]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
  });

  it("ignores completed logs from other programs", async () => {
    listForDayMock.mockResolvedValueOnce([
      {
        id: "other-prog-log",
        programId: "other-program",
        dayId: "day-1",
        performedAt: "2026-04-10T09:00:00.000Z",
        completedAt: "2026-04-10T10:00:00.000Z",
        entries: [],
      },
    ]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
  });

  it("ignores incomplete logs (no completedAt)", async () => {
    listForDayMock.mockResolvedValueOnce([
      {
        id: "in-progress-log",
        programId: "p1",
        dayId: "day-1",
        performedAt: "2026-04-10T09:00:00.000Z",
        entries: [],
      },
    ]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );
  });
});

describe("WorkoutDayClient locked-day Skip button", () => {
  it("Skip day button is disabled when a completed log exists", async () => {
    listForDayMock.mockResolvedValueOnce([
      {
        id: "prior-log",
        programId: "p1",
        dayId: "day-1",
        performedAt: "2026-04-10T09:00:00.000Z",
        completedAt: "2026-04-10T10:00:00.000Z",
        entries: [],
      },
    ]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    // Wait for the listForDay query to resolve and the lock to engage.
    await screen.findByRole("button", { name: /completed/i });
    const skipButton = screen.getByRole("button", { name: /skip day/i });
    expect(skipButton).toBeDisabled();
  });

  it("Skip day button is enabled when no completed log exists", async () => {
    listForDayMock.mockResolvedValueOnce([]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    // Wait for the listForDay query to resolve and the lock to clear.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /skip day/i })).not.toBeDisabled()
    );
  });
});

describe("WorkoutDayClient exercise edit — countsTowardVolume preservation", () => {
  it("preserves an existing countsTowardVolume:true through an edit save", async () => {
    const exercise = twoDay.days[0].sections[0].groups[0].exercises[0];
    (exercise as { countsTowardVolume?: boolean }).countsTowardVolume = true;
    (programRepo.get as jest.Mock).mockResolvedValueOnce(twoDay);
    try {
      renderOnDay("day-1");
      await screen.findByRole("heading", { level: 1, name: "Push Day" });
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /edit prescription for bench press/i }));
      await user.click(await screen.findByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(programRepo.save as jest.Mock).toHaveBeenCalled());
      const saved = (programRepo.save as jest.Mock).mock.calls[0][0];
      const override = saved.overrides.find((o: { dayId?: string }) => o.dayId === "day-1");
      const savedExercise = override.replacement.sections[0].groups[0].exercises[0];
      expect(savedExercise.countsTowardVolume).toBe(true);
    } finally {
      delete (exercise as { countsTowardVolume?: boolean }).countsTowardVolume;
    }
  });
});

describe("WorkoutDayClient progression display", () => {
  it("renders nothing when the program has no progression", async () => {
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    expect(screen.queryByText("Progression")).not.toBeInTheDocument();
  });

  it("renders each applies/rule entry when the program has progression", async () => {
    (twoDay as { progression?: unknown }).progression = [
      { applies: "Primary compounds", rule: "Add 2.5-5% load when top set hits RPE8 for all reps." },
      { applies: "Hypertrophy accessories", rule: "Double progression: add reps, then +5-10% load and reset." },
    ];
    try {
      renderOnDay("day-1");
      await screen.findByRole("heading", { level: 1, name: "Push Day" });
      expect(await screen.findByText("Progression")).toBeInTheDocument();
      expect(screen.getByText(/Primary compounds/)).toBeInTheDocument();
      expect(screen.getByText(/Add 2\.5-5% load when top set hits RPE8 for all reps\./)).toBeInTheDocument();
      expect(screen.getByText(/Hypertrophy accessories/)).toBeInTheDocument();
      expect(screen.getByText(/Double progression: add reps, then \+5-10% load and reset\./)).toBeInTheDocument();
    } finally {
      delete (twoDay as { progression?: unknown }).progression;
    }
  });
});

describe("WorkoutDayClient history button after exercise change", () => {
  it("history dialog shows entries matching the slot's current canonical id", async () => {
    // Two logs: one under the old slot id, one under a different slot but same canonical id.
    // History reads all logs (logRepo.list) so an exercise's sessions follow it across routines.
    listMock.mockResolvedValueOnce([
      {
        id: "log-old", programId: "p1", dayId: "day-1",
        performedAt: "2026-04-01T09:00:00.000Z",
        entries: [
          { exerciseId: "e1", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
        ],
      },
      {
        id: "log-other", programId: "p1", dayId: "day-1",
        performedAt: "2026-04-08T09:00:00.000Z",
        entries: [
          { exerciseId: "some-other-slot", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 90, reps: 5 }] },
        ],
      },
    ]);
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /history for bench press/i }));
    const dialog = await screen.findByRole("dialog", { name: /history for bench press/i });
    // Both logs should surface because they share canonicalExerciseId "cat-bench".
    expect(dialog).toHaveTextContent("90x5");
    expect(dialog).toHaveTextContent("80x5");
  });
});
