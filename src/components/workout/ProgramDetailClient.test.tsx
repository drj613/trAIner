import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";
import { programRepo } from "@/lib/storage/programRepo";

// ── fixtures ──────────────────────────────────────────────────────────────────

const mockSaveProgram = jest.fn().mockResolvedValue(undefined);

const mockProgram = {
  id: "p1",
  title: "Upper/Lower",
  description: "4-day hypertrophy split",
  source: "manual" as const,
  active: true,
  days: [
    {
      id: "d1", dayNumber: 1, weekNumber: 1, title: "Upper A",
      sections: [
        {
          id: "s1", type: "strength", name: "Strength",
          groups: [
            {
              id: "g1", type: "single" as const,
              exercises: [
                {
                  id: "e1", name: "Squat", sets: 3, reps: "5",
                  tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] },
                },
                {
                  id: "e2", name: "Bench Press", sets: 3, reps: "8",
                  tags: { primary: ["chest"], secondary: [], incidental: [], modifiers: [] },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "d2", dayNumber: 2, weekNumber: 1, title: "Lower A",
      sections: [],
    },
    {
      id: "d3", dayNumber: 1, weekNumber: 2, title: "Upper B",
      sections: [],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: { get: jest.fn() },
}));

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));

jest.mock("@/lib/analysis/analyze", () => ({
  analyzeProgram: jest.fn().mockReturnValue({
    overall: { name: "Overall", score: 82, grade: "B" },
    dimensions: {
      volume:        { name: "Volume",        score: 91, grade: "A" },
      session:       { name: "Structure",     score: 88, grade: "A" },
      balance:       { name: "Balance",       score: 78, grade: "B" },
      periodization: { name: "Periodization", score: 65, grade: "C" },
    },
    muscleVolumes: [], sessions: [],
    balance: {
      pushPullRatio: null, upperLowerRatio: null, quadHamRatio: null, chestBackRatio: null,
      movementPatternsCovered: [], movementPatternsMissing: [], warnings: [],
    },
    periodization: { weeksDetected: 1, volumePattern: "static", deloadDetected: false, warnings: [] },
    warnings: [],
  }),
}));

jest.mock("./ExerciseReplaceSheet", () => ({
  ExerciseReplaceSheet: ({ onSelect, onClose }: { onSelect: (item: unknown) => void; onClose: () => void }) => (
    <div data-testid="replace-sheet">
      <button onClick={() => onSelect({
        id: "cat-rdl", name: "Romanian DL",
        aliases: [], equipment: ["barbell"], movementPatterns: ["hinge"],
        muscles: { primary: ["hamstrings"], secondary: ["glutes"] }, tags: [],
      })}>Pick Romanian DL</button>
      <button onClick={onClose}>Close sheet</button>
    </div>
  ),
}));

jest.mock("./ModifyAiModal", () => ({
  ModifyAiModal: ({ currentDay, onApply, onClose }: { currentDay: unknown; onApply: (d: unknown) => void; onClose: () => void }) => (
    <div data-testid="ai-modal">
      <button onClick={() => onApply({
        ...(currentDay as Record<string, unknown>),
        sections: [],
      })}>Apply AI change</button>
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function renderClient() {
  return render(<MemoryRouter><ProgramDetailClient id="p1" /></MemoryRouter>);
}

async function waitForLoad() {
  await waitFor(() => expect(screen.getByText("Upper/Lower")).toBeInTheDocument());
}

// ── test suites ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (programRepo.get as jest.Mock).mockResolvedValue(mockProgram);
});

describe("ProgramDetailClient V2 — week pager", () => {
  it("renders program title and description", async () => {
    renderClient();
    await waitForLoad();
    expect(screen.getByText("Upper/Lower")).toBeInTheDocument();
    expect(screen.getByText("4-day hypertrophy split")).toBeInTheDocument();
  });

  it("renders one tab per week derived from days", async () => {
    renderClient();
    await waitForLoad();
    expect(screen.getByRole("button", { name: /WK 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WK 2/i })).toBeInTheDocument();
  });

  it("shows days for the active week (WK 1 by default)", async () => {
    renderClient();
    await waitForLoad();
    expect(screen.getByText("Upper A")).toBeInTheDocument();
    expect(screen.getByText("Lower A")).toBeInTheDocument();
    expect(screen.queryByText("Upper B")).not.toBeInTheDocument();
  });

  it("switching to WK 2 tab shows week 2 days", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByRole("button", { name: /WK 2/i }));
    await waitFor(() => expect(screen.getByText("Upper B")).toBeInTheDocument());
  });
});

describe("ProgramDetailClient V2 — day card expand/collapse", () => {
  it("day cards start collapsed (no exercises visible)", async () => {
    renderClient();
    await waitForLoad();
    expect(screen.queryByText("Squat")).not.toBeInTheDocument();
  });

  it("clicking a day card header expands it and shows exercises", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
  });

  it("clicking an expanded day header collapses it", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.queryByText("Squat")).not.toBeInTheDocument());
  });

  it("rest days (no sections) are not expandable", async () => {
    renderClient();
    await waitForLoad();
    const lower = screen.getByText("Lower A");
    fireEvent.click(lower);
    await waitFor(() => expect(screen.queryByText("Add to")).not.toBeInTheDocument());
  });
});

describe("ProgramDetailClient V2 — swap exercise", () => {
  async function expandUpperA() {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
  }

  it("clicking swap button opens ExerciseReplaceSheet", async () => {
    await expandUpperA();
    const swapBtns = screen.getAllByTitle("Swap from catalogue");
    fireEvent.click(swapBtns[0]);
    expect(screen.getByTestId("replace-sheet")).toBeInTheDocument();
  });

  it("picking from catalogue shows RoutineConfirmModal with diff", async () => {
    await expandUpperA();
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
  });

  it("confirm modal defaults to 'Whole routine' scope", async () => {
    await expandUpperA();
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => {
      const wholeRoutine = screen.getByLabelText(/Whole routine/i) as HTMLInputElement;
      expect(wholeRoutine.checked).toBe(true);
    });
  });

  it("applying with 'Whole routine' scope calls saveProgram with updated days", async () => {
    await expandUpperA();
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const saved = mockSaveProgram.mock.calls[0][0];
    expect(saved.overrides).toHaveLength(0);
    const updatedDay = saved.days.find((d: { id: string }) => d.id === "d1");
    const swapped = updatedDay.sections[0].groups[0].exercises[0];
    expect(swapped.name).toBe("Romanian DL");
  });

  it("applying with 'This week' scope calls saveProgram with a week override", async () => {
    await expandUpperA();
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/This week/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const saved = mockSaveProgram.mock.calls[0][0];
    expect(saved.overrides).toHaveLength(1);
    expect(saved.overrides[0].scope).toBe("week");
    expect(saved.overrides[0].weekNumber).toBe(1);
    expect(saved.days[0].sections[0].groups[0].exercises[0].name).toBe("Squat");
  });

  it("discarding closes the confirm modal without saving", async () => {
    await expandUpperA();
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));
    expect(screen.queryByText("Review changes")).not.toBeInTheDocument();
    expect(mockSaveProgram).not.toHaveBeenCalled();
  });

  it("saving 'This week' replaces an existing same-week override rather than accumulating", async () => {
    const programWithOverride = {
      ...mockProgram,
      overrides: [
        {
          id: "existing-override",
          scope: "week" as const,
          programId: "p1",
          weekNumber: 1,
          replacement: mockProgram.days[0],
          reason: "previous edit",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    (programRepo.get as jest.Mock).mockResolvedValueOnce(programWithOverride);

    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/This week/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));

    const saved = mockSaveProgram.mock.calls[0][0];
    expect(saved.overrides).toHaveLength(1);
    expect(saved.overrides[0].id).not.toBe("existing-override");
    expect(saved.overrides[0].weekNumber).toBe(1);
  });

  it("'This week' radio is disabled when the day has no weekNumber", async () => {
    const programNoWeek = {
      ...mockProgram,
      days: [
        { ...mockProgram.days[0], weekNumber: undefined },
        ...mockProgram.days.slice(1),
      ],
    };
    (programRepo.get as jest.Mock).mockResolvedValueOnce(programNoWeek);

    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    const thisWeekRadio = screen.getByLabelText(/This week/i) as HTMLInputElement;
    expect(thisWeekRadio.disabled).toBe(true);
  });
});

describe("ProgramDetailClient V2 — override interactions", () => {
  it("saving 'Whole routine' clears any existing same-week overrides", async () => {
    const programWithOverride = {
      ...mockProgram,
      overrides: [
        {
          id: "existing-override",
          scope: "week" as const,
          programId: "p1",
          weekNumber: 1,
          replacement: mockProgram.days[0],
          reason: "previous edit",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    (programRepo.get as jest.Mock).mockResolvedValueOnce(programWithOverride);

    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    // "Whole routine" is the default scope
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));

    const saved = mockSaveProgram.mock.calls[0][0];
    expect(saved.overrides).toHaveLength(0);
  });

  it("shows a warning in the confirm modal when a week override will be cleared", async () => {
    const programWithOverride = {
      ...mockProgram,
      overrides: [
        {
          id: "existing-override",
          scope: "week" as const,
          programId: "p1",
          weekNumber: 1,
          replacement: mockProgram.days[0],
          reason: "previous edit",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    (programRepo.get as jest.Mock).mockResolvedValueOnce(programWithOverride);

    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle("Swap from catalogue")[0]);
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
    // Modal opens with scope=base (default). A week override exists for Wk 1.
    expect(screen.getByText(/week override.*cleared/i)).toBeInTheDocument();
  });
});

describe("ProgramDetailClient V2 — AI modify", () => {
  it("clicking 'Modify day' opens ModifyAiModal", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Modify day")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Modify day"));
    expect(screen.getByTestId("ai-modal")).toBeInTheDocument();
  });

  it("applying AI change shows RoutineConfirmModal", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Modify day")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Modify day"));
    fireEvent.click(screen.getByText("Apply AI change"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
  });
});

describe("ProgramDetailClient V2 — delete exercise", () => {
  it("clicking delete button shows RoutineConfirmModal with removed diff", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    const deleteBtns = screen.getAllByTitle("Remove exercise");
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
  });
});

describe("ProgramDetailClient V2 — add exercise", () => {
  it("'Add to strength' button opens ExerciseReplaceSheet", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText(/Add to strength/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Add to strength/i));
    expect(screen.getByTestId("replace-sheet")).toBeInTheDocument();
  });

  it("picking an exercise in add mode shows RoutineConfirmModal", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText(/Add to strength/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Add to strength/i));
    fireEvent.click(screen.getByText("Pick Romanian DL"));
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
  });
});

describe("ProgramDetailClient V2 — inline name editing", () => {
  it("clicking exercise name makes it editable", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Squat"));
    expect(screen.getByDisplayValue("Squat")).toBeInTheDocument();
  });

  it("blurring the input shows RoutineConfirmModal", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Squat"));
    const input = screen.getByDisplayValue("Squat") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Back Squat" } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText("Review changes")).toBeInTheDocument());
  });

  it("pressing Escape cancels without showing confirm modal", async () => {
    renderClient();
    await waitForLoad();
    fireEvent.click(screen.getByText("Upper A"));
    await waitFor(() => expect(screen.getByText("Squat")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Squat"));
    const input = screen.getByDisplayValue("Squat") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Something Else" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("Review changes")).not.toBeInTheDocument();
  });
});

describe("ProgramDetailClient V2 — group rail in routine view", () => {
  it("renders SUPERSET label inside an expanded day card", async () => {
    (programRepo.get as jest.Mock).mockResolvedValue({
      id: "p1",
      title: "Test",
      source: "manual",
      active: true,
      days: [{
        id: "day-1", dayNumber: 1, weekNumber: 1, title: "Push",
        sections: [{
          id: "s1", name: "Main", type: "strength",
          groups: [{
            id: "g1", type: "superset", notes: "rest 90s",
            exercises: [
              { id: "e1", name: "Bench", sets: 3, reps: "8",
                tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
              { id: "e2", name: "Row", sets: 3, reps: "8",
                tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
            ],
          }],
        }],
      }],
      overrides: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    render(
      <MemoryRouter>
        <ProgramDetailClient id="p1" />
      </MemoryRouter>
    );
    const header = await screen.findByText("Push");
    fireEvent.click(header);
    expect(await screen.findByText(/SUPERSET · rest 90s/)).toBeInTheDocument();
  });
});
