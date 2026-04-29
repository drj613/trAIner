# Test Strategy Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand test coverage across domain utilities, storage layer, and UI-critical flows so that the surfaces built in Plans 01–04 have regression protection before they are exercised in production.

**Architecture:** All tests are co-located with their source files. Storage tests use `fake-indexeddb/auto` (already in `jest.config.js`). UI tests use `@testing-library/react` + `jsdom`. No new test helpers needed — follow patterns in `appDb.test.ts` and `LocalDataProvider.test.tsx`.

**Tech Stack:** Jest, `@testing-library/react`, `fake-indexeddb`, `idb`, existing `demoProgram` + `defaultProfile` fixtures.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/sessionState.test.ts` | parse/serialise/hydrate unit tests |
| Create | `src/lib/workout/programGrid.test.ts` | buildWeekGrid unit tests |
| Modify | `src/lib/storage/appDb.test.ts` | add logRepo.getForDay tests |
| Create | `src/lib/programs/overrides.accumulation.test.ts` | multi-override stacking tests |
| Create | `src/components/workout/SetCell.test.tsx` | classifyCell + render smoke test |

---

## Task 1: sessionState parse/serialise tests

**Files:**
- Create: `src/lib/workout/sessionState.test.ts`

> These tests are the same ones referenced in Plan 01. If Plan 01 has already been executed and the file exists, skip to Task 2.

- [ ] **Step 1.1: Check if file already exists**

```bash
ls src/lib/workout/sessionState.test.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

- [ ] **Step 1.2: Write the test file (if missing)**

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

  it("parses decimal weight", () => {
    expect(parseCellToSet("52.5x6", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 52.5, reps: 6,
    });
  });

  it("returns null for empty string", () => {
    expect(parseCellToSet("", 1)).toBeNull();
  });

  it("returns null for skip", () => {
    expect(parseCellToSet("skip", 1)).toBeNull();
  });

  it("returns null for pain", () => {
    expect(parseCellToSet("pain", 1)).toBeNull();
  });

  it("strips PR marker from +70x9", () => {
    expect(parseCellToSet("+70x9", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 70, reps: 9,
    });
  });
});

describe("serialiseSets", () => {
  it("converts cell strings to WorkoutSetLog[], skipping empties", () => {
    const result = serialiseSets(["65x10", "", "60x8"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ setNumber: 1, weight: 65, reps: 10 });
    expect(result[1]).toEqual({ setNumber: 3, weight: 60, reps: 8 });
  });

  it("returns empty array for all-empty cells", () => {
    expect(serialiseSets(["", "", ""])).toEqual([]);
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

  it("renders bodyweight sets without weight prefix", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [{ setNumber: 1, weight: undefined, reps: 12 }],
    };
    expect(hydrateFromLog(entry)).toEqual(["BWx12"]);
  });

  it("returns array of empty strings when sets is empty", () => {
    const entry: WorkoutLogEntry = { exerciseId: "ex-1", sets: [] };
    expect(hydrateFromLog(entry)).toEqual([""]);
  });
});
```

- [ ] **Step 1.3: Run — expect red if sessionState.ts not yet created, green if Plan 01 already ran**

```bash
bun run test -- sessionState --no-coverage
```

- [ ] **Step 1.4: Commit (if the file is new)**

```bash
git add src/lib/workout/sessionState.test.ts
git commit -m "test: add sessionState parse/serialise unit tests"
```

---

## Task 2: programGrid grouping tests

**Files:**
- Create: `src/lib/workout/programGrid.test.ts`

> These tests are the same ones referenced in Plan 04. If Plan 04 has already been executed and the file exists, skip to Task 3.

- [ ] **Step 2.1: Check if file already exists**

```bash
ls src/lib/workout/programGrid.test.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

- [ ] **Step 2.2: Write the test file (if missing)**

```ts
// src/lib/workout/programGrid.test.ts
import { buildWeekGrid, type WeekRow } from "./programGrid";
import type { ProgramDay } from "@/lib/programs/types";

function makeDay(id: string, weekNumber: number, dayNumber: number, title: string): ProgramDay {
  return { id, weekNumber, dayNumber, title, sections: [] };
}

describe("buildWeekGrid", () => {
  const days: ProgramDay[] = [
    makeDay("d1", 1, 1, "Upper A"),
    makeDay("d2", 1, 2, "Lower A"),
    makeDay("d3", 2, 1, "Upper B"),
    makeDay("d4", 2, 2, "Lower B"),
  ];

  it("groups into correct week count", () => {
    const grid = buildWeekGrid(days);
    expect(grid).toHaveLength(2);
  });

  it("week 1 has correct days in order", () => {
    const grid = buildWeekGrid(days);
    expect(grid[0].weekNumber).toBe(1);
    expect(grid[0].days.map((d) => d.title)).toEqual(["Upper A", "Lower A"]);
  });

  it("week 2 has correct days in order", () => {
    const grid = buildWeekGrid(days);
    expect(grid[1].weekNumber).toBe(2);
    expect(grid[1].days.map((d) => d.title)).toEqual(["Upper B", "Lower B"]);
  });

  it("days without weekNumber fall into week 1", () => {
    const noWeekDays: ProgramDay[] = [makeDay("d1", undefined as unknown as number, 1, "Day A")];
    const grid = buildWeekGrid(noWeekDays);
    expect(grid).toHaveLength(1);
    expect(grid[0].weekNumber).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildWeekGrid([])).toEqual([]);
  });

  it("sorts weeks numerically even if days are unordered", () => {
    const unordered: ProgramDay[] = [
      makeDay("d3", 2, 1, "Week 2"),
      makeDay("d1", 1, 1, "Week 1"),
    ];
    const grid = buildWeekGrid(unordered);
    expect(grid[0].weekNumber).toBe(1);
    expect(grid[1].weekNumber).toBe(2);
  });
});
```

- [ ] **Step 2.3: Run — expect red if programGrid.ts not yet created, green if Plan 04 already ran**

```bash
bun run test -- programGrid --no-coverage
```

- [ ] **Step 2.4: Commit (if the file is new)**

```bash
git add src/lib/workout/programGrid.test.ts
git commit -m "test: add buildWeekGrid unit tests"
```

---

## Task 3: logRepo.getForDay storage tests

**Files:**
- Modify: `src/lib/storage/appDb.test.ts`

- [ ] **Step 3.1: Open `src/lib/storage/appDb.test.ts` and add the following describe block at the end of the file**

```ts
// append to src/lib/storage/appDb.test.ts

describe("logRepo.getForDay", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("returns undefined when no log exists for a day", async () => {
    const result = await logRepo.getForDay("prog-x", "day-x", "2099-01-01");
    expect(result).toBeUndefined();
  });

  it("returns the log matching programId + dayId + date prefix", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const log: WorkoutLogDocument = {
      id: "log-match",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: `${today}T10:00:00.000Z`,
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", today);
    expect(result?.id).toBe("log-match");
  });

  it("does not return a log from a different date", async () => {
    const log: WorkoutLogDocument = {
      id: "log-old",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: "2020-01-01T10:00:00.000Z",
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", "2099-12-31");
    expect(result).toBeUndefined();
  });

  it("does not return a log from a different program", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const log: WorkoutLogDocument = {
      id: "log-other-prog",
      programId: "prog-other",
      dayId: "day-1",
      performedAt: `${today}T10:00:00.000Z`,
      entries: [],
    };
    await logRepo.save(log);
    const result = await logRepo.getForDay("prog-1", "day-1", today);
    expect(result).toBeUndefined();
  });
});
```

Note: `WorkoutLogDocument` is already imported via `logRepo` in the existing test file. Check the top of `appDb.test.ts` and add the import if it is not already present:

```ts
import type { WorkoutLogDocument } from "@/lib/programs/types";
```

- [ ] **Step 3.2: Run — expect red if `logRepo.getForDay` not yet implemented (Plan 01 not run)**

```bash
bun run test -- appDb --no-coverage
```

Expected: if `getForDay` exists → PASS. If not → `TypeError: logRepo.getForDay is not a function`.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/storage/appDb.test.ts
git commit -m "test: add logRepo.getForDay storage regression tests"
```

---

## Task 4: Override accumulation tests

**Files:**
- Create: `src/lib/programs/overrides.accumulation.test.ts`

The existing `overrides.test.ts` covers a single day override. These tests cover stacking behavior and edge cases.

- [ ] **Step 4.1: Write failing tests**

```ts
// src/lib/programs/overrides.accumulation.test.ts
import { demoProgram } from "./sample";
import { getRenderableDays } from "./overrides";
import type { ProgramDocument, ProgramDay, ProgramOverride } from "./types";

function makeOverride(id: string, dayId: string, replacement: ProgramDay): ProgramOverride {
  return {
    id,
    scope: "day",
    programId: demoProgram.id,
    dayId,
    replacement,
    createdAt: new Date().toISOString(),
  };
}

describe("getRenderableDays — accumulation and edge cases", () => {
  it("returns base days unchanged when overrides array is empty", () => {
    const program: ProgramDocument = { ...demoProgram, overrides: [] };
    const days = getRenderableDays(program);
    expect(days).toHaveLength(demoProgram.days.length);
    expect(days[0].id).toBe(demoProgram.days[0].id);
  });

  it("applies the last override when two overrides target the same day", () => {
    const baseDay = demoProgram.days[0];
    const firstReplacement: ProgramDay = { ...baseDay, title: "First Replacement" };
    const secondReplacement: ProgramDay = { ...baseDay, title: "Second Replacement" };

    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [
        makeOverride("override-a", baseDay.id, firstReplacement),
        makeOverride("override-b", baseDay.id, secondReplacement),
      ],
    };

    const days = getRenderableDays(program);
    // The last matching override should win
    expect(days.find((d) => d.id === baseDay.id)?.title).toBe("Second Replacement");
  });

  it("does not mutate the original program object", () => {
    const baseDay = demoProgram.days[0];
    const originalTitle = baseDay.title;
    const replacement: ProgramDay = { ...baseDay, title: "Mutant Title" };

    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-1", baseDay.id, replacement)],
    };

    getRenderableDays(program);
    expect(demoProgram.days[0].title).toBe(originalTitle);
  });

  it("ignores an override targeting a day id that does not exist in program", () => {
    const phantom: ProgramDay = { id: "ghost-day", dayNumber: 99, weekNumber: 99, title: "Ghost", sections: [] };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-ghost", "ghost-day", phantom)],
    };

    const days = getRenderableDays(program);
    expect(days).toHaveLength(demoProgram.days.length);
    expect(days.find((d) => d.id === "ghost-day")).toBeUndefined();
  });

  it("preserves day ordering after override application", () => {
    const baseDay = demoProgram.days[0];
    const replacement: ProgramDay = { ...baseDay, title: "Reordered?" };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-order", baseDay.id, replacement)],
    };

    const days = getRenderableDays(program);
    expect(days[0].id).toBe(baseDay.id);
  });
});
```

- [ ] **Step 4.2: Run to confirm result**

```bash
bun run test -- overrides.accumulation --no-coverage
```

Expected: PASS if `getRenderableDays` already handles these cases. RED on any newly-exposed bugs — fix `overrides.ts` if they fail.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/programs/overrides.accumulation.test.ts
git commit -m "test: add override accumulation and edge-case regression tests"
```

---

## Task 5: SetCell.test.tsx — classifyCell + render smoke

**Files:**
- Create: `src/components/workout/SetCell.test.tsx`

- [ ] **Step 5.1: Write tests**

```tsx
// src/components/workout/SetCell.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classifyCell, SetCell } from "./SetCell";

describe("classifyCell", () => {
  it("empty string → empty", () => expect(classifyCell("")).toBe("empty"));
  it("skip → skip", () => expect(classifyCell("skip")).toBe("skip"));
  it("pain → pain", () => expect(classifyCell("pain")).toBe("pain"));
  it("+70x9 → pr", () => expect(classifyCell("+70x9")).toBe("pr"));
  it("65pr → pr", () => expect(classifyCell("65pr")).toBe("pr"));
  it("65x10! → miss", () => expect(classifyCell("65x10!")).toBe("miss"));
  it("fail → miss", () => expect(classifyCell("fail")).toBe("miss"));
  it("BWx12 → bw", () => expect(classifyCell("BWx12")).toBe("bw"));
  it("65x10 → done", () => expect(classifyCell("65x10")).toBe("done"));
  it("100 → done", () => expect(classifyCell("100")).toBe("done"));
});

describe("SetCell render", () => {
  it("renders an input with the given value", () => {
    render(<SetCell value="65x10" onChange={jest.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("65x10");
  });

  it("calls onChange when the user types", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<SetCell value="" onChange={handleChange} />);
    await user.type(screen.getByRole("textbox"), "80x5");
    expect(handleChange).toHaveBeenCalled();
  });

  it("reverts to original value on Escape", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<SetCell value="65x10" onChange={handleChange} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "99x99");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("65x10");
    expect(handleChange).not.toHaveBeenCalledWith("99x99");
  });
});
```

- [ ] **Step 5.2: Run — expect red if SetCell component does not yet export `classifyCell`**

```bash
bun run test -- SetCell --no-coverage
```

Expected: PASS if `SetCell.tsx` already exports `classifyCell`. RED with `export 'classifyCell' not found` if it doesn't — add the named export to `SetCell.tsx`.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/workout/SetCell.test.tsx
git commit -m "test: add SetCell classifyCell unit tests and render smoke"
```

---

## Task 6: Full test suite green check

- [ ] **Step 6.1: Run all tests**

```bash
bun run test --no-coverage 2>&1 | tail -20
```

Expected: all suites pass. Fix any failures before proceeding.

- [ ] **Step 6.2: Run with coverage summary**

```bash
bun run test:coverage 2>&1 | grep -E "^(All|Statements|Branches|Functions|Lines|src/lib/workout|src/lib/programs|src/lib/storage|src/components/workout/SetCell)"
```

Note coverage % for: `sessionState.ts`, `programGrid.ts`, `overrides.ts`, `logRepo.ts`, `SetCell.tsx`.
