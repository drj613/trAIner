import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/programs/p1"]}>
      <Routes>
        <Route path="/programs/:id" element={<ProgramDetailClient id="p1" />} />
        <Route path="/programs/:id/days/:dayId" element={<div data-testid="day-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
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
  it("expanded day card shows View → button", async () => {
    renderDetail();
    await screen.findByText("Push Day");
    fireEvent.click(screen.getByText("Push Day"));
    expect(screen.getByRole("button", { name: /view →/i })).toBeInTheDocument();
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
    const select = await screen.findByLabelText(/routine goal/i);
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
    const select = await screen.findByLabelText(/routine goal/i);
    fireEvent.change(select, { target: { value: "strength" } });
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect((select as HTMLSelectElement).value).toBe("general"); // rolled back
    alertSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
