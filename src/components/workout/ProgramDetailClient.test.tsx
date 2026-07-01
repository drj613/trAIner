import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";
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

describe("ProgramDetailClient View→ navigation", () => {
  it("expanded day card shows View → button", async () => {
    renderDetail();
    await screen.findByText("Push Day");
    fireEvent.click(screen.getByText("Push Day"));
    expect(screen.getByRole("button", { name: /view →/i })).toBeInTheDocument();
  });
});
