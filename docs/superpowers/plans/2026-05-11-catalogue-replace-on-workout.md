# Catalogue Replace on Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Replace from catalogue" button next to the History button on each exercise in the active workout view, letting users swap an exercise for one from the built-in catalogue without touching AI.

**Architecture:** A new single-select `ExerciseReplaceSheet` bottom-sheet component handles catalogue search and selection. A new `swapExercise` utility rewrites the target exercise in the `ProgramDay` (keeping its id so the diff shows "modified", preserving the original prescription). The result goes through the existing `handleApplyReplacement` → DiffPage flow — no new save path needed.

**Tech Stack:** React, TypeScript, lucide-react (`ArrowLeftRight` icon), existing `exerciseCatalog`, existing diff/pendingDiff flow.

---

## File Map

| File | Action | Role |
|---|---|---|
| `src/lib/workout/exerciseSwap.ts` | **Create** | Pure function: swap one exercise in a day |
| `src/lib/workout/exerciseSwap.test.ts` | **Create** | Unit tests for `swapExercise` |
| `src/components/workout/ExerciseReplaceSheet.tsx` | **Create** | Single-select catalogue picker bottom-sheet |
| `src/components/workout/TodayClient.tsx` | **Modify** | Wire replace button, sheet state, and handler |

---

### Task 1: `swapExercise` utility

**Files:**
- Create: `src/lib/workout/exerciseSwap.ts`
- Create: `src/lib/workout/exerciseSwap.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/workout/exerciseSwap.test.ts
import { swapExercise } from "./exerciseSwap";
import type { ProgramDay } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

const mockDay: ProgramDay = {
  id: "day-1",
  dayNumber: 1,
  title: "Day 1",
  sections: [
    {
      id: "sec-1",
      type: "strength",
      name: "Main",
      groups: [
        {
          id: "grp-1",
          type: "single",
          exercises: [
            {
              id: "ex-1",
              name: "Squat",
              sets: 4,
              reps: "5",
              load: "100kg",
              rest: "3m",
              tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] },
            },
            {
              id: "ex-2",
              name: "Bench Press",
              sets: 3,
              reps: "8",
              tags: { primary: ["chest"], secondary: ["triceps"], incidental: [], modifiers: [] },
            },
          ],
        },
      ],
    },
  ],
};

const catalogItem: ExerciseCatalogItem = {
  id: "cat-leg-press",
  name: "Leg Press",
  aliases: [],
  equipment: ["machine"],
  movementPatterns: ["push"],
  muscles: { primary: ["quads"], secondary: ["glutes"] },
  tags: [],
};

describe("swapExercise", () => {
  it("replaces the target exercise name and canonicalExerciseId", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const ex = result.sections[0].groups[0].exercises[0];
    expect(ex.name).toBe("Leg Press");
    expect(ex.canonicalExerciseId).toBe("cat-leg-press");
  });

  it("keeps the same exercise id so the diff shows 'modified' not removed+added", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    expect(result.sections[0].groups[0].exercises[0].id).toBe("ex-1");
  });

  it("preserves original sets, reps, load, rest, notes from the original", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const ex = result.sections[0].groups[0].exercises[0];
    expect(ex.sets).toBe(4);
    expect(ex.reps).toBe("5");
    expect(ex.load).toBe("100kg");
    expect(ex.rest).toBe("3m");
  });

  it("populates tags from the catalog item muscles", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const tags = result.sections[0].groups[0].exercises[0].tags;
    expect(tags.primary).toEqual(["quads"]);
    expect(tags.secondary).toEqual(["glutes"]);
    expect(tags.incidental).toEqual([]);
    expect(tags.modifiers).toEqual([]);
  });

  it("leaves other exercises untouched", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const bench = result.sections[0].groups[0].exercises[1];
    expect(bench.name).toBe("Bench Press");
    expect(bench.id).toBe("ex-2");
  });

  it("returns the day unchanged when targetId is not found", () => {
    const result = swapExercise(mockDay, "ex-999", catalogItem);
    expect(result).toEqual(mockDay);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/lib/workout/exerciseSwap.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './exerciseSwap'`

- [ ] **Step 3: Implement `swapExercise`**

```typescript
// src/lib/workout/exerciseSwap.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

export function swapExercise(
  day: ProgramDay,
  targetId: string,
  item: ExerciseCatalogItem,
): ProgramDay {
  return {
    ...day,
    sections: day.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        exercises: group.exercises.map((ex) => {
          if (ex.id !== targetId) return ex;
          return {
            ...ex,
            name: item.name,
            canonicalExerciseId: item.id,
            tags: {
              primary: item.muscles.primary,
              secondary: item.muscles.secondary,
              incidental: [],
              modifiers: [],
            },
          };
        }),
      })),
    })),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest src/lib/workout/exerciseSwap.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout/exerciseSwap.ts src/lib/workout/exerciseSwap.test.ts
git commit -m "feat: add swapExercise utility to replace one exercise in a day"
```

---

### Task 2: `ExerciseReplaceSheet` component

**Files:**
- Create: `src/components/workout/ExerciseReplaceSheet.tsx`

The component is a single-select catalogue picker (contrast with `ExercisePickerSheet` which is multi-select for "add" use-case). Tapping a row selects it; the footer button fires `onSelect`.

- [ ] **Step 1: Create the component**

```tsx
// src/components/workout/ExerciseReplaceSheet.tsx
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";

type Props = {
  onSelect: (item: ExerciseCatalogItem) => void;
  onClose: () => void;
};

export function ExerciseReplaceSheet({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const muscles = useMemo(() => {
    const all = exerciseCatalog.flatMap((e) => e.muscles.primary);
    return [...new Set(all)].sort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return exerciseCatalog.filter((e) => {
      if (muscleFilter && !e.muscles.primary.includes(muscleFilter)) return false;
      if (q) {
        const inName = e.name.toLowerCase().includes(q);
        const inAlias = e.aliases.some((a) => a.toLowerCase().includes(q));
        const inMuscle = e.muscles.primary.some((m) => m.toLowerCase().includes(q));
        if (!inName && !inAlias && !inMuscle) return false;
      }
      return true;
    });
  }, [query, muscleFilter]);

  function handleConfirm() {
    const item = exerciseCatalog.find((e) => e.id === selected);
    if (item) onSelect(item);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          maxHeight: "70vh",
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "12px 12px 0 0",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
          <span className="tx-up flex-1">Replace with…</span>
          <button type="button" onClick={onClose} className="p-1 muted">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2 shrink-0">
          <div
            className="flex items-center gap-2 rounded px-3 py-2"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
          >
            <Search size={14} style={{ color: "var(--fg-3)" }} />
            <input
              className="flex-1 bg-transparent outline-none text-sm"
              placeholder="Search exercises…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X size={12} style={{ color: "var(--fg-3)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Muscle filter chips */}
        <div className="px-4 pb-2 overflow-x-auto flex gap-1.5 shrink-0">
          <FilterChip label="all" active={!muscleFilter} onClick={() => setMuscleFilter(null)} />
          {muscles.slice(0, 12).map((m) => (
            <FilterChip
              key={m}
              label={m}
              active={muscleFilter === m}
              onClick={() => setMuscleFilter(muscleFilter === m ? null : m)}
            />
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {filtered.length === 0 && (
            <p className="muted text-sm text-center py-8">No exercises match</p>
          )}
          {filtered.map((item) => {
            const isSelected = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className="w-full flex items-center gap-3 py-2 border-b text-left"
                style={{ borderColor: "var(--line)" }}
                aria-pressed={isSelected}
              >
                <div
                  className="shrink-0 rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    background: isSelected ? "var(--accent)" : "var(--bg-3)",
                    border: `2px solid ${isSelected ? "var(--accent)" : "var(--line)"}`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p
                    className="text-[10px] truncate"
                    style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
                  >
                    {item.muscles.primary.slice(0, 2).join(" · ")}
                    {item.equipment[0] ? ` · ${item.equipment[0]}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className="button w-full justify-center"
            disabled={!selected}
            onClick={handleConfirm}
          >
            {selected ? "Replace exercise" : "Select an exercise"}
          </button>
        </div>
      </div>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors"
      style={{
        background: active ? "var(--accent-soft)" : "var(--bg-2)",
        borderColor: active ? "var(--accent)" : "var(--line)",
        color: active ? "var(--accent)" : "var(--fg-2)",
      }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit 2>&1 | grep ExerciseReplaceSheet
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/workout/ExerciseReplaceSheet.tsx
git commit -m "feat: add ExerciseReplaceSheet single-select catalogue picker"
```

---

### Task 3: Wire replace button into TodayClient

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

Three touch-points:
1. `ExerciseRow` — add `onReplaceExercise: () => void` prop and an `ArrowLeftRight` button next to the History button
2. `SectionCard` — thread `onReplaceExercise` down
3. `TodayWorkout` — add `replaceTarget` state, `onOpenReplace` / `onReplaceConfirm` handlers, render `ExerciseReplaceSheet`

- [ ] **Step 1: Add `ArrowLeftRight` to the lucide import and `onReplaceExercise` prop to `ExerciseRow`**

In `TodayClient.tsx`, locate the lucide import line:

```typescript
// Before
import { CheckCircle, Download, History, Plus, Sparkles } from "lucide-react";

// After
import { ArrowLeftRight, CheckCircle, Download, History, Plus, Sparkles } from "lucide-react";
```

Locate the `ExerciseRow` props type (around line 81–92):

```typescript
// Before
const ExerciseRow = memo(function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;
}) {

// After
const ExerciseRow = memo(function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;
  onReplaceExercise: () => void;
}) {
```

- [ ] **Step 2: Add the Replace button inside ExerciseRow next to History**

In ExerciseRow, locate the div containing the History button (around line 112–125):

```tsx
// Before
<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", flex: 1 }}>
    {exercise.name}
  </span>
  <button
    className="btn ghost"
    onClick={onOpenHistory}
    style={{ padding: "3px 6px", flexShrink: 0 }}
    aria-label={`History for ${exercise.name}`}
    title="History"
    type="button"
  >
    <History size={13} aria-hidden />
  </button>
</div>

// After
<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", flex: 1 }}>
    {exercise.name}
  </span>
  <button
    className="btn ghost"
    onClick={onReplaceExercise}
    style={{ padding: "3px 6px", flexShrink: 0 }}
    aria-label={`Replace ${exercise.name} from catalogue`}
    title="Replace from catalogue"
    type="button"
  >
    <ArrowLeftRight size={13} aria-hidden />
  </button>
  <button
    className="btn ghost"
    onClick={onOpenHistory}
    style={{ padding: "3px 6px", flexShrink: 0 }}
    aria-label={`History for ${exercise.name}`}
    title="History"
    type="button"
  >
    <History size={13} aria-hidden />
  </button>
</div>
```

- [ ] **Step 3: Thread `onReplaceExercise` through `SectionCard`**

Locate the `SectionCard` props type (around line 192–204):

```typescript
// Before
function SectionCard({
  section,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
}: {
  section: ProgramSection;
  cells: CellMap;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
}) {

// After
function SectionCard({
  section,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
}: {
  section: ProgramSection;
  cells: CellMap;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
  onReplaceExercise: (exerciseId: string) => void;
}) {
```

Inside `SectionCard`, locate the `ExerciseRow` usage (around line 239–249) and add the new prop:

```tsx
// Before
<ExerciseRow
  key={ex.id}
  exercise={ex}
  cells={cells[ex.id] ?? [""]}
  onCellChange={(i, v) => onCellChange(ex.id, i, v)}
  onAddSet={() => onAddSet(ex.id)}
  onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
/>

// After
<ExerciseRow
  key={ex.id}
  exercise={ex}
  cells={cells[ex.id] ?? [""]}
  onCellChange={(i, v) => onCellChange(ex.id, i, v)}
  onAddSet={() => onAddSet(ex.id)}
  onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
  onReplaceExercise={() => onReplaceExercise(ex.id)}
/>
```

- [ ] **Step 4: Add imports, state, and handlers in `TodayWorkout`**

Add import for `ExerciseReplaceSheet` and `swapExercise` at the top of `TodayClient.tsx` (after the existing imports):

```typescript
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";
import { swapExercise } from "@/lib/workout/exerciseSwap";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";
```

Inside `TodayWorkout` (around line 282, after the `historyDrawer` state), add:

```typescript
const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
```

After `handleApplyReplacement` (around line 403), add:

```typescript
function handleReplaceConfirm(item: ExerciseCatalogItem) {
  if (!replaceTarget) return;
  const newDay = swapExercise(day, replaceTarget, item);
  setReplaceTarget(null);
  handleApplyReplacement(newDay);
}
```

- [ ] **Step 5: Pass `onReplaceExercise` to `SectionCard` and render the sheet**

Locate the sections render in `TodayWorkout` (around line 457) and add the new prop:

```tsx
// Before
{day.sections.map((section) => (
  <SectionCard
    key={section.id}
    section={section}
    cells={cells}
    onCellChange={handleCellChange}
    onAddSet={handleAddSet}
    onOpenHistory={openHistoryFor}
  />
))}

// After
{day.sections.map((section) => (
  <SectionCard
    key={section.id}
    section={section}
    cells={cells}
    onCellChange={handleCellChange}
    onAddSet={handleAddSet}
    onOpenHistory={openHistoryFor}
    onReplaceExercise={(exerciseId) => setReplaceTarget(exerciseId)}
  />
))}
```

Locate the `{historyDrawer && ...}` block (around line 475) and add after it:

```tsx
{replaceTarget && (
  <ExerciseReplaceSheet
    onSelect={handleReplaceConfirm}
    onClose={() => setReplaceTarget(null)}
  />
)}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "TodayClient|ExerciseReplaceSheet|exerciseSwap"
```

Expected: no output (no type errors)

- [ ] **Step 7: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (no regressions)

- [ ] **Step 8: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "feat: add replace-from-catalogue button next to history on each exercise"
```

---

## Self-Review

**Spec coverage:**
- ✅ Button next to History — ArrowLeftRight added to ExerciseRow alongside existing History button
- ✅ Replace from catalogue (not AI) — opens ExerciseReplaceSheet, single-select, no AI call
- ✅ Goes through existing diff flow — `handleApplyReplacement` → DiffPage → accept/discard

**Placeholder scan:** No TBDs, TODOs, or vague "implement later" steps.

**Type consistency:**
- `onReplaceExercise: () => void` in ExerciseRow (called without args; closure captures `ex.id`)
- `onReplaceExercise: (exerciseId: string) => void` in SectionCard (passes the id down)
- `replaceTarget: string | null` in TodayWorkout
- `handleReplaceConfirm(item: ExerciseCatalogItem)` matches `ExerciseReplaceSheet`'s `onSelect` prop
- `swapExercise(day, targetId, item)` signature consistent across utility and call site
