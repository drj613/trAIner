# Routine Overview V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only `ProgramDetailClient` with a swipeable week pager containing expandable day cards where exercises can be swapped, AI-modified, deleted, added, and renamed — all inline, no navigation.

**Architecture:** `ProgramDetailClient.tsx` is completely rewritten with internal subcomponents (`WeekTabStrip`, `WeekPager`, `DayCard`, `SectionHeader`, `ExerciseRow`, `RoutineConfirmModal`). A new `addExercise` pure function is added to `exerciseSwap.ts`. All existing sheets (`ModifyAiModal`, `ExerciseReplaceSheet`) and the existing `DiffReview` component are reused unchanged. Changes are confirmed via an inline scope modal (Whole routine vs This week) before being written to `programRepo`.

**Tech Stack:** React 19, TypeScript, `@testing-library/react`, Jest, `idb` (IndexedDB via programRepo), `react-router-dom`, `lucide-react`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/workout/exerciseSwap.ts` | Add `addExercise` export |
| Modify | `src/lib/workout/exerciseSwap.test.ts` | Tests for `addExercise` |
| Rewrite | `src/components/workout/ProgramDetailClient.tsx` | Full V2 implementation |
| Rewrite | `src/components/workout/ProgramDetailClient.test.tsx` | V2 behavioural tests |

No other files change.

---

## Task 1: `addExercise` utility

**Files:**
- Modify: `src/lib/workout/exerciseSwap.ts`
- Modify: `src/lib/workout/exerciseSwap.test.ts`

- [ ] **Step 1.1 — Write failing tests**

Append to `src/lib/workout/exerciseSwap.test.ts`:

```ts
import { swapExercise, addExercise } from "./exerciseSwap";
// (existing imports above — only add addExercise to the named import)

// Reuse mockDay and catalogItem from above — paste at top of new describe block

describe("addExercise", () => {
  it("appends a new single group to the target section", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const groups = result.sections[0].groups;
    expect(groups).toHaveLength(2);
    expect(groups[1].type).toBe("single");
  });

  it("new exercise has name and canonicalExerciseId from catalog item", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const ex = result.sections[0].groups[1].exercises[0];
    expect(ex.name).toBe("Leg Press");
    expect(ex.canonicalExerciseId).toBe("cat-leg-press");
  });

  it("new exercise gets default sets:3 reps:'8-10'", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const ex = result.sections[0].groups[1].exercises[0];
    expect(ex.sets).toBe(3);
    expect(ex.reps).toBe("8-10");
  });

  it("new exercise and group have unique string ids", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const newGroup = result.sections[0].groups[1];
    expect(typeof newGroup.id).toBe("string");
    expect(newGroup.id).not.toBe("grp-1");
    expect(typeof newGroup.exercises[0].id).toBe("string");
  });

  it("new exercise tags come from catalog item muscles", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const tags = result.sections[0].groups[1].exercises[0].tags;
    expect(tags.primary).toEqual(["quads"]);
    expect(tags.secondary).toEqual(["glutes"]);
    expect(tags.incidental).toEqual([]);
    expect(tags.modifiers).toEqual([]);
  });

  it("returns original day reference when sectionId is not found", () => {
    const result = addExercise(mockDay, "sec-999", catalogItem);
    expect(result).toBe(mockDay);
  });

  it("leaves other sections untouched", () => {
    const day2: ProgramDay = {
      ...mockDay,
      sections: [
        mockDay.sections[0],
        { id: "sec-2", type: "warmup", name: "Warm-up", groups: [] },
      ],
    };
    const result = addExercise(day2, "sec-1", catalogItem);
    expect(result.sections[1].groups).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2 — Run to confirm failure**

```bash
npx jest exerciseSwap --no-coverage
```

Expected: `addExercise is not a function` or similar import error.

- [ ] **Step 1.3 — Implement `addExercise`**

Append to `src/lib/workout/exerciseSwap.ts`:

```ts
export function addExercise(
  day: ProgramDay,
  sectionId: string,
  item: ExerciseCatalogItem,
): ProgramDay {
  const found = day.sections.some((s) => s.id === sectionId);
  if (!found) return day;

  return {
    ...day,
    sections: day.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const newGroup: ProgramGroup = {
        id: crypto.randomUUID(),
        type: "single",
        exercises: [
          {
            id: crypto.randomUUID(),
            name: item.name,
            canonicalExerciseId: item.id,
            sets: 3,
            reps: "8-10",
            tags: {
              primary: item.muscles.primary,
              secondary: item.muscles.secondary,
              incidental: [],
              modifiers: [],
            },
          },
        ],
      };
      return { ...section, groups: [...section.groups, newGroup] };
    }),
  };
}
```

Also add `ProgramGroup` to the import at the top of the file:

```ts
import type { ProgramDay, ProgramGroup } from "@/lib/programs/types";
```

- [ ] **Step 1.4 — Run tests to confirm pass**

```bash
npx jest exerciseSwap --no-coverage
```

Expected: all tests pass, including original `swapExercise` suite.

- [ ] **Step 1.5 — Commit**

```bash
git add src/lib/workout/exerciseSwap.ts src/lib/workout/exerciseSwap.test.ts
git commit -m "feat: add addExercise utility to exerciseSwap"
```

---

## Task 2: Write failing V2 tests for ProgramDetailClient

**Files:**
- Rewrite: `src/components/workout/ProgramDetailClient.test.tsx`

- [ ] **Step 2.1 — Replace the test file**

Write `src/components/workout/ProgramDetailClient.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";

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
  programRepo: { get: jest.fn().mockResolvedValue(mockProgram) },
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

// Shallow mocks for sheets — they expose test hooks to simulate user actions
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

beforeEach(() => jest.clearAllMocks());

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
    // WK 2 day should not be visible without clicking WK 2 tab
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
    // Still no exercises visible — rest day has no sections
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
    // Days array is mutated directly — no overrides added
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
    // Base days unchanged
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
```

- [ ] **Step 2.2 — Run to confirm all new tests fail**

```bash
npx jest ProgramDetailClient --no-coverage
```

Expected: many failures — old component doesn't render week tabs, day cards, etc.

---

## Task 3: Implement week pager layout

**Files:**
- Rewrite: `src/components/workout/ProgramDetailClient.tsx`

- [ ] **Step 3.1 — Write the new ProgramDetailClient (full file)**

Write `src/components/workout/ProgramDetailClient.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, ChevronLeft, Map, Sparkles, Trash2 } from "lucide-react";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import { sectionKind } from "@/lib/workout/sectionKind";
import { diffDays } from "@/lib/workout/programDiff";
import { swapExercise, addExercise } from "@/lib/workout/exerciseSwap";
import { programRepo } from "@/lib/storage/programRepo";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { RoutineAnalysisCard } from "@/components/analysis/RoutineAnalysisCard";
import { LlmAnalysisSheet } from "@/components/analysis/LlmAnalysisSheet";
import { ModifyAiModal } from "./ModifyAiModal";
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";
import { DiffReview } from "./DiffReview";
import type { ProgramDay, ProgramDocument, ProgramSection } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReplaceTarget =
  | { kind: "swap"; day: ProgramDay; exId: string }
  | { kind: "add"; day: ProgramDay; sectionId: string };

type PendingChange = { original: ProgramDay; replacement: ProgramDay };

// ── WeekTabStrip ──────────────────────────────────────────────────────────────

function WeekTabStrip({
  weeks,
  activeWeek,
  onSelect,
}: {
  weeks: ReturnType<typeof buildWeekGrid>;
  activeWeek: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        padding: "0 12px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg)",
        flexShrink: 0,
      }}
    >
      {weeks.map((wk, i) => {
        const isCurrent = i === activeWeek;
        const allDone = wk.days.every((d) => d.sections.length === 0);
        return (
          <button
            key={wk.weekNumber}
            onClick={() => onSelect(i)}
            aria-label={`WK ${wk.weekNumber}`}
            style={{
              flex: 1,
              padding: "8px 4px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${isCurrent ? "var(--accent)" : "transparent"}`,
              color: isCurrent ? "var(--accent)" : "var(--fg-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>
              WK {wk.weekNumber}
            </span>
            <div style={{ display: "flex", gap: 2 }}>
              {wk.days.map((d) => {
                const isRest = d.sections.length === 0;
                return (
                  <span
                    key={d.id}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: isRest ? "transparent" : "var(--line-2)",
                      border: isRest ? "1px dashed var(--line-2)" : "none",
                      opacity: isRest ? 0.5 : 1,
                    }}
                  />
                );
              })}
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.08em",
                color: allDone ? "var(--good)" : isCurrent ? "var(--accent)" : "var(--fg-4)",
              }}
            >
              {isCurrent ? "CURRENT" : allDone ? "DONE" : i < activeWeek ? "PAST" : "UPCOMING"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ section }: { section: ProgramSection }) {
  const { glyph } = sectionKind(section.type);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 10px 4px",
        borderBottom: "1px dashed var(--line)",
        background: "color-mix(in oklab, var(--bg-3) 50%, transparent)",
      }}
    >
      <span style={{ color: "var(--accent)", fontSize: 11, flexShrink: 0 }}>{glyph}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          flex: 1,
        }}
      >
        {section.name}
      </span>
    </div>
  );
}

// ── ExerciseRow ───────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  index,
  last,
  onSwap,
  onAi,
  onDelete,
  onCommitName,
}: {
  exercise: ProgramDay["sections"][0]["groups"][0]["exercises"][0];
  index: string;
  last: boolean;
  onSwap: () => void;
  onAi: () => void;
  onDelete: () => void;
  onCommitName: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(exercise.name);

  useEffect(() => { setName(exercise.name); }, [exercise.name]);

  function commitName() {
    setEditing(false);
    if (name.trim() && name !== exercise.name) onCommitName(name.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") { setName(exercise.name); setEditing(false); }
  }

  const prescription = [
    exercise.sets ? `${exercise.sets}×` : "",
    exercise.reps ?? "",
    exercise.load ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-4)", width: 24, flexShrink: 0 }}>
        {index}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              color: "var(--fg)",
              border: "1px solid var(--accent)",
              borderRadius: 2,
              padding: "1px 5px",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 500,
              outline: "none",
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            style={{ fontSize: 12.5, fontWeight: 500, cursor: "text", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {exercise.name}
          </span>
        )}
        {prescription && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)", marginTop: 1 }}>
            {prescription}
            {exercise.rest && <span style={{ color: "var(--fg-4)", marginLeft: 6 }}>rest {exercise.rest}</span>}
          </div>
        )}
      </div>
      <button className="btn ghost" title="Swap from catalogue" onClick={onSwap} style={{ padding: "3px 5px" }}>
        <ArrowLeftRight size={11} aria-hidden />
      </button>
      <button className="btn ghost" title="Modify with AI" onClick={onAi} style={{ padding: "3px 5px" }}>
        <Sparkles size={11} aria-hidden />
      </button>
      <button className="btn ghost" title="Remove exercise" onClick={onDelete} style={{ padding: "3px 5px", color: "var(--fg-3)" }}>
        <Trash2 size={11} aria-hidden />
      </button>
    </div>
  );
}

// ── DayCard ───────────────────────────────────────────────────────────────────

function DayCard({
  day,
  weekIndex,
  expanded,
  onToggle,
  onSwapEx,
  onAiEx,
  onDeleteEx,
  onAddEx,
  onCommitName,
  onModifyDay,
  onStart,
}: {
  day: ProgramDay;
  weekIndex: number;
  expanded: boolean;
  onToggle: () => void;
  onSwapEx: (exId: string) => void;
  onAiEx: () => void;
  onDeleteEx: (sectionId: string, exId: string) => void;
  onAddEx: (sectionId: string) => void;
  onCommitName: (sectionId: string, exId: string, name: string) => void;
  onModifyDay: () => void;
  onStart: () => void;
}) {
  const isRest = day.sections.length === 0;
  const exCount = day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0);
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const label = DAY_LABELS[(day.dayNumber - 1) % 7] ?? `D${day.dayNumber}`;

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--line)",
        borderRadius: "var(--r)",
        marginBottom: 8,
        overflow: "hidden",
        opacity: isRest ? 0.65 : 1,
      }}
    >
      {/* Header */}
      <div
        onClick={() => !isRest && onToggle()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 10px",
          cursor: isRest ? "default" : "pointer",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", width: 28, flexShrink: 0, letterSpacing: "0.06em" }}>
          {label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {day.title}
          </div>
          {!isRest && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>
              {exCount} ex · {day.sections.length} section{day.sections.length !== 1 ? "s" : ""}
            </div>
          )}
          {isRest && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)" }}>rest</div>
          )}
        </div>
        {!isRest && (
          <span style={{ color: "var(--fg-3)", fontSize: 12 }}>{expanded ? "▾" : "▸"}</span>
        )}
      </div>

      {/* Expanded body */}
      {expanded && !isRest && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {day.sections.map((section, si) => (
            <div key={section.id}>
              <SectionHeader section={section} />
              {section.groups.flatMap((group, gi) =>
                group.exercises.map((ex, ei) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    index={`${si + 1}.${ei + 1}`}
                    last={gi === section.groups.length - 1 && ei === group.exercises.length - 1}
                    onSwap={() => onSwapEx(ex.id)}
                    onAi={onAiEx}
                    onDelete={() => onDeleteEx(section.id, ex.id)}
                    onCommitName={(name) => onCommitName(section.id, ex.id, name)}
                  />
                ))
              )}
              <button
                className="btn ghost"
                onClick={() => onAddEx(section.id)}
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  padding: "6px 10px",
                  borderRadius: 0,
                  borderBottom: si < day.sections.length - 1 ? "1px solid var(--line)" : "none",
                  color: "var(--fg-3)",
                  fontSize: 11,
                }}
              >
                + Add to {section.name.toLowerCase()}
              </button>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 8,
              background: "var(--bg-2)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <button
              className="btn"
              onClick={onModifyDay}
              style={{ flex: 1, justifyContent: "center", padding: "6px 8px", fontSize: 11.5 }}
            >
              <Sparkles size={11} aria-hidden /> Modify day
            </button>
            <button
              className="btn primary"
              onClick={onStart}
              style={{ flex: 1, justifyContent: "center", padding: "6px 8px", fontSize: 11.5 }}
            >
              Start →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RoutineConfirmModal ───────────────────────────────────────────────────────

function RoutineConfirmModal({
  pending,
  scope,
  onScopeChange,
  onAccept,
  onDiscard,
  saving,
  saveError,
}: {
  pending: PendingChange;
  scope: "base" | "week";
  onScopeChange: (s: "base" | "week") => void;
  onAccept: () => void;
  onDiscard: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const diffs = diffDays(pending.original, pending.replacement);
  const weekDisabled = pending.original.weekNumber === undefined;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div onClick={onDiscard} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review changes"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "85vh",
          background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>Review changes</h2>
        </div>

        {/* Scope selector */}
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 16px 8px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", alignSelf: "center" }}>
            Apply to
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer" }}>
            <input
              type="radio"
              name="routine-scope"
              value="base"
              checked={scope === "base"}
              onChange={() => onScopeChange("base")}
              style={{ accentColor: "var(--accent)" }}
            />
            Whole routine
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              cursor: weekDisabled ? "not-allowed" : "pointer",
              opacity: weekDisabled ? 0.4 : 1,
            }}
          >
            <input
              type="radio"
              name="routine-scope"
              value="week"
              checked={scope === "week"}
              disabled={weekDisabled}
              onChange={() => onScopeChange("week")}
              style={{ accentColor: "var(--accent)" }}
            />
            This week (Wk {pending.original.weekNumber ?? "?"})
          </label>
        </div>

        {/* Diff */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <DiffReview
            diffs={diffs}
            replacement={pending.replacement}
            onAccept={onAccept}
            onDiscard={onDiscard}
          />
        </div>

        {saveError && (
          <p style={{ margin: 0, padding: "4px 16px", fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ProgramDetailClient ───────────────────────────────────────────────────────

export function ProgramDetailClient({ id }: { id: string }) {
  const navigate = useNavigate();
  const { saveProgram } = useLocalData();

  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [activeWeek, setActiveWeek] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragDX, setDragDX] = useState(0);
  const [aiModalDay, setAiModalDay] = useState<ProgramDay | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [scope, setScope] = useState<"base" | "week">("base");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  const displayAnalysis = useMemo(() => {
    if (!program) return null;
    const start = performance.now();
    const result = analyzeProgram(program);
    const durationMs = Math.round(performance.now() - start);
    return toDisplayAnalysis(result, durationMs);
  }, [program]);

  const weeks = useMemo(
    () => (program ? buildWeekGrid(getRenderableDays(program)) : []),
    [program],
  );

  // Pointer drag for week pager
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, dx: 0, dragging: false, width: 0 });

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
    dragRef.current = { startX: e.clientX, dx: 0, dragging: true, width: scrollerRef.current?.clientWidth ?? 375 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    dragRef.current.dx = e.clientX - dragRef.current.startX;
    setDragDX(dragRef.current.dx);
  }
  function onPointerUp() {
    if (!dragRef.current.dragging) return;
    const { dx, width } = dragRef.current;
    dragRef.current.dragging = false;
    setDragDX(0);
    if (Math.abs(dx) > width * 0.2) {
      setActiveWeek((w) => Math.max(0, Math.min(weeks.length - 1, w + (dx < 0 ? 1 : -1))));
    }
  }

  // ── Mutation helpers ────────────────────────────────────────────────────────

  function openConfirm(original: ProgramDay, replacement: ProgramDay) {
    setScope("base");
    setSaveError(null);
    setPendingChange({ original, replacement });
  }

  function buildDeleteDay(day: ProgramDay, sectionId: string, exId: string): ProgramDay {
    return {
      ...day,
      sections: day.sections.map((s) =>
        s.id !== sectionId ? s : {
          ...s,
          groups: s.groups
            .map((g) => ({ ...g, exercises: g.exercises.filter((e) => e.id !== exId) }))
            .filter((g) => g.exercises.length > 0),
        }
      ),
    };
  }

  function buildRenameDay(day: ProgramDay, sectionId: string, exId: string, name: string): ProgramDay {
    return {
      ...day,
      sections: day.sections.map((s) =>
        s.id !== sectionId ? s : {
          ...s,
          groups: s.groups.map((g) => ({
            ...g,
            exercises: g.exercises.map((e) => e.id === exId ? { ...e, name } : e),
          })),
        }
      ),
    };
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!pendingChange || !program) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { original, replacement } = pendingChange;
      let updated: ProgramDocument;
      if (scope === "base") {
        updated = { ...program, days: program.days.map((d) => d.id === replacement.id ? replacement : d) };
      } else {
        const override = {
          id: crypto.randomUUID(),
          scope: "week" as const,
          programId: program.id,
          weekNumber: original.weekNumber,
          replacement,
          reason: "Modified from routine view",
          createdAt: new Date().toISOString(),
        };
        updated = { ...program, overrides: [...program.overrides, override] };
      }
      await saveProgram(updated);
      setProgram(updated);
      setPendingChange(null);
    } catch (e) {
      setSaveError("Failed to save changes. Please try again.");
      console.error("[RoutineV2] save failed", e);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!program) return <p className="muted">Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Link
            to="/programs"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textDecoration: "none" }}
          >
            <ChevronLeft size={12} /> Routines
          </Link>
          <span style={{ flex: 1 }} />
          <Link to={`/programs/${id}/map`} className="btn ghost" style={{ padding: "3px 8px", fontSize: 10.5 }}>
            <Map size={11} aria-hidden /> Map
          </Link>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{program.title}</div>
        {program.description && (
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 1 }}>{program.description}</div>
        )}
        {displayAnalysis && (
          <div style={{ marginTop: 8 }}>
            <RoutineAnalysisCard analysis={displayAnalysis} onOpenPrompt={() => setPromptOpen(true)} />
          </div>
        )}
      </div>

      {/* Week tabs */}
      <WeekTabStrip weeks={weeks} activeWeek={activeWeek} onSelect={setActiveWeek} />

      {/* Week panels */}
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      >
        <div
          style={{
            display: "flex",
            height: "100%",
            width: `${weeks.length * 100}%`,
            transform: `translateX(calc(${-activeWeek * (100 / weeks.length)}% + ${dragDX}px))`,
            transition: dragDX ? "none" : "transform .25s cubic-bezier(.2,.7,.3,1)",
          }}
        >
          {weeks.map((wk, wi) => (
            <div
              key={wk.weekNumber}
              style={{ width: `${100 / weeks.length}%`, flex: "0 0 auto", height: "100%", overflowY: "auto", overflowX: "hidden", padding: "10px 12px 14px" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Week {wk.weekNumber}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
                  {wk.days.filter((d) => d.sections.length > 0).length} training days
                </span>
              </div>
              {wk.days.map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  weekIndex={wi}
                  expanded={!!expanded[day.id]}
                  onToggle={() => setExpanded((s) => ({ ...s, [day.id]: !s[day.id] }))}
                  onSwapEx={(exId) => setReplaceTarget({ kind: "swap", day, exId })}
                  onAiEx={() => setAiModalDay(day)}
                  onDeleteEx={(sectionId, exId) => openConfirm(day, buildDeleteDay(day, sectionId, exId))}
                  onAddEx={(sectionId) => setReplaceTarget({ kind: "add", day, sectionId })}
                  onCommitName={(sectionId, exId, name) => openConfirm(day, buildRenameDay(day, sectionId, exId, name))}
                  onModifyDay={() => setAiModalDay(day)}
                  onStart={() => navigate(`/programs/${id}/log`)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Sheets + modals */}
      {aiModalDay && (
        <ModifyAiModal
          currentDay={aiModalDay}
          programId={id}
          onApply={(replacement) => { setAiModalDay(null); openConfirm(aiModalDay, replacement); }}
          onClose={() => setAiModalDay(null)}
        />
      )}

      {replaceTarget && (
        <ExerciseReplaceSheet
          onSelect={(item: ExerciseCatalogItem) => {
            const { day } = replaceTarget;
            const replacement =
              replaceTarget.kind === "swap"
                ? swapExercise(day, replaceTarget.exId, item)
                : addExercise(day, replaceTarget.sectionId, item);
            setReplaceTarget(null);
            openConfirm(day, replacement);
          }}
          onClose={() => setReplaceTarget(null)}
        />
      )}

      {pendingChange && (
        <RoutineConfirmModal
          pending={pendingChange}
          scope={scope}
          onScopeChange={setScope}
          onAccept={handleAccept}
          onDiscard={() => { setPendingChange(null); setSaveError(null); }}
          saving={saving}
          saveError={saveError}
        />
      )}

      {displayAnalysis && (
        <LlmAnalysisSheet
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          analysis={displayAnalysis}
          programTitle={program.title}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3.2 — Run tests**

```bash
npx jest ProgramDetailClient --no-coverage
```

Expected: all tests pass. If any import is missing, fix it before proceeding.

- [ ] **Step 3.3 — Commit**

```bash
git add src/components/workout/ProgramDetailClient.tsx src/components/workout/ProgramDetailClient.test.tsx
git commit -m "feat: routine overview v2 — week pager with expandable day cards and inline editing"
```

---

## Task 4: Verify full test suite passes

- [ ] **Step 4.1 — Run all tests**

```bash
npx jest --no-coverage
```

Expected: all suites pass. If `exerciseSwap.test.ts` shows type errors about the new import, ensure the import line at the top of the test file reads:

```ts
import { swapExercise, addExercise } from "./exerciseSwap";
```

- [ ] **Step 4.2 — Lint check**

```bash
npm run lint
```

Fix any errors before committing.

- [ ] **Step 4.3 — Final commit**

```bash
git add -A
git commit -m "chore: lint and test cleanup for routine-overview-v2"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|------------|
| Week tab strip with micro-dots | `WeekTabStrip` in Task 3 |
| Transform-based week pager + pointer drag | `WeekPager` logic in `ProgramDetailClient` Task 3 |
| Day cards expand/collapse | `DayCard` + `expanded` state, tests in Task 2 |
| Rest days not expandable | `DayCard` `isRest` guard, tested |
| SectionHeader with glyph | `SectionHeader` in Task 3 |
| ExerciseRow with swap/AI/delete buttons | `ExerciseRow` in Task 3 |
| Inline name editing → confirm modal | `ExerciseRow` + `onCommitName`, tested |
| Swap from catalogue → confirm modal | `replaceTarget` + `ExerciseReplaceSheet` flow, tested |
| AI modify → confirm modal | `aiModalDay` + `ModifyAiModal` flow, tested |
| Delete → confirm modal | `buildDeleteDay` + `openConfirm`, tested |
| Add exercise → confirm modal | `replaceTarget kind:add` + `addExercise`, tested |
| "Whole routine" scope → mutates `program.days` | `handleAccept` scope=base branch, tested |
| "This week" scope → adds `ProgramOverride` | `handleAccept` scope=week branch, tested |
| "This week" disabled when no weekNumber | `RoutineConfirmModal` `weekDisabled`, in component |
| Analysis strip + LLM sheet | `RoutineAnalysisCard` + `LlmAnalysisSheet` wired |
| "← Routines" back link | Header `Link to="/programs"` |
| "Map" button | Header `Link to="/programs/:id/map"` |
| "Start →" navigates to log | `onStart` → `navigate(\`/programs/${id}/log\`)` |
| `addExercise` utility | Task 1, fully tested |

**Placeholder scan:** None found. All steps contain complete code.

**Type consistency check:**
- `ReplaceTarget` union used consistently in state and handlers
- `PendingChange` type used in state, `openConfirm`, and `RoutineConfirmModal` props
- `swapExercise` / `addExercise` — both accept `(day: ProgramDay, ..., item: ExerciseCatalogItem)` and return `ProgramDay`
- `DiffReview` props: `diffs`, `replacement`, `onAccept`, `onDiscard` — matches existing component signature
- `saveProgram` from `useLocalData` accepts `ProgramDocument` — matches `updated` constructed in `handleAccept`
