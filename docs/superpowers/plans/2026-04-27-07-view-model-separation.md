# View Model Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the cell-state view model and section-kind presentation logic out of `TodayClient.tsx` into dedicated modules so that React components only import display concerns, not data transformation.

**Architecture:** Two new library files: `src/lib/workout/cellMap.ts` (pure functions for building and mutating the `CellMap` type) and `src/lib/workout/sectionKind.ts` (maps a `SectionType` to a CSS class + glyph). `TodayClient.tsx` becomes a thin React shell that delegates all data logic to these modules. `CellMap` and related types are exported from `cellMap.ts` and re-used by `sessionState.ts` (Plan 01) without duplication.

**Tech Stack:** TypeScript, Jest, React 19, Next.js App Router.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/cellMap.ts` | `CellMap` type, `buildInitialCells`, `updateCell`, `addSet` |
| Create | `src/lib/workout/cellMap.test.ts` | Unit tests for pure cell operations |
| Create | `src/lib/workout/sectionKind.ts` | `sectionKind(type)` → `{ cls, glyph }` |
| Create | `src/lib/workout/sectionKind.test.ts` | Unit tests for sectionKind mapping |
| Modify | `src/components/workout/TodayClient.tsx` | Import from cellMap + sectionKind; remove inline duplicates |

---

## Task 1: Extract `CellMap` into `cellMap.ts`

**Files:**
- Create: `src/lib/workout/cellMap.ts`
- Create: `src/lib/workout/cellMap.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/cellMap.test.ts
import { buildInitialCells, updateCell, addSet, type CellMap } from "./cellMap";
import { demoProgram } from "@/lib/programs/sample";

const day = demoProgram.days[0];

describe("buildInitialCells", () => {
  it("creates one entry per exercise keyed by exercise id", () => {
    const map = buildInitialCells(day);
    const allExIds = day.sections.flatMap((s) => s.groups.flatMap((g) => g.exercises.map((e) => e.id)));
    expect(Object.keys(map).sort()).toEqual(allExIds.sort());
  });

  it("uses exercise.sets count for initial array length", () => {
    const map = buildInitialCells(day);
    const pullup = day.sections[1].groups[0].exercises[0];
    expect(map[pullup.id]).toHaveLength(pullup.sets ?? 3);
  });

  it("defaults to 3 cells when exercise has no sets defined", () => {
    const noSets = {
      ...day,
      sections: [
        {
          ...day.sections[0],
          groups: [
            {
              ...day.sections[0].groups[0],
              exercises: [{ ...day.sections[0].groups[0].exercises[0], sets: undefined }],
            },
          ],
        },
      ],
    };
    const map = buildInitialCells(noSets);
    const exId = noSets.sections[0].groups[0].exercises[0].id;
    expect(map[exId]).toHaveLength(3);
  });

  it("initialises all cells to empty string", () => {
    const map = buildInitialCells(day);
    for (const cells of Object.values(map)) {
      expect(cells.every((c) => c === "")).toBe(true);
    }
  });
});

describe("updateCell", () => {
  it("returns a new map with the updated cell", () => {
    const map: CellMap = { "ex-1": ["", "", ""] };
    const next = updateCell(map, "ex-1", 1, "65x10");
    expect(next["ex-1"]).toEqual(["", "65x10", ""]);
    expect(map["ex-1"]).toEqual(["", "", ""]); // original unchanged
  });

  it("grows the array if index is out of bounds", () => {
    const map: CellMap = { "ex-1": ["70x5"] };
    const next = updateCell(map, "ex-1", 2, "60x8");
    expect(next["ex-1"][2]).toBe("60x8");
  });
});

describe("addSet", () => {
  it("appends an empty cell to the exercise's array", () => {
    const map: CellMap = { "ex-1": ["65x10", "65x10"] };
    const next = addSet(map, "ex-1");
    expect(next["ex-1"]).toHaveLength(3);
    expect(next["ex-1"][2]).toBe("");
    expect(map["ex-1"]).toHaveLength(2); // original unchanged
  });
});
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- cellMap.test --no-coverage
```

Expected: `Cannot find module './cellMap'`

- [ ] **Step 1.3: Implement `cellMap.ts`**

```ts
// src/lib/workout/cellMap.ts
import type { ProgramDay } from "@/lib/programs/types";

export type CellMap = Record<string, string[]>;

export function buildInitialCells(day: ProgramDay): CellMap {
  const map: CellMap = {};
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        map[ex.id] = Array(ex.sets ?? 3).fill("");
      }
    }
  }
  return map;
}

export function updateCell(map: CellMap, exId: string, index: number, value: string): CellMap {
  const cells = [...(map[exId] ?? [])];
  cells[index] = value;
  return { ...map, [exId]: cells };
}

export function addSet(map: CellMap, exId: string): CellMap {
  return { ...map, [exId]: [...(map[exId] ?? []), ""] };
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- cellMap.test --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/cellMap.ts src/lib/workout/cellMap.test.ts
git commit -m "feat(workout): extract CellMap type and pure cell operations into cellMap.ts"
```

---

## Task 2: Extract `sectionKind` into `sectionKind.ts`

**Files:**
- Create: `src/lib/workout/sectionKind.ts`
- Create: `src/lib/workout/sectionKind.test.ts`

- [ ] **Step 2.1: Write failing tests**

```ts
// src/lib/workout/sectionKind.test.ts
import { sectionKind } from "./sectionKind";

describe("sectionKind", () => {
  it("warmup → sec-warmup / ◐", () => {
    expect(sectionKind("warmup")).toEqual({ cls: "sec-warmup", glyph: "◐" });
  });

  it("strength → sec-strength / ■", () => {
    expect(sectionKind("strength")).toEqual({ cls: "sec-strength", glyph: "■" });
  });

  it("power → sec-strength / ■", () => {
    expect(sectionKind("power")).toEqual({ cls: "sec-strength", glyph: "■" });
  });

  it("metcon → sec-metcon / ◇", () => {
    expect(sectionKind("metcon")).toEqual({ cls: "sec-metcon", glyph: "◇" });
  });

  it("cardio → sec-metcon / ◇", () => {
    expect(sectionKind("cardio")).toEqual({ cls: "sec-metcon", glyph: "◇" });
  });

  it("hypertrophy → sec-hypertrophy / ●", () => {
    expect(sectionKind("hypertrophy")).toEqual({ cls: "sec-hypertrophy", glyph: "●" });
  });

  it("accessory → sec-hypertrophy / ●", () => {
    expect(sectionKind("accessory")).toEqual({ cls: "sec-hypertrophy", glyph: "●" });
  });

  it("rehab → sec-rehab / +", () => {
    expect(sectionKind("rehab")).toEqual({ cls: "sec-rehab", glyph: "+" });
  });

  it("unknown type → sec-default / ·", () => {
    expect(sectionKind("training")).toEqual({ cls: "sec-default", glyph: "·" });
  });

  it("is case-insensitive", () => {
    expect(sectionKind("WARMUP")).toEqual({ cls: "sec-warmup", glyph: "◐" });
    expect(sectionKind("Strength")).toEqual({ cls: "sec-strength", glyph: "■" });
  });
});
```

- [ ] **Step 2.2: Run to confirm red**

```bash
bun run test -- sectionKind.test --no-coverage
```

Expected: `Cannot find module './sectionKind'`

- [ ] **Step 2.3: Implement `sectionKind.ts`**

```ts
// src/lib/workout/sectionKind.ts

export type SectionKind = { cls: string; glyph: string };

export function sectionKind(type: string): SectionKind {
  const t = type.toLowerCase();
  if (t.includes("warm")) return { cls: "sec-warmup", glyph: "◐" };
  if (t.includes("explos")) return { cls: "sec-explosive", glyph: "◆" };
  if (t.includes("strength") || t.includes("power")) return { cls: "sec-strength", glyph: "■" };
  if (t.includes("metcon") || t.includes("cardio") || t.includes("cond")) return { cls: "sec-metcon", glyph: "◇" };
  if (t.includes("hypert") || t.includes("accessory") || t.includes("isolation")) return { cls: "sec-hypertrophy", glyph: "●" };
  if (t.includes("rehab") || t.includes("cool") || t.includes("mobil")) return { cls: "sec-rehab", glyph: "+" };
  return { cls: "sec-default", glyph: "·" };
}
```

- [ ] **Step 2.4: Run tests green**

```bash
bun run test -- sectionKind.test --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/workout/sectionKind.ts src/lib/workout/sectionKind.test.ts
git commit -m "feat(workout): extract sectionKind presentation mapping into sectionKind.ts"
```

---

## Task 3: Update `TodayClient.tsx` to import from new modules

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 3.1: Add imports at the top of `TodayClient.tsx`**

```ts
import { buildInitialCells, updateCell, addSet, type CellMap } from "@/lib/workout/cellMap";
import { sectionKind } from "@/lib/workout/sectionKind";
```

- [ ] **Step 3.2: Remove the inline `CellMap` type**

Delete this line from `TodayClient.tsx`:

```ts
// DELETE:
type CellMap = Record<string, string[]>;
```

- [ ] **Step 3.3: Remove the inline `sectionKind` function**

Delete the entire `sectionKind` function (lines starting with `const sectionKind = (type: string)...` through its closing `}`).

- [ ] **Step 3.4: Remove the inline `buildInitialCells` function**

Delete the entire `buildInitialCells` function from `TodayClient.tsx`.

- [ ] **Step 3.5: Replace `handleCellChange` body to use `updateCell`**

```ts
// BEFORE:
  const handleCellChange = (exId: string, i: number, v: string) => {
    setCells((prev) => {
      const next = { ...prev, [exId]: [...(prev[exId] ?? [])] };
      next[exId][i] = v;
      save(next);
      return next;
    });
  };

// AFTER:
  const handleCellChange = (exId: string, i: number, v: string) => {
    setCells((prev) => {
      const next = updateCell(prev, exId, i, v);
      save(next);
      return next;
    });
  };
```

- [ ] **Step 3.6: Replace `handleAddSet` body to use `addSet`**

```ts
// BEFORE:
  const handleAddSet = (exId: string) => {
    setCells((prev) => {
      const next = { ...prev, [exId]: [...(prev[exId] ?? []), ""] };
      save(next);
      return next;
    });
  };

// AFTER:
  const handleAddSet = (exId: string) => {
    setCells((prev) => {
      const next = addSet(prev, exId);
      save(next);
      return next;
    });
  };
```

- [ ] **Step 3.7: Build check**

```bash
bun run build 2>&1 | tail -6
```

Expected: clean compile.

- [ ] **Step 3.8: Run all tests**

```bash
bun run test --no-coverage 2>&1 | tail -10
```

Expected: all suites PASS.

- [ ] **Step 3.9: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "refactor(today): delegate cell and section-kind logic to workout lib modules"
```

---

## Task 4: Remove unused `exCellKey` helper

After Task 3, `exCellKey` in `TodayClient.tsx` is a trivial identity function that existed only to allow future key transformation. With `cellMap.ts` owning the key strategy, the helper is redundant.

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 4.1: Delete the `exCellKey` function from `TodayClient.tsx`**

```ts
// DELETE this function:
function exCellKey(exerciseId: string) {
  return exerciseId;
}
```

- [ ] **Step 4.2: Replace all `exCellKey(ex.id)` calls with `ex.id` directly**

```bash
grep -n "exCellKey" src/components/workout/TodayClient.tsx
```

For each match, replace `exCellKey(ex.id)` with `ex.id`.

- [ ] **Step 4.3: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 4.4: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "refactor(today): remove redundant exCellKey identity helper"
```
