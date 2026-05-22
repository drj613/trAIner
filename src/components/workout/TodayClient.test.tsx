import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TodayClient } from "./TodayClient";
import type { ProfileDocument } from "@/lib/programs/types";

const makeExercise = (id: string, name: string) => ({
  id, name, sets: 3, reps: "8-10",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});

const program = {
  id: "p1", title: "Test", source: "import" as const, active: true,
  days: [{
    id: "day-1", dayNumber: 1, title: "Push",
    sections: [{
      id: "s1", name: "Main", type: "strength" as const,
      groups: [{ id: "g1", type: "single" as const, exercises: [makeExercise("e1", "Bench Press")] }]
    }]
  }],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const twoDay = {
  id: "p2", title: "Two Day", source: "import" as const, active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, title: "Push",
      sections: [{
        id: "s1", name: "Main", type: "strength" as const,
        groups: [{ id: "g1", type: "single" as const, exercises: [makeExercise("e1", "Bench Press")] }]
      }],
    },
    {
      id: "day-2", dayNumber: 2, title: "Pull",
      sections: [{
        id: "s2", name: "Main", type: "strength" as const,
        groups: [{ id: "g2", type: "single" as const, exercises: [makeExercise("e2", "Pull-Up")] }]
      }],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let mockProfile: ProfileDocument | undefined = undefined;
let mockPrograms: ProfileDocument[] = []; // will be ProgramDocument[] but declared loosely

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: mockPrograms,
    profile: mockProfile,
    loading: false,
    error: undefined,
    refresh: jest.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  mockProfile = undefined;
  mockPrograms = [];
  saveMock.mockClear();
});

describe("TodayClient", () => {
  it("shows profile setup banner when no profile exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/set up your Profile/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the banner when profile exists", () => {
    mockProfile = {
      id: "local-profile",
      name: "Alex",
      goals: [],
      equipment: [],
      constraints: [],
      trainingAge: "2 years",
      defaultDaysPerWeek: 4,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.queryByText(/set up your Profile/i)).not.toBeInTheDocument();
  });

  it("shows 3-step onboarding when no program exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/Fill out your Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a coach on Prompts/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste the AI/i)).toBeInTheDocument();
  });

  it("marks step 1 done when profile exists", () => {
    mockProfile = {
      id: "local-profile",
      name: "Alex",
      goals: [],
      equipment: [],
      constraints: [],
      trainingAge: "2 years",
      defaultDaysPerWeek: 4,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    const step1Link = screen.getByRole("link", { name: /Fill out your Profile/i });
    expect(step1Link.textContent).toMatch(/✓/);
  });
});

describe("TodayClient format guide", () => {
  it("renders a format guide summary element in the day header", async () => {
    mockPrograms = [program];
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    await screen.findByText("Push"); // wait for day to render
    expect(screen.getByText(/format guide/i)).toBeInTheDocument();
  });

  it("format guide details contains example entries", async () => {
    mockPrograms = [program];
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    await screen.findByText("Push");
    const summary = screen.getByText(/format guide/i);
    const details = summary.closest("details");
    expect(details?.textContent).toMatch(/70×8/);
    expect(details?.textContent).toMatch(/skip/);
    expect(details?.textContent).toMatch(/pain/);
  });
});

describe("TodayClient exercise edit", () => {
  it("saves a day-scoped override when the user edits a prescription", async () => {
    const saveProgram = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(require("@/lib/storage/programRepo").programRepo, "get").mockResolvedValue(program);
    jest.spyOn(require("@/lib/storage/programRepo").programRepo, "save").mockImplementation(saveProgram);
    mockProfile = {
      id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
      trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockPrograms = [program as unknown as ProfileDocument];
    const user = userEvent.setup();
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    const editBtn = await screen.findByRole("button", { name: /edit prescription for bench press/i });
    await user.click(editBtn);
    await user.clear(screen.getByLabelText(/reps/i));
    await user.type(screen.getByLabelText(/reps/i), "5");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(saveProgram).toHaveBeenCalledWith(expect.objectContaining({
      overrides: expect.arrayContaining([
        expect.objectContaining({ scope: "day", dayId: "day-1" }),
      ]),
    }));
  });
});

describe("TodayClient auto-save", () => {
  it("auto-saves cells after debounce delay", async () => {
    jest.useFakeTimers();
    mockProfile = {
      id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
      trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockPrograms = [program as unknown as ProfileDocument];
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    const cells = await screen.findAllByRole("textbox");
    await user.type(cells[0], "60x10");
    // SetCell commits onBlur (see SetCell.tsx) — tab away to flush the onChange.
    await user.tab();
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][0].entries[0].sets[0]).toEqual({
      setNumber: 1, weight: 60, reps: 10,
    });
    jest.useRealTimers();
  });

  it("persists per-exercise notes in the saved log", async () => {
    jest.useFakeTimers();
    mockProfile = {
      id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
      trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockPrograms = [program as unknown as ProfileDocument];
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    await user.click(await screen.findByText(/add note/i));
    await user.type(screen.getByPlaceholderText(/your note about this set/i), "felt strong");
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(saveMock.mock.calls.at(-1)![0].entries[0].notes).toBe("felt strong");
    jest.useRealTimers();
  });
});

describe("TodayClient finish and advance", () => {
  it("shows day 1 initially when there are no logs", async () => {
    mockPrograms = [twoDay as unknown as ProfileDocument];
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: "Push" })).toBeInTheDocument();
  });

  it("advances to the next day after pressing Finish workout", async () => {
    jest.useFakeTimers();
    mockPrograms = [twoDay as unknown as ProfileDocument];
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    await screen.findByRole("heading", { level: 1, name: "Push" });

    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });

    expect(screen.getByRole("heading", { level: 1, name: "Pull" })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("wraps from the last day back to day 1", async () => {
    jest.useFakeTimers();
    // Seed a completed log for day-1 yesterday so the resolver starts on day-2
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    require("@/lib/storage/logRepo").logRepo.listForProgram.mockResolvedValueOnce([
      {
        id: "l1",
        programId: "p2",
        dayId: "day-1",
        performedAt: `${yesterday}T10:00:00.000Z`,
        completedAt: `${yesterday}T11:00:00.000Z`,
        entries: [],
      },
    ]);
    mockPrograms = [twoDay as unknown as ProfileDocument];
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    await screen.findByRole("heading", { level: 1, name: "Pull" }); // starts on day-2

    await user.click(screen.getByRole("button", { name: /finish workout/i }));
    await act(async () => { jest.advanceTimersByTime(800); });

    expect(screen.getByRole("heading", { level: 1, name: "Push" })).toBeInTheDocument();
    jest.useRealTimers();
  });
});
