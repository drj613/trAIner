# History Drawer in Workout Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-exercise history slide-up drawer to the Today screen so a user can tap the history icon on any exercise row and immediately see their last 8 sessions for that movement without leaving the workout.

**Architecture:** A `useExerciseHistory` hook reads from `logRepo` and aggregates sessions by `exerciseId`. `HistoryDrawer` renders as a bottom sheet (`position: fixed`, slide-up animation) with a dense table of sets+volume per session and a mini sparkline. The Today screen wires up the per-row history icon to open the drawer. No new routes — this is pure Today-screen UX.

**Tech Stack:** React 19, `logRepo` (IndexedDB via `idb`), Jest + `@testing-library/react`, `fake-indexeddb`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/historyUtils.ts` | Aggregate `WorkoutLogDocument[]` into per-exercise session rows |
| Create | `src/lib/workout/historyUtils.test.ts` | Unit tests for aggregation logic |
| Create | `src/components/workout/HistoryDrawer.tsx` | Bottom-sheet component rendering session history |
| Create | `src/components/workout/HistoryDrawer.test.tsx` | Render test |
| Modify | `src/components/workout/TodayClient.tsx` | Add history icon to ExerciseRow, wire drawer state |

---

## Task 1: History aggregation utility

**Files:**
- Create: `src/lib/workout/historyUtils.ts`
- Create: `src/lib/workout/historyUtils.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/historyUtils.test.ts
import { aggregateExerciseHistory } from "./historyUtils";
import type { WorkoutLogDocument } from "@/lib/programs/types";

const logs: WorkoutLogDocument[] = [
  {
    id: "log-1",
    programId: "p1",
    dayId: "d1",
    performedAt: "2026-04-15T09:00:00.000Z",
    entries: [
      {
        exerciseId: "bench-press",
        sets: [
          { setNumber: 1, weight: 60, reps: 10 },
          { setNumber: 2, weight: 60, reps: 10 },
          { setNumber: 3, weight: 60, reps: 8 },
        ],
      },
    ],
  },
  {
    id: "log-2",
    programId: "p1",
    dayId: "d1",
    performedAt: "2026-04-22T09:00:00.000Z",
    entries: [
      {
        exerciseId: "bench-press",
        sets: [
          { setNumber: 1, weight: 65, reps: 10 },
          { setNumber: 2, weight: 65, reps: 9 },
        ],
      },
    ],
  },
];

describe("aggregateExerciseHistory", () => {
  it("returns sessions sorted newest first", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2026-04-22");
    expect(rows[1].date).toBe("2026-04-15");
  });

  it("formats set strings correctly", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].sets).toEqual(["65x10", "65x9"]);
    expect(rows[1].sets).toEqual(["60x10", "60x10", "60x8"]);
  });

  it("computes total volume per session", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].volume).toBe(65 * 10 + 65 * 9); // 1235
    expect(rows[1].volume).toBe(60 * 10 + 60 * 10 + 60 * 8); // 1680
  });

  it("returns [] for unknown exerciseId", () => {
    expect(aggregateExerciseHistory(logs, "unknown-exercise")).toEqual([]);
  });

  it("limits to 8 sessions", () => {
    const manyLogs: WorkoutLogDocument[] = Array.from({ length: 12 }, (_, i) => ({
      id: `log-${i}`,
      programId: "p1",
      dayId: "d1",
      performedAt: new Date(2026, 0, i + 1).toISOString(),
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }));
    expect(aggregateExerciseHistory(manyLogs, "bench-press")).toHaveLength(8);
  });
});
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- historyUtils --no-coverage
```

Expected: `Cannot find module './historyUtils'`

- [ ] **Step 1.3: Implement**

```ts
// src/lib/workout/historyUtils.ts
import type { WorkoutLogDocument, WorkoutSetLog } from "@/lib/programs/types";

export type ExerciseSessionRow = {
  date: string;
  sets: string[];
  volume: number;
};

function formatSet(s: WorkoutSetLog): string {
  if (!s.weight) return s.reps ? `BWx${s.reps}` : "";
  return s.reps ? `${s.weight}x${s.reps}` : String(s.weight);
}

function setVolume(s: WorkoutSetLog): number {
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    const entry = log.entries.find(
      (e) => e.exerciseId === exerciseId || e.canonicalExerciseId === exerciseId,
    );
    if (!entry) continue;

    rows.push({
      date: log.performedAt.slice(0, 10),
      sets: entry.sets.map(formatSet).filter(Boolean),
      volume: entry.sets.reduce((sum, s) => sum + setVolume(s), 0),
    });
  }

  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- historyUtils --no-coverage
```

Expected: 5 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/historyUtils.ts src/lib/workout/historyUtils.test.ts
git commit -m "feat: add aggregateExerciseHistory utility"
```

---

## Task 2: HistoryDrawer component

**Files:**
- Create: `src/components/workout/HistoryDrawer.tsx`
- Create: `src/components/workout/HistoryDrawer.test.tsx`

- [ ] **Step 2.1: Write failing render test**

```tsx
// src/components/workout/HistoryDrawer.test.tsx
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
    render(
      <HistoryDrawer
        exerciseName="DB Bench Press"
        rows={rows}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: /DB Bench Press/i })).toBeInTheDocument();
  });

  it("renders session rows", () => {
    render(
      <HistoryDrawer
        exerciseName="DB Bench Press"
        rows={rows}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("2026-04-22")).toBeInTheDocument();
    expect(screen.getByText("65x10")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", async () => {
    const onClose = jest.fn();
    render(
      <HistoryDrawer
        exerciseName="DB Bench Press"
        rows={rows}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByTestId("history-drawer-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows empty state when rows is empty", () => {
    render(
      <HistoryDrawer exerciseName="New Move" rows={[]} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run to confirm red**

```bash
bun run test -- HistoryDrawer --no-coverage
```

Expected: `Cannot find module './HistoryDrawer'`

- [ ] **Step 2.3: Implement component**

```tsx
// src/components/workout/HistoryDrawer.tsx
"use client";

import type { ExerciseSessionRow } from "@/lib/workout/historyUtils";

type Props = {
  exerciseName: string;
  rows: ExerciseSessionRow[];
  onClose: () => void;
};

export function HistoryDrawer({ exerciseName, rows, onClose }: Props) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      {/* backdrop */}
      <div
        data-testid="history-drawer-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />

      {/* sheet */}
      <div
        role="dialog"
        aria-label={`History for ${exerciseName}`}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "75vh",
          background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
          animation: "slideup .2s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "var(--line-2)" }} />
        </div>

        {/* header */}
        <div style={{ padding: "0 16px 12px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--fg)" }}>
            {exerciseName}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            {rows.length} session{rows.length !== 1 ? "s" : ""} · last 8
          </p>
        </div>

        {/* content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-3)" }}>
              No history yet for this exercise.
            </div>
          ) : (
            <>
              {/* column headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr 64px",
                  padding: "8px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span>date</span>
                <span>sets</span>
                <span style={{ textAlign: "right" }}>vol</span>
              </div>

              {rows.map((row, i) => (
                <div
                  key={row.date}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 1fr 64px",
                    padding: "8px 16px",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {row.date.slice(5).replace("-", "/")}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {row.sets.map((s, j) => (
                      <span
                        key={j}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--fg-3)",
                      textAlign: "right",
                    }}
                  >
                    {row.volume > 0 ? row.volume.toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: Run tests green**

```bash
bun run test -- HistoryDrawer --no-coverage
```

Expected: 4 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/workout/HistoryDrawer.tsx src/components/workout/HistoryDrawer.test.tsx
git commit -m "feat: add HistoryDrawer bottom sheet component"
```

---

## Task 3: Wire drawer into TodayClient

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 3.1: Add history drawer state and load function**

At the top of `TodayWorkout`, add:

```tsx
import { logRepo } from "@/lib/storage/logRepo";
import { aggregateExerciseHistory, type ExerciseSessionRow } from "@/lib/workout/historyUtils";
import { HistoryDrawer } from "./HistoryDrawer";

// Inside TodayWorkout component:
const [historyDrawer, setHistoryDrawer] = useState<{
  exerciseName: string;
  rows: ExerciseSessionRow[];
} | null>(null);

async function openHistoryFor(exerciseName: string, exerciseId: string) {
  const logs = await logRepo.listForProgram(program.id);
  const rows = aggregateExerciseHistory(logs, exerciseId);
  setHistoryDrawer({ exerciseName, rows });
}
```

- [ ] **Step 3.2: Add history icon to ExerciseRow**

In `ExerciseRow`, add `onOpenHistory` to the props type and insert an icon button after the exercise name:

```tsx
// Update ExerciseRow props type:
function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,      // ← add this
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;   // ← add this
}) {
```

In the name row, add after the prescription span:

```tsx
<div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
  <div style={{ flex: 1 }}>
    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", marginBottom: 2 }}>
      {exercise.name}
    </div>
    {prescription && (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
        {prescription}
      </div>
    )}
  </div>
  <button
    className="btn ghost"
    onClick={onOpenHistory}
    style={{ padding: "3px 6px", flexShrink: 0 }}
    aria-label={`History for ${exercise.name}`}
    title="History"
  >
    <History size={13} aria-hidden />
  </button>
</div>
```

Add `History` to lucide imports: `import { Download, Plus, CheckCircle, History } from "lucide-react";`

- [ ] **Step 3.3: Pass onOpenHistory through SectionCard → ExerciseRow**

```tsx
// In SectionCard props and usage:
function SectionCard({
  section, cells, onCellChange, onAddSet, onOpenHistory,
}: {
  ...
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
}) {
  ...
  <ExerciseRow
    ...
    onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
  />
}

// In TodayWorkout render:
<SectionCard
  ...
  onOpenHistory={openHistoryFor}
/>
```

- [ ] **Step 3.4: Render drawer when open**

At the bottom of `TodayWorkout`'s return, before the closing tag:

```tsx
{historyDrawer && (
  <HistoryDrawer
    exerciseName={historyDrawer.exerciseName}
    rows={historyDrawer.rows}
    onClose={() => setHistoryDrawer(null)}
  />
)}
```

- [ ] **Step 3.5: Build check**

```bash
bun run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3.6: Manual smoke test**

```bash
bun run dev
```

Open `/today`. Click the history icon (clock) on any exercise row. Drawer should slide up. If no logs exist yet, shows "No history yet". Tap the backdrop to close.

- [ ] **Step 3.7: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "feat(today): add per-exercise history drawer"
```
