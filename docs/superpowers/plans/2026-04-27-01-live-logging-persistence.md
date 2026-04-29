# Live Logging Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Today screen's inline set cells to `logRepo` — save a `WorkoutLogDocument` when the user finishes a session, restore in-progress values on reload, and show a per-exercise history summary via a slide-up drawer.

**Architecture:** A thin `sessionState` module manages the in-memory cell map keyed by `exerciseId`. On mount, it hydrates from `logRepo` (today's existing log) with a fallback to `localStorage`. On "Finish", it serialises the cell map into `WorkoutLogEntry[]` and calls `logRepo.save`. A `HistoryDrawer` component renders recent sets for a single exercise fetched from `logRepo`.

**Tech Stack:** Next.js 15 App Router, React 19, IndexedDB via `idb`/`logRepo`, Jest + `@testing-library/react`, `fake-indexeddb` for storage tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/sessionState.ts` | Parse/serialise freeform cell strings → `WorkoutSetLog[]` |
| Create | `src/lib/workout/sessionState.test.ts` | Unit tests for parse/serialise |
| Modify | `src/lib/storage/logRepo.ts` | Add `getForDay(dayId, date)` helper |
| Modify | `src/components/workout/TodayClient.tsx` | Hydrate from log on mount, save on Finish |
| Create | `src/components/workout/HistoryDrawer.tsx` | Slide-up sheet showing recent sets for one exercise |
| Create | `src/components/workout/HistoryDrawer.test.tsx` | Render test |

---

## Task 1: Session state parse/serialise utility

**Files:**
- Create: `src/lib/workout/sessionState.ts`
- Create: `src/lib/workout/sessionState.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/sessionState.test.ts
import { parseCellToSet, serialiseSets, hydrateFromLog } from "./sessionState";
import type { WorkoutSetLog, WorkoutLogEntry } from "@/lib/programs/types";

describe("parseCellToSet", () => {
  it("parses weight×reps string", () => {
    expect(parseCellToSet("65x10", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 65, reps: 10,
    });
  });

  it("parses BW×reps (bodyweight)", () => {
    expect(parseCellToSet("BWx8", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: undefined, reps: 8,
    });
  });

  it("returns null for empty string", () => {
    expect(parseCellToSet("", 1)).toBeNull();
  });

  it("returns null for skip/pain markers", () => {
    expect(parseCellToSet("skip", 1)).toBeNull();
    expect(parseCellToSet("pain", 1)).toBeNull();
  });
});

describe("serialiseSets", () => {
  it("converts cell strings to WorkoutSetLog[]", () => {
    const result = serialiseSets(["65x10", "", "60x8"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ setNumber: 1, weight: 65, reps: 10 });
    expect(result[1]).toEqual({ setNumber: 3, weight: 60, reps: 8 });
  });
});

describe("hydrateFromLog", () => {
  it("converts log entry sets back to cell strings", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [
        { setNumber: 1, weight: 65, reps: 10 },
        { setNumber: 2, weight: 60, reps: 8 },
      ],
    };
    expect(hydrateFromLog(entry)).toEqual(["65x10", "60x8"]);
  });

  it("returns array of empty strings when sets is empty", () => {
    const entry: WorkoutLogEntry = { exerciseId: "ex-1", sets: [] };
    expect(hydrateFromLog(entry)).toEqual([""]);
  });
});
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- sessionState --no-coverage
```

Expected: `Cannot find module './sessionState'`

- [ ] **Step 1.3: Implement**

```ts
// src/lib/workout/sessionState.ts
import type { WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

/** Parses "65x10", "BWx8", "+70x9" etc. Returns null for empty/skip/pain. */
export function parseCellToSet(cell: string, setNumber: number): WorkoutSetLog | null {
  const v = cell.trim().toLowerCase();
  if (!v || v.includes("skip") || v.includes("pain")) return null;

  // Strip PR marker
  const clean = v.replace(/^\+/, "");

  // BW×reps
  const bwMatch = clean.match(/^bw[×x](\d+)$/i);
  if (bwMatch) return { setNumber, reps: parseInt(bwMatch[1], 10) };

  // weight×reps
  const wrMatch = clean.match(/^(\d+(?:\.\d+)?)[×x](\d+)$/);
  if (wrMatch) return { setNumber, weight: parseFloat(wrMatch[1]), reps: parseInt(wrMatch[2], 10) };

  // weight only
  const wMatch = clean.match(/^(\d+(?:\.\d+)?)$/);
  if (wMatch) return { setNumber, weight: parseFloat(wMatch[1]) };

  return null;
}

/** Maps an array of freeform cell strings → WorkoutSetLog[], skipping empties. */
export function serialiseSets(cells: string[]): WorkoutSetLog[] {
  return cells
    .map((cell, i) => parseCellToSet(cell, i + 1))
    .filter((s): s is WorkoutSetLog => s !== null);
}

/** Maps a WorkoutLogEntry back to freeform cell strings for the Today UI. */
export function hydrateFromLog(entry: WorkoutLogEntry): string[] {
  if (entry.sets.length === 0) return [""];
  return entry.sets.map((s) => {
    if (!s.weight) return s.reps ? `BWx${s.reps}` : "";
    return s.reps ? `${s.weight}x${s.reps}` : `${s.weight}`;
  });
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- sessionState --no-coverage
```

Expected: all 6 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/sessionState.ts src/lib/workout/sessionState.test.ts
git commit -m "feat: add sessionState parse/serialise utilities"
```

---

## Task 2: Add `getForDay` to logRepo

**Files:**
- Modify: `src/lib/storage/logRepo.ts`

- [ ] **Step 2.1: Write failing test**

```ts
// Add to src/lib/storage/appDb.test.ts
import { logRepo } from "./logRepo";
import type { WorkoutLogDocument } from "@/lib/programs/types";

describe("logRepo.getForDay", () => {
  it("returns log for matching programId + dayId + today date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const log: WorkoutLogDocument = {
      id: "log-1",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: `${today}T09:00:00.000Z`,
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", today);
    expect(result?.id).toBe("log-1");
  });

  it("returns undefined when no log exists for that day", async () => {
    const result = await logRepo.getForDay("prog-x", "day-x", "2099-01-01");
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2.2: Run to confirm red**

```bash
bun run test -- appDb --no-coverage
```

Expected: `TypeError: logRepo.getForDay is not a function`

- [ ] **Step 2.3: Implement**

```ts
// src/lib/storage/logRepo.ts  — add to existing exports
  async getForDay(programId: string, dayId: string, date: string) {
    const all = await (await getDb()).getAllFromIndex("logs", "by-day", dayId);
    return all.find(
      (l) => l.programId === programId && l.performedAt.startsWith(date),
    );
  },
```

- [ ] **Step 2.4: Run tests green**

```bash
bun run test -- appDb --no-coverage
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/storage/logRepo.ts src/lib/storage/appDb.test.ts
git commit -m "feat(logRepo): add getForDay for today-screen hydration"
```

---

## Task 3: Hydrate TodayClient from log on mount + Finish button

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 3.1: Add hydration + finish to TodayWorkout**

Replace the `buildInitialCells` call + `useState` init in `TodayWorkout` with:

```tsx
// src/components/workout/TodayClient.tsx — inside TodayWorkout
// add imports at top of file:
import { logRepo } from "@/lib/storage/logRepo";
import { serialiseSets, hydrateFromLog } from "@/lib/workout/sessionState";
import { CheckCircle } from "lucide-react";

// Replace useState + save useCallback with:
const [cells, setCells] = useState<CellMap>(() => buildInitialCells(day));
const [saved, setSaved] = useState(false);

// Add after useState:
useEffect(() => {
  const today = new Date().toISOString().slice(0, 10);
  logRepo
    .getForDay(program.id, day.id, today)
    .then((log) => {
      if (!log) return;
      const hydrated: CellMap = {};
      for (const entry of log.entries) {
        hydrated[entry.exerciseId] = hydrateFromLog(entry);
      }
      setCells((prev) => ({ ...prev, ...hydrated }));
    })
    .catch(() => undefined);
}, [program.id, day.id]);

async function finishWorkout() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await logRepo.getForDay(program.id, day.id, today);
  const entries = Object.entries(cells).map(([exerciseId, vals]) => ({
    exerciseId,
    sets: serialiseSets(vals),
  }));
  await logRepo.save({
    id: existing?.id ?? crypto.randomUUID(),
    programId: program.id,
    dayId: day.id,
    performedAt: new Date().toISOString(),
    entries,
  });
  setSaved(true);
  setTimeout(() => setSaved(false), 2500);
}
```

- [ ] **Step 3.2: Update WorkoutProgress to show Finish button**

Replace the `WorkoutProgress` component's inner div with:

```tsx
function WorkoutProgress({ cells, onFinish, saved }: { cells: CellMap; onFinish: () => void; saved: boolean }) {
  let total = 0, done = 0;
  for (const vals of Object.values(cells)) {
    for (const v of vals) { total++; if (v) done++; }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 4, background: "var(--bg-1)", borderTop: "1px solid var(--line)" }}>
      <div style={{ height: 2, background: "var(--bg-3)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--accent)", transition: "width .3s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", flex: 1 }}>
          {done}/{total} <span style={{ color: "var(--fg-4)" }}>· {pct}%</span>
        </span>
        <button
          className={`btn ${pct === 100 ? "primary" : ""}`}
          onClick={onFinish}
          style={{ fontSize: 12 }}
        >
          {saved ? <><CheckCircle size={13} /> Saved</> : "Finish workout"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.3: Wire the new props in TodayWorkout render**

```tsx
// In TodayWorkout's return — replace <WorkoutProgress cells={cells} /> with:
<WorkoutProgress cells={cells} onFinish={finishWorkout} saved={saved} />
```

- [ ] **Step 3.4: Fix imports — add useEffect**

```ts
import { useCallback, useEffect, useState } from "react";
```

- [ ] **Step 3.5: Manual smoke test**

```bash
bun run dev
```

Open `http://localhost:3000/today`. Fill a few cells, click "Finish workout". Reload — cells should restore. Check DevTools → Application → IndexedDB → trainer-local-first → logs for the new entry.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "feat(today): hydrate cells from logRepo and save on finish"
```

---

## Task 4: Remove duplicate localStorage persistence

Now that logRepo is the source of truth, remove the `localStorage` fallback in `TodayWorkout` to avoid dual-write confusion.

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 4.1: Delete the `save` callback and localStorage reads**

In `TodayWorkout`, delete:
```tsx
// DELETE these lines:
const storageKey = `trainer-today-${program.id}-${day.id}`;
// ... the try/catch localStorage.getItem in useState initializer
// ... the save useCallback
// ... the save(next) call in handleCellChange and handleAddSet
```

The `useState` initializer should become simply:
```tsx
const [cells, setCells] = useState<CellMap>(() => buildInitialCells(day));
```

- [ ] **Step 4.2: Remove unused import**

```ts
// Remove: useCallback
import { useEffect, useState } from "react";
```

- [ ] **Step 4.3: Build check**

```bash
bun run build 2>&1 | tail -10
```

Expected: clean compile, no errors.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "refactor(today): remove localStorage dual-write; logRepo is source of truth"
```
