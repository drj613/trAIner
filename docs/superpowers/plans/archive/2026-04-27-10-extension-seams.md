# Extension Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create deliberate extension points for future analytics and derived-data systems without implementing those systems: (1) a `WorkoutEvent` type emitted by the Today screen on every log save, (2) an `analyticsSeam` hook that receives events but does nothing by default, and (3) a `metricsRepo` stub that can accumulate derived stats per exercise without breaking existing storage.

**Architecture:** Events flow from `TodayClient` → `analyticsSeam` at save time. `analyticsSeam` is a no-op shim today; future analytics replaces it without touching `TodayClient`. `metricsRepo` wraps a new `metrics` IndexedDB store. No UI changes. No new npm dependencies.

**Tech Stack:** TypeScript, IndexedDB (`idb`), Jest, `fake-indexeddb`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/analytics/events.ts` | `WorkoutEvent` discriminated union type |
| Create | `src/lib/analytics/analyticsSeam.ts` | No-op shim; future analytics replaces body |
| Create | `src/lib/analytics/analyticsSeam.test.ts` | Verifies the seam is callable and type-safe |
| Modify | `src/lib/storage/appDb.ts` | Add `metrics` object store + DB version bump |
| Create | `src/lib/storage/metricsRepo.ts` | CRUD for `ExerciseMetricsDocument` |
| Create | `src/lib/storage/metricsRepo.test.ts` | Storage tests using fake-indexeddb |

---

## Task 1: `WorkoutEvent` type

**Files:**
- Create: `src/lib/analytics/events.ts`

- [ ] **Step 1.1: Implement the event type**

```ts
// src/lib/analytics/events.ts
import type { ID, ISODate } from "@/lib/programs/types";

export type WorkoutSavedEvent = {
  type: "workout_saved";
  programId: ID;
  dayId: ID;
  performedAt: ISODate;
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
};

export type WorkoutEvent = WorkoutSavedEvent;
```

- [ ] **Step 1.2: Build check**

```bash
bun run build 2>&1 | tail -5
```

Expected: clean compile.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/analytics/events.ts
git commit -m "feat(analytics): add WorkoutEvent discriminated union type"
```

---

## Task 2: `analyticsSeam` — no-op shim

**Files:**
- Create: `src/lib/analytics/analyticsSeam.ts`
- Create: `src/lib/analytics/analyticsSeam.test.ts`

- [ ] **Step 2.1: Write test**

```ts
// src/lib/analytics/analyticsSeam.test.ts
import { trackWorkoutEvent } from "./analyticsSeam";
import type { WorkoutSavedEvent } from "./events";

describe("trackWorkoutEvent", () => {
  it("accepts a WorkoutSavedEvent without throwing", async () => {
    const event: WorkoutSavedEvent = {
      type: "workout_saved",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: new Date().toISOString(),
      exerciseCount: 4,
      totalSets: 12,
      completedSets: 10,
    };
    await expect(trackWorkoutEvent(event)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2.2: Run to confirm red**

```bash
bun run test -- analyticsSeam --no-coverage
```

Expected: `Cannot find module './analyticsSeam'`

- [ ] **Step 2.3: Implement the shim**

```ts
// src/lib/analytics/analyticsSeam.ts
import type { WorkoutEvent } from "./events";

/**
 * Seam for future analytics. Today this is a no-op.
 * Replace the body to capture events without modifying callers.
 */
export async function trackWorkoutEvent(_event: WorkoutEvent): Promise<void> {
  // intentionally empty — future analytics replaces this body
}
```

- [ ] **Step 2.4: Run tests green**

```bash
bun run test -- analyticsSeam --no-coverage
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/analytics/analyticsSeam.ts src/lib/analytics/analyticsSeam.test.ts
git commit -m "feat(analytics): add analyticsSeam no-op shim for future event tracking"
```

---

## Task 3: `metricsRepo` — derived stats store

**Files:**
- Modify: `src/lib/storage/appDb.ts`
- Create: `src/lib/storage/metricsRepo.ts`
- Create: `src/lib/storage/metricsRepo.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
// src/lib/storage/metricsRepo.test.ts
import { deleteDB } from "idb";
import { DB_NAME, resetDbConnection } from "./appDb";
import { metricsRepo } from "./metricsRepo";
import type { ExerciseMetricsDocument } from "./metricsRepo";

describe("metricsRepo", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("saves and retrieves metrics for an exercise", async () => {
    const doc: ExerciseMetricsDocument = {
      exerciseId: "pull-up",
      lastPerformedAt: "2026-04-01T10:00:00.000Z",
      totalSessions: 5,
      totalSets: 20,
      recentLoads: [60, 62.5, 65],
    };
    await metricsRepo.save(doc);
    const result = await metricsRepo.get("pull-up");
    expect(result?.totalSessions).toBe(5);
    expect(result?.recentLoads).toEqual([60, 62.5, 65]);
  });

  it("returns undefined for unknown exercise", async () => {
    const result = await metricsRepo.get("ghost-exercise");
    expect(result).toBeUndefined();
  });

  it("overwrites existing metrics on re-save", async () => {
    const first: ExerciseMetricsDocument = {
      exerciseId: "bench-press",
      lastPerformedAt: "2026-03-01T10:00:00.000Z",
      totalSessions: 1,
      totalSets: 3,
      recentLoads: [80],
    };
    const second: ExerciseMetricsDocument = { ...first, totalSessions: 2, totalSets: 6 };
    await metricsRepo.save(first);
    await metricsRepo.save(second);
    const result = await metricsRepo.get("bench-press");
    expect(result?.totalSessions).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run to confirm red**

```bash
bun run test -- metricsRepo --no-coverage
```

Expected: `Cannot find module './metricsRepo'`

- [ ] **Step 3.3: Add `ExerciseMetricsDocument` type and define the `metricsRepo`**

First, create the repo file:

```ts
// src/lib/storage/metricsRepo.ts
import { getDb } from "./appDb";

export type ExerciseMetricsDocument = {
  exerciseId: string;
  lastPerformedAt: string;
  totalSessions: number;
  totalSets: number;
  recentLoads: number[];
};

export const metricsRepo = {
  async get(exerciseId: string): Promise<ExerciseMetricsDocument | undefined> {
    return (await getDb()).get("metrics", exerciseId);
  },

  async save(doc: ExerciseMetricsDocument): Promise<void> {
    await (await getDb()).put("metrics", doc);
  },

  async list(): Promise<ExerciseMetricsDocument[]> {
    return (await getDb()).getAll("metrics");
  },
};
```

- [ ] **Step 3.4: Add `metrics` store to `appDb.ts`**

In `src/lib/storage/appDb.ts`:

Add `metrics` to the `TrainerDb` interface:

```ts
  metrics: {
    key: string;
    value: ExerciseMetricsDocument;
  };
```

Add the import:

```ts
import type { ExerciseMetricsDocument } from "./metricsRepo";
```

Bump the DB version and add the store creation in the `upgrade` callback:

```ts
// Change:
export const DB_VERSION = 1;
// To:
export const DB_VERSION = 2;

// In the upgrade function, add:
        if (!db.objectStoreNames.contains("metrics")) {
          db.createObjectStore("metrics", { keyPath: "exerciseId" });
        }
```

- [ ] **Step 3.5: Run tests green**

```bash
bun run test -- metricsRepo --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3.6: Run full test suite to verify no regressions**

```bash
bun run test --no-coverage 2>&1 | tail -15
```

Expected: all suites pass. The DB version bump is transparent to `fake-indexeddb` in tests.

- [ ] **Step 3.7: Commit**

```bash
git add src/lib/storage/appDb.ts src/lib/storage/metricsRepo.ts src/lib/storage/metricsRepo.test.ts
git commit -m "feat(storage): add metricsRepo and metrics IndexedDB store for future analytics"
```

---

## Task 4: Wire `trackWorkoutEvent` into the log-save path

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

> Skip this task if Plan 01 (live logging persistence) has not yet been executed — `finishWorkout` only exists after Plan 01. If Plan 01 has run, the `finishWorkout` function exists and can be updated.

- [ ] **Step 4.1: Check if `finishWorkout` exists in `TodayClient.tsx`**

```bash
grep -n "finishWorkout" src/components/workout/TodayClient.tsx
```

If not found, skip to Task 5.

- [ ] **Step 4.2: Add import in `TodayClient.tsx`**

```ts
import { trackWorkoutEvent } from "@/lib/analytics/analyticsSeam";
import { classifyCell } from "./SetCell";
```

- [ ] **Step 4.3: Call `trackWorkoutEvent` at the end of `finishWorkout`**

```tsx
// In finishWorkout, after logRepo.save(...):
  const allCells = Object.values(cells).flat();
  const totalSets = allCells.length;
  const completedSets = allCells.filter((v) => classifyCell(v) !== "empty").length;
  const exerciseCount = Object.keys(cells).length;

  await trackWorkoutEvent({
    type: "workout_saved",
    programId: program.id,
    dayId: day.id,
    performedAt: new Date().toISOString(),
    exerciseCount,
    totalSets,
    completedSets,
  });
```

- [ ] **Step 4.4: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 4.5: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "feat(today): emit WorkoutSavedEvent through analyticsSeam on log save"
```

---

## Task 5: Final verification

- [ ] **Step 5.1: Full test suite**

```bash
bun run test --no-coverage 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 5.2: Build**

```bash
bun run build 2>&1 | tail -6
```

Expected: clean compile.

- [ ] **Step 5.3: Verify seam interface is clean**

```bash
cat src/lib/analytics/analyticsSeam.ts
```

The body should be a single comment and `return;` (or empty). No external API calls, no storage writes — the shim must remain a no-op until an implementor replaces it.
