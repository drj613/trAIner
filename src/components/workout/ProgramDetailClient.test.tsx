import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";
import { logRepo } from "@/lib/storage/logRepo";
import { programRepo } from "@/lib/storage/programRepo";
import type { ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";

const program: ProgramDocument = {
  id: "p1", title: "Test Routine", source: "import", active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, weekNumber: 1, title: "Push Day",
      sections: [{ id: "s1", name: "Main", type: "strength", groups: [{ id: "g1", type: "single", exercises: [{ id: "e1", name: "Bench Press", sets: 3, reps: "8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } }] }] }],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let mockLogs: WorkoutLogDocument[] = [];

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: {
    get: jest.fn().mockImplementation(async () => program),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    listForProgram: jest.fn().mockImplementation(async () => mockLogs),
  },
}));

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    saveProgram: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/analysis/analyze", () => {
  const actual = jest.requireActual("@/lib/analysis/analyze");
  return { analyzeProgram: jest.fn(actual.analyzeProgram) };
});

jest.mock("./ModifyAiModal", () => ({
  ModifyAiModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="ai-modal">
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

function DayRoute() {
  return <div data-testid="day-route">{useLocation().pathname}</div>;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/programs/p1"]}>
      <Routes>
        <Route path="/programs/:id" element={<ProgramDetailClient id="p1" />} />
        <Route path="/programs/:id/days/:dayId" element={<DayRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLogs = [];
});

describe("ProgramDetailClient completion badges", () => {
  it("shows green ● when day has a completed log", async () => {
    mockLogs = [{
      id: "l1", programId: "p1", dayId: "day-1",
      performedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T11:00:00.000Z",
      entries: [],
    }];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("●")).toBeInTheDocument();
  });

  it("shows muted ~ when day was skipped", async () => {
    mockLogs = [{
      id: "l2", programId: "p1", dayId: "day-1",
      performedAt: "2026-05-20T10:00:00.000Z",
      completedAt: "2026-05-20T10:01:00.000Z",
      skippedAt: "2026-05-20T10:01:00.000Z",
      entries: [],
    }];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("~")).toBeInTheDocument();
  });

  it("shows nothing when no log exists for the day", async () => {
    mockLogs = [];
    renderDetail();
    await screen.findByText("Push Day");
    // Give logs time to settle (empty) then assert no badge
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("●")).not.toBeInTheDocument();
    expect(screen.queryByText("~")).not.toBeInTheDocument();
  });
});

describe("ProgramDetailClient badges survive an unreadable stored timestamp", () => {
  // `src/lib/storage/appDb.ts:186-195` preserves a log whose fields it cannot
  // read, so a hand-edited or foreign backup reaches this page with a
  // `completedAt` or `performedAt` that is not a string, and
  // `(b.completedAt ?? b.performedAt).localeCompare(...)` threw out of the week
  // grid's render with no error boundary above it — the whole program page.
  //
  // THREE logs, not two, and both orderings: with two elements V8 calls the
  // comparator once and `localeCompare` coerces its *argument*, so only the
  // receiver throws and a two-log fixture is green without the fix.
  const readableNewest: WorkoutLogDocument = {
    id: "l-new", programId: "p1", dayId: "day-1",
    performedAt: "2026-05-20T10:00:00.000Z",
    completedAt: "2026-05-20T11:00:00.000Z",
    entries: [],
  };
  const readableOldest: WorkoutLogDocument = {
    id: "l-old", programId: "p1", dayId: "day-1",
    performedAt: "2026-05-18T10:00:00.000Z",
    completedAt: "2026-05-18T11:00:00.000Z",
    entries: [],
  };

  it.each([
    ["a number", 7],
    ["an object", {}],
    ["an array", []],
    ["a boolean", true],
  ])("renders the day badge when one log's completedAt is %s", async (_label, bad) => {
    const unreadable = {
      id: "l-bad", programId: "p1", dayId: "day-1",
      performedAt: "2026-05-19T10:00:00.000Z",
      completedAt: bad,
      entries: [],
    } as unknown as WorkoutLogDocument;
    mockLogs = [readableOldest, unreadable, readableNewest];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("\u25cf")).toBeInTheDocument();
  });

  it("renders the day badge in the reverse ordering too", async () => {
    const unreadable = {
      id: "l-bad", programId: "p1", dayId: "day-1",
      performedAt: "2026-05-19T10:00:00.000Z",
      completedAt: 7,
      entries: [],
    } as unknown as WorkoutLogDocument;
    mockLogs = [readableNewest, unreadable, readableOldest];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("\u25cf")).toBeInTheDocument();
  });

  it("falls back to performedAt so an unreadable completedAt still places the log", async () => {
    // The unreadable value is on the log that is genuinely newest. Falling back
    // to its readable `performedAt` keeps it first, and it has no readable
    // `completedAt`, so the day reads as in-progress rather than complete.
    const unreadable = {
      id: "l-bad", programId: "p1", dayId: "day-1",
      performedAt: "2026-05-25T10:00:00.000Z",
      completedAt: 7,
      entries: [],
    } as unknown as WorkoutLogDocument;
    mockLogs = [readableOldest, readableNewest, unreadable];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("\u00b7")).toBeInTheDocument();
    expect(screen.queryByText("\u25cf")).not.toBeInTheDocument();
  });

  it("renders the day badge when one log's performedAt is not a string", async () => {
    const unreadable = {
      id: "l-bad", programId: "p1", dayId: "day-1",
      performedAt: 7,
      entries: [],
    } as unknown as WorkoutLogDocument;
    mockLogs = [readableOldest, unreadable, readableNewest];
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("\u25cf")).toBeInTheDocument();
  });
});

describe("ProgramDetailClient View→ navigation", () => {
  it("expanded day card shows View workout button", async () => {
    renderDetail();
    await screen.findByText("Push Day");
    fireEvent.click(screen.getByText("Push Day"));
    expect(screen.getByRole("button", { name: /view workout/i })).toBeInTheDocument();
  });
});

describe("ProgramDetailClient progression display", () => {
  it("renders nothing when progression is absent", async () => {
    renderDetail();
    await screen.findByText("Push Day");
    expect(screen.queryByText("Progression")).not.toBeInTheDocument();
  });

  it("renders each applies/rule entry when progression is present", async () => {
    (programRepo.get as jest.Mock).mockResolvedValueOnce({
      ...program,
      progression: [
        { applies: "Primary compounds", rule: "Add 2.5-5% load when top set hits RPE8 for all reps." },
        { applies: "Hypertrophy accessories", rule: "Double progression: add reps, then +5-10% load and reset." },
      ],
    });
    renderDetail();
    await screen.findByText("Push Day");
    expect(await screen.findByText("Progression")).toBeInTheDocument();
    expect(screen.getByText(/Primary compounds/)).toBeInTheDocument();
    expect(screen.getByText(/Add 2\.5-5% load when top set hits RPE8 for all reps\./)).toBeInTheDocument();
    expect(screen.getByText(/Hypertrophy accessories/)).toBeInTheDocument();
    expect(screen.getByText(/Double progression: add reps, then \+5-10% load and reset\./)).toBeInTheDocument();
  });
});

describe("ProgramDetailClient goal persistence", () => {
  it("persists a goal change and re-renders partial grading", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /view analysis/i }));
    const select = screen.getByLabelText(/routine goal/i);
    fireEvent.change(select, { target: { value: "strength" } });
    await waitFor(() =>
      expect(programRepo.save).toHaveBeenCalledWith(expect.objectContaining({ goal: "strength" })),
    );
    expect(await screen.findByText(/·\s*partial/)).toBeTruthy();
  });

  it("rolls back and alerts when the goal save fails", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (programRepo.save as jest.Mock).mockRejectedValueOnce(new Error("quota"));
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /view analysis/i }));
    const select = screen.getByLabelText(/routine goal/i);
    fireEvent.change(select, { target: { value: "strength" } });
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect((select as HTMLSelectElement).value).toBe("general"); // rolled back
    alertSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

it("opens a workout from the overview before expanding a day", async () => {
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: /next.*push day.*week 1/i }));
  expect(screen.getByTestId("day-route")).toBeInTheDocument();
});

it("names the next incomplete workout instead of reopening a finished first day", async () => {
  const next = { ...structuredClone(program.days[0]), id: "day-2", dayNumber: 2, weekNumber: 2, title: "Pull Day" };
  (programRepo.get as jest.Mock).mockResolvedValueOnce({ ...program, days: [...program.days, next] });
  mockLogs = [{ id: "done", programId: "p1", dayId: "day-1", performedAt: "2026-01-02T12:00:00Z", completedAt: "2026-01-02T13:00:00Z", entries: [] }];
  renderDetail();
  expect(await screen.findByRole("button", { name: /next.*pull day.*week 2/i })).toBeInTheDocument();
  expect(screen.getByText("Pull Day")).toBeInTheDocument();
  expect(screen.getByText("Next workout")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "WK 1" }));
  expect(screen.getByText("Push Day")).toBeInTheDocument();
  expect(screen.queryByText("Pull Day")).not.toBeInTheDocument();
});


it("routes to the next incomplete day even while an earlier week is selected", async () => {
  const next = { ...structuredClone(program.days[0]), id: "day-2", dayNumber: 2, weekNumber: 2, title: "Pull Day" };
  (programRepo.get as jest.Mock).mockResolvedValueOnce({ ...program, days: [...program.days, next] });
  mockLogs = [{ id: "done", programId: "p1", dayId: "day-1", performedAt: "2026-01-02T12:00:00Z", completedAt: "2026-01-02T13:00:00Z", entries: [] }];
  renderDetail();
  await screen.findByRole("button", { name: /next.*pull day.*week 2/i });
  fireEvent.click(screen.getByRole("button", { name: "WK 1" }));
  expect(screen.getByText("Push Day")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /next.*pull day.*week 2/i }));
  expect(screen.getByTestId("day-route")).toHaveTextContent("/programs/p1/days/day-2");
});

it("waits for workout logs before offering a next target", async () => {
  let finish!: (logs: WorkoutLogDocument[]) => void;
  (logRepo.listForProgram as jest.Mock).mockReturnValueOnce(new Promise<WorkoutLogDocument[]>((resolve) => { finish = resolve; }));
  renderDetail();
  await screen.findByText("Push Day");
  expect(screen.getByRole("button", { name: /loading workout logs/i })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /next:/i })).not.toBeInTheDocument();
  await act(async () => { finish([]); });
  expect(await screen.findByRole("button", { name: /next.*push day/i })).toBeEnabled();
});

it("reports unavailable logs without offering an assumed first day", async () => {
  (logRepo.listForProgram as jest.Mock).mockRejectedValueOnce(new Error("unavailable"));
  renderDetail();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load workout logs");
  expect(screen.queryByRole("button", { name: /next:/i })).not.toBeInTheDocument();
});

it("shows the stored draft lifecycle separately from completed workout logs", async () => {
  (programRepo.get as jest.Mock).mockResolvedValueOnce({ ...program, active: false, status: "draft" });
  mockLogs = [{ id: "done", programId: "p1", dayId: "day-1", performedAt: "2026-01-02T12:00:00Z", completedAt: "2026-01-02T13:00:00Z", entries: [] }];
  renderDetail();
  expect(await screen.findByText("Plan: Draft")).toBeInTheDocument();
  expect(await screen.findByText("Logged: Done")).toBeInTheDocument();
  expect(programRepo.save).not.toHaveBeenCalled();
});

it("marks the next day when visible and keeps the selected week after a goal update", async () => {
  const next = { ...structuredClone(program.days[0]), id: "day-2", dayNumber: 2, weekNumber: 2, title: "Pull Day" };
  (programRepo.get as jest.Mock).mockResolvedValueOnce({ ...program, days: [...program.days, next] });
  renderDetail();
  await screen.findByRole("button", { name: /next.*push day/i });
  expect(screen.getByText("Next workout")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "WK 2" }));
  fireEvent.click(screen.getByRole("button", { name: /view analysis/i }));
  fireEvent.change(screen.getByLabelText(/routine goal/i), { target: { value: "strength" } });
  await waitFor(() => expect(programRepo.save).toHaveBeenCalled());
  expect(screen.getByText("Pull Day")).toBeInTheDocument();
  expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
});


it("keeps an explicit week selection when delayed workout logs reveal a later next day", async () => {
  const next = { ...structuredClone(program.days[0]), id: "day-2", dayNumber: 2, weekNumber: 2, title: "Pull Day" };
  (programRepo.get as jest.Mock).mockResolvedValueOnce({ ...program, days: [...program.days, next] });
  let finish!: (logs: WorkoutLogDocument[]) => void;
  (logRepo.listForProgram as jest.Mock).mockReturnValueOnce(new Promise<WorkoutLogDocument[]>((resolve) => { finish = resolve; }));
  renderDetail();
  await screen.findByText("Push Day");
  fireEvent.click(screen.getByRole("button", { name: "WK 1" }));
  await act(async () => {
    finish([{ id: "done", programId: "p1", dayId: "day-1", performedAt: "2026-01-02T12:00:00Z", completedAt: "2026-01-02T13:00:00Z", entries: [] }]);
  });
  expect(screen.getByRole("button", { name: /next.*pull day.*week 2/i })).toBeEnabled();
  expect(screen.getByText("Push Day")).toBeInTheDocument();
  expect(screen.queryByText("Pull Day")).not.toBeInTheDocument();
});
