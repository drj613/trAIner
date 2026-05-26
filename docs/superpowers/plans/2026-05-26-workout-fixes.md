# Workout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three workout-day bug fixes — disable Finish on completed days, make history follow swapped-in exercises, and fix the rest-timer input.

**Architecture:** All three fixes are client-side and localized to the workout-day surface plus one storage utility extension. No schema changes (the relevant `WorkoutLogEntry.canonicalExerciseId` field already exists and is optional). Each task is independently testable.

**Tech Stack:** React 19, TypeScript, Jest + @testing-library/react, react-router-dom v6, IndexedDB via `idb`, Vite, bun (package manager / runner). The project is a static SPA deployed to GitHub Pages.

**Spec reference:** `docs/superpowers/specs/2026-05-26-workout-fixes-design.md`

**Test commands (always run from repo root):**
- Single file: `bun run test -- src/path/to/file.test.tsx`
- Single test: `bun run test -- src/path/to/file.test.tsx -t "test name fragment"`
- Full suite: `bun run test`

---

## File Map

**New files:** none.

**Modified files:**
- `src/components/workout/RestTimer.tsx` — refactor to single unified row with click-to-edit (Task 1).
- `src/components/workout/RestTimer.test.tsx` — add multi-digit input + edit-while-set + Escape cancel tests (Task 1).
- `src/lib/workout/historyUtils.ts` — extend `aggregateExerciseHistory` signature with optional `canonicalExerciseId` (Task 2).
- `src/lib/workout/historyUtils.test.ts` — add canonical-id matching + fallback tests (Task 2).
- `src/components/workout/WorkoutDayClient.tsx` — persist `canonicalExerciseId` on saved entries; resolve canonical id from `day.sections` in `openHistoryFor`; detect `alreadyComplete` via `logRepo.listForDay`; pass to `WorkoutBottomBar` and gate Finish button rendering (Tasks 3, 4).
- `src/components/workout/WorkoutDayClient.test.tsx` — add canonical-id persistence test, history-after-swap test, completed-day Finish-disabled test, and `listForDay` to logRepo mock (Tasks 3, 4).

---

## Task 1 — Editable RestTimer

**Files:**
- Modify: `src/components/workout/RestTimer.tsx`
- Test: `src/components/workout/RestTimer.test.tsx`

**Goal:** A single unified row. When no value is set, clicking the placeholder enters edit mode; when a value is set (and not running), clicking the displayed time enters edit mode. Commit on **Enter** or **blur**; cancel on **Escape**. Reject invalid input (NaN, ≤0, >600) by staying in edit mode.

- [ ] **Step 1: Add failing tests to `src/components/workout/RestTimer.test.tsx`**

Append these blocks to the existing `describe("RestTimer", ...)`:

```tsx
  it("commits a multi-digit value typed into the empty input on Enter", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="" />);
    // Empty state shows a clickable placeholder; click to enter edit mode.
    await user.click(screen.getByRole("button", { name: /set rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.type(input, "90");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it("commits multi-digit value on blur", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="" />);
    await user.click(screen.getByRole("button", { name: /set rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.type(input, "75");
    input.blur();
    expect(screen.getByText(/1:15/)).toBeInTheDocument();
  });

  it("allows editing an already-set duration", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    // Displayed time is clickable when not running.
    await user.click(screen.getByRole("button", { name: /edit rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    // Input is pre-filled with current value.
    expect(input).toHaveValue(60);
    await user.clear(input);
    await user.type(input, "120");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/2:00/)).toBeInTheDocument();
  });

  it("Escape cancels edit without changing the value", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /edit rest duration/i }));
    const input = screen.getByPlaceholderText(/seconds/i);
    await user.clear(input);
    await user.type(input, "999");
    await user.keyboard("{Escape}");
    expect(screen.getByText(/1:00/)).toBeInTheDocument();
  });
```

Also adjust the existing "prompts for input when no duration can be parsed" test — the placeholder is no longer rendered until the user clicks. Replace it with:

```tsx
  it("prompts to set duration when none can be parsed", () => {
    render(<RestTimer restText="" />);
    expect(screen.getByRole("button", { name: /set rest duration/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/workout/RestTimer.test.tsx`
Expected: the four new tests fail (no `/set rest duration/` button found, etc.); the modified existing test fails too.

- [ ] **Step 3: Rewrite `src/components/workout/RestTimer.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { parseDuration } from "@/lib/workout/parseDuration";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = {
  restText?: string;
  notes?: string;
};

export function RestTimer({ restText, notes }: Props) {
  const initial = parseDuration(restText ?? "") ?? parseDuration(notes ?? "");
  const [seconds, setSeconds] = useState<number | undefined>(initial);
  const [remaining, setRemaining] = useState<number>(initial ?? 0);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          try { navigator.vibrate?.(200); } catch { /* unsupported */ }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running]);

  function startEditing() {
    setDraft(seconds !== undefined ? String(seconds) : "");
    setEditing(true);
  }

  function commitEdit() {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 1 && n <= 600) {
      setSeconds(n);
      setRemaining(n);
      setEditing(false);
    }
    // else: stay in edit mode; user can correct or press Escape
  }

  function cancelEdit() {
    setEditing(false);
  }

  const display = seconds === undefined ? "--:--" : fmt(remaining);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      {editing ? (
        <input
          type="number"
          placeholder="seconds"
          min={1}
          max={600}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
          }}
          onBlur={commitEdit}
          className="input"
          style={{ width: 80, fontSize: 12 }}
        />
      ) : (
        <button
          type="button"
          onClick={running ? undefined : startEditing}
          disabled={running}
          aria-label={seconds === undefined ? "Set rest duration" : "Edit rest duration"}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            minWidth: 36,
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--fg)",
            cursor: running ? "default" : "pointer",
            textAlign: "left",
          }}
        >
          {display}
        </button>
      )}
      <button
        type="button"
        className="btn ghost"
        aria-label={running ? "Pause" : "Start"}
        onClick={() => setRunning((r) => !r)}
        disabled={seconds === undefined}
        style={{ padding: "3px 6px" }}
      >
        {running ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-label="Reset"
        onClick={() => { setRunning(false); if (seconds !== undefined) setRemaining(seconds); }}
        disabled={seconds === undefined}
        style={{ padding: "3px 6px" }}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/components/workout/RestTimer.test.tsx`
Expected: all tests in the file pass (existing + the four new ones + the modified placeholder test).

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/RestTimer.tsx src/components/workout/RestTimer.test.tsx
git commit -m "fix(timer): editable rest timer with multi-digit input and Escape cancel"
```

---

## Task 2 — `aggregateExerciseHistory` matches by canonical id

**Files:**
- Modify: `src/lib/workout/historyUtils.ts`
- Test: `src/lib/workout/historyUtils.test.ts`

**Goal:** Extend the aggregator to accept an optional `canonicalExerciseId`. When the entry has its own `canonicalExerciseId` and a query canonical id was provided, match by canonical id. Otherwise fall back to slot-id match. This makes history follow the catalog exercise after a swap, while preserving correctness for legacy logs that don't have a canonical id.

- [ ] **Step 1: Add failing tests to `src/lib/workout/historyUtils.test.ts`**

Append to the existing `describe("aggregateExerciseHistory", ...)`:

```ts
  it("matches by canonicalExerciseId when entries carry one and the query supplies it", () => {
    const mixed: WorkoutLogDocument[] = [
      {
        id: "log-a", programId: "p1", dayId: "d1",
        performedAt: "2026-05-01T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-old", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
        ],
      },
      {
        id: "log-b", programId: "p1", dayId: "d1",
        performedAt: "2026-05-08T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-new", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 85, reps: 5 }] },
        ],
      },
    ];
    const rows = aggregateExerciseHistory(mixed, "slot-new", "cat-bench");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date)).toEqual(["2026-05-08", "2026-05-01"]);
  });

  it("excludes entries whose canonicalExerciseId does not match the query canonical id", () => {
    const mixed: WorkoutLogDocument[] = [
      {
        id: "log-a", programId: "p1", dayId: "d1",
        performedAt: "2026-05-01T09:00:00.000Z",
        entries: [
          // Same slot id used by two different catalog exercises across the swap.
          { exerciseId: "slot-x", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
        ],
      },
      {
        id: "log-b", programId: "p1", dayId: "d1",
        performedAt: "2026-05-08T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-x", canonicalExerciseId: "cat-incline", sets: [{ setNumber: 1, weight: 60, reps: 8 }] },
        ],
      },
    ];
    const rows = aggregateExerciseHistory(mixed, "slot-x", "cat-incline");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-08");
    expect(rows[0].sets).toEqual(["60x8"]);
  });

  it("falls back to exerciseId match when entries have no canonicalExerciseId (legacy logs)", () => {
    // No canonical id on the entries; query still works via slot id.
    const rows = aggregateExerciseHistory(logs, "bench-press", "cat-anything");
    expect(rows).toHaveLength(2);
    expect(rows[0].sets).toEqual(["65x10", "65x9"]);
  });

  it("falls back to exerciseId when no canonical id is supplied (back-compat)", () => {
    // Existing two-arg call still works unchanged.
    expect(aggregateExerciseHistory(logs, "bench-press")).toHaveLength(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/lib/workout/historyUtils.test.ts`
Expected: the four new tests fail (TypeScript may complain about the extra argument too).

- [ ] **Step 3: Update `src/lib/workout/historyUtils.ts`**

Replace the `aggregateExerciseHistory` function body with:

```ts
export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  canonicalExerciseId?: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    const entry = log.entries.find((e) => {
      // Prefer canonical-id match when both sides supply one.
      if (canonicalExerciseId && e.canonicalExerciseId) {
        return e.canonicalExerciseId === canonicalExerciseId;
      }
      // Legacy / pre-canonical fallback: slot-id match.
      return e.exerciseId === exerciseId;
    });
    if (!entry) continue;

    rows.push({
      date: log.performedAt.slice(0, 10),
      sets: entry.sets.map(formatSet).filter(Boolean),
      volume: entry.sets.reduce((sum, s) => sum + setVolume(s), 0),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
```

The `formatSet`, `setVolume`, and `ExerciseSessionRow` definitions above this function stay unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/lib/workout/historyUtils.test.ts`
Expected: all tests in the file pass (existing five + four new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout/historyUtils.ts src/lib/workout/historyUtils.test.ts
git commit -m "feat(history): aggregateExerciseHistory matches by canonicalExerciseId"
```

---

## Task 3 — Persist canonical id and use it when opening history

**Files:**
- Modify: `src/components/workout/WorkoutDayClient.tsx`
- Test: `src/components/workout/WorkoutDayClient.test.tsx`

**Goal:** `saveCells` writes each entry's `canonicalExerciseId` (from the day template) onto the log. `openHistoryFor` resolves the slot's current canonical id from `day.sections` and forwards it to `aggregateExerciseHistory`, so history follows the catalog exercise across swaps.

- [ ] **Step 1: Extend the test mock and add failing tests in `src/components/workout/WorkoutDayClient.test.tsx`**

The test fixture currently lacks `canonicalExerciseId` on `makeExercise`. Replace the helper at the top of the file:

```ts
const makeExercise = (id: string, name: string, canonicalExerciseId?: string) => ({
  id, name, sets: 3, reps: "8-10",
  canonicalExerciseId,
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});
```

And update the fixture to give exercises canonical ids:

```ts
        groups: [{ id: "g1", type: "single", exercises: [makeExercise("e1", "Bench Press", "cat-bench")] }],
```

```ts
        groups: [{ id: "g2", type: "single", exercises: [makeExercise("e2", "Pull-Up", "cat-pullup")] }],
```

Extend the logRepo mock to include `listForDay` and `listForProgram` so we can drive history responses:

```ts
const listForDayMock = jest.fn().mockResolvedValue([]);
const listForProgramMock = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    listForProgram: (...args: unknown[]) => listForProgramMock(...args),
    listForDay: (...args: unknown[]) => listForDayMock(...args),
    getForDay: jest.fn().mockResolvedValue(null),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));
```

Add to the `beforeEach`:

```ts
  listForDayMock.mockClear().mockResolvedValue([]);
  listForProgramMock.mockClear().mockResolvedValue([]);
```

Add a new describe block at the end of the file:

```tsx
describe("WorkoutDayClient canonical id persistence", () => {
  it("Finish workout saves canonicalExerciseId on each entry", async () => {
    jest.useFakeTimers();
    renderOnDay("day-1");
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

describe("WorkoutDayClient history button after exercise change", () => {
  it("history dialog shows entries matching the slot's current canonical id", async () => {
    // Two logs: one under the old slot id, one under a different slot but same canonical id.
    listForProgramMock.mockResolvedValueOnce([
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/workout/WorkoutDayClient.test.tsx`
Expected: the new canonical-id persistence test fails (entries don't carry canonicalExerciseId yet). The history-after-swap test fails because `listForProgram` was previously mocked statically — confirm the mock change is in effect and the failure is about the entry contents, not the mock plumbing.

- [ ] **Step 3: Update `saveCells` in `src/components/workout/WorkoutDayClient.tsx`**

Find the existing `saveCells` (around line 546-582). Inside the function, after the existing `exerciseNameMap` build, add a sibling map for canonical ids and use it when building entries. Replace this block:

```ts
    const exerciseNameMap = new Map<string, string>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          exerciseNameMap.set(ex.id, ex.name);
        }
      }
    }
    const entries = Object.entries(c).map(([exerciseId, vals]) => {
      const base = {
        exerciseId,
        exerciseName: exerciseNameMap.get(exerciseId),
        sets: serialiseSets(vals),
      };
      return applyEntryNotes(base, n[exerciseId] ?? "");
    });
```

with:

```ts
    const exerciseNameMap = new Map<string, string>();
    const exerciseCanonicalMap = new Map<string, string | undefined>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          exerciseNameMap.set(ex.id, ex.name);
          exerciseCanonicalMap.set(ex.id, ex.canonicalExerciseId);
        }
      }
    }
    const entries = Object.entries(c).map(([exerciseId, vals]) => {
      const canonicalExerciseId = exerciseCanonicalMap.get(exerciseId);
      const base: {
        exerciseId: string;
        exerciseName?: string;
        canonicalExerciseId?: string;
        sets: ReturnType<typeof serialiseSets>;
      } = {
        exerciseId,
        exerciseName: exerciseNameMap.get(exerciseId),
        sets: serialiseSets(vals),
      };
      if (canonicalExerciseId) base.canonicalExerciseId = canonicalExerciseId;
      return applyEntryNotes(base, n[exerciseId] ?? "");
    });
```

- [ ] **Step 4: Update `openHistoryFor` in the same file**

Find `openHistoryFor` (around line 505-513). Replace it with:

```tsx
  async function openHistoryFor(exerciseName: string, exerciseId: string) {
    try {
      // Resolve the slot's current canonical exercise id from the day template.
      let canonicalExerciseId: string | undefined;
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const ex of group.exercises) {
            if (ex.id === exerciseId) canonicalExerciseId = ex.canonicalExerciseId;
          }
        }
      }
      const logs = await logRepo.listForProgram(program.id);
      const rows = aggregateExerciseHistory(logs, exerciseId, canonicalExerciseId);
      setHistoryDrawer({ exerciseName, rows });
    } catch (e) {
      console.error("[history] failed to load exercise history", e);
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test -- src/components/workout/WorkoutDayClient.test.tsx`
Expected: all tests in the file pass, including the two new describe blocks.

- [ ] **Step 6: Run the workout history util tests together to confirm no regression**

Run: `bun run test -- src/lib/workout/historyUtils.test.ts src/components/workout/WorkoutDayClient.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/workout/WorkoutDayClient.tsx src/components/workout/WorkoutDayClient.test.tsx
git commit -m "fix(history): follow swapped-in exercise via canonical id"
```

---

## Task 4 — Disable Finish when day is already complete

**Files:**
- Modify: `src/components/workout/WorkoutDayClient.tsx`
- Test: `src/components/workout/WorkoutDayClient.test.tsx`

**Goal:** When `logRepo.listForDay(day.id)` returns any log with `completedAt` set and matching `programId`, the Finish button renders as disabled with text "Completed ✓". No autosave changes (accepted caveat per spec).

- [ ] **Step 1: Add failing tests to `src/components/workout/WorkoutDayClient.test.tsx`**

Append to the file:

```tsx
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
    const finishButton = await screen.findByRole("button", { name: /finish workout/i });
    expect(finishButton).not.toBeDisabled();
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
    const finishButton = await screen.findByRole("button", { name: /finish workout/i });
    expect(finishButton).not.toBeDisabled();
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
    const finishButton = await screen.findByRole("button", { name: /finish workout/i });
    expect(finishButton).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/workout/WorkoutDayClient.test.tsx -t "already-completed day"`
Expected: the first new test fails (no `/completed/i` button found); others may pass already.

- [ ] **Step 3: Add `alreadyComplete` state and detection effect in `WorkoutBody`**

In `src/components/workout/WorkoutDayClient.tsx`, find the `WorkoutBody` function. Near the other `useState` calls (around line 487-494), add:

```tsx
  const [alreadyComplete, setAlreadyComplete] = useState(false);
```

Then, after the existing hydration `useEffect` (the one that calls `logRepo.getForDay`, ending around line 544), add a new effect:

```tsx
  useEffect(() => {
    let cancelled = false;
    logRepo
      .listForDay(day.id)
      .then((logs) => {
        if (cancelled) return;
        const hasCompleted = logs.some(
          (l) => l.programId === program.id && !!l.completedAt,
        );
        setAlreadyComplete(hasCompleted);
      })
      .catch((e) => console.error("[logRepo] alreadyComplete check failed", e));
    return () => { cancelled = true; };
  }, [program.id, day.id]);
```

- [ ] **Step 4: Thread `alreadyComplete` into `WorkoutBottomBar`**

In the `WorkoutBottomBar` Props type, add:

```tsx
  alreadyComplete: boolean;
```

In the props destructure inside the function signature, add `alreadyComplete`:

```tsx
function WorkoutBottomBar({
  cells,
  onFinish,
  saved,
  autoSaveStatus,
  dayNote,
  onDayNoteChange,
  noteExpanded,
  onToggleNote,
  skipMode,
  onSkipDay,
  onSkipConfirm,
  onSkipCancel,
  alreadyComplete,
}: {
```

Replace the Finish button JSX (currently around line 453-461) with:

```tsx
        <button
          type="button"
          className={`btn ${pct === 100 && !alreadyComplete ? "primary" : ""}`}
          onClick={onFinish}
          disabled={alreadyComplete}
          aria-label={alreadyComplete ? "Completed" : "Finish workout"}
          style={{ fontSize: 12 }}
        >
          {alreadyComplete ? (
            <><CheckCircle size={13} /> Completed</>
          ) : saved ? (
            <><CheckCircle size={13} /> Saved</>
          ) : (
            "Finish workout"
          )}
        </button>
```

Then in the render of `<WorkoutBottomBar ... />` (around line 730), add the prop:

```tsx
      <WorkoutBottomBar
        cells={cells}
        onFinish={finishWorkout}
        saved={saved}
        autoSaveStatus={autoSaveStatus}
        dayNote={dayNote}
        onDayNoteChange={setDayNote}
        noteExpanded={noteExpanded}
        onToggleNote={() => setNoteExpanded((v) => !v)}
        skipMode={skipMode}
        onSkipDay={() => setSkipMode(true)}
        onSkipConfirm={handleSkip}
        onSkipCancel={() => setSkipMode(false)}
        alreadyComplete={alreadyComplete}
      />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test -- src/components/workout/WorkoutDayClient.test.tsx`
Expected: all tests in the file pass, including the four new "already-completed day" tests AND the existing Finish-workout tests (which run with `listForDay` returning `[]`, so `alreadyComplete` stays `false`).

- [ ] **Step 6: Commit**

```bash
git add src/components/workout/WorkoutDayClient.tsx src/components/workout/WorkoutDayClient.test.tsx
git commit -m "fix(workout): disable Finish on already-completed days to prevent duplicate logs"
```

---

## Task 5 — Final verification

**Goal:** Confirm the whole test suite passes, lint passes, and the build succeeds before declaring done.

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: PASS (all suites green).

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: no errors. (Warnings about existing code are acceptable; new code should be clean.)

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build succeeds with no TypeScript errors. (Watch in particular for: `aggregateExerciseHistory` signature change being honored at all call sites, `WorkoutBottomBar` prop type matching its usage, and `RestTimer` having no unused state.)

- [ ] **Step 4: Manual smoke test (developer)**

This step is a checklist for a human; don't try to automate it. Start the dev server (`bun run dev`) and verify:
1. Open a workout day. The rest timer shows a clickable display. Click it, type "90", press Enter → timer shows `1:30`. Click again, change to `120`, press Enter → `2:00`. Press Escape mid-edit → original value restored.
2. Swap an exercise via the catalog picker, apply through the diff page. Open the history drawer on the swapped slot — it should show entries for the new catalog exercise (or "No history yet" if there are none), not the old one.
3. Finish a workout. Navigate back to the same day on the same calendar date — Finish button shows "Completed" and is disabled. Refresh; same behavior.

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git status
# If there are uncommitted tweaks (e.g., lint fixes), commit them:
git add -A
git commit -m "chore: post-implementation cleanup"
```

---

## Self-Review Notes

- **Spec coverage:** All three spec fixes have implementation tasks (Task 1 → Fix 3, Tasks 2+3 → Fix 2, Task 4 → Fix 1). Task 5 covers final verification per spec's testing notes.
- **Placeholders:** None. Every step shows the exact code or command.
- **Type consistency:** `aggregateExerciseHistory(logs, exerciseId, canonicalExerciseId?, limit?)` — same signature used in `historyUtils.ts` and the `openHistoryFor` call in `WorkoutDayClient.tsx`. `alreadyComplete: boolean` — same name in state, prop type, and JSX. `canonicalExerciseId` — same property name everywhere (matches existing `ProgramExercise.canonicalExerciseId` and `WorkoutLogEntry.canonicalExerciseId`).
- **Test mock plumbing:** `listForDay` is added to the logRepo jest mock in Task 3 Step 1, before Task 4 needs to override it.
