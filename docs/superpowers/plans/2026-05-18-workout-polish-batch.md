# Workout Polish Batch Implementation Plan

> **Shipped 2026-05; retained as a historical record.** ⚠️ Some "current-state", file-path, or DB-version references below are now outdated: `appDb.ts` is now at DB_VERSION=7 (this plan describes the v3→v4 bodyweight migration); `WorkoutLogEntry.notes` now EXISTS in `src/lib/programs/types.ts`; and the workout logic these tasks direct at `TodayClient.tsx` has since moved to `WorkoutDayClient.tsx` (2026-05-22 navigation refactor). See current code for the present state.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship eight polish improvements to the workout flow: clearer supersets on the routine view, auto-save during a workout, editable session notes, in-place exercise editing on Today, Android keyboard fix in the catalogue sheets, verified routine-day progression, bodyweight tracking with a profile trend, and a rest timer driven by exercise notes.

**Architecture:** Each task is independently shippable. Changes concentrate in `src/components/workout/TodayClient.tsx` and `src/components/workout/ProgramDetailClient.tsx`, with two new lib modules (`dayResolver`, `parseDuration`), one new repo (`bodyweightRepo`), one shared hook (`useVisualViewport`), and one extracted component (`GroupRail`). All persistence stays in IndexedDB (`appDb.ts` bumps from v3 → v4 with an additive migration). The backup schema gains an optional `bodyweight` array following the `userExercises` precedent.

**Tech Stack:** React 19, React Router v6, TypeScript, Vite, Jest + React Testing Library, `lucide-react` icons, `idb` for IndexedDB, CSS custom properties for theming. The app must stay static-deployable on GitHub Pages — no server.

---

## Key decisions (stated upfront so tasks don't leave them open)

- **Edit-exercise persistence (Task 6):** Today's prescription edits save as a **day-scoped override** (`scope: "day"`) — simpler UX than the routine view's scope picker, fits the "I'm changing what I do today" mental model, and the override engine already handles day scope.
- **Routine progression (Task 2):** Re-scoped from "new feature" to "extract + test". Pull the inline day-resolution logic out of `TodayClient.tsx:593-633` into `src/lib/workout/dayResolver.ts` and cover it with unit tests for first-time-user, second-day, week-boundary, and rest-day cases.
- **Bodyweight unit (Task 7):** Each entry stores both `value` (number) and `unit` (`"kg" | "lb"`). Default unit on first entry is `"kg"`, persisted in `profile.body.weight` as a unit hint if not already present. User can toggle per entry.
- **Auto-save (Task 4):** Debounce 1500ms after the last cell edit. Reuse the same log id across saves via a `useRef` — never mint a fresh `crypto.randomUUID()` per tick, that would create duplicate logs.
- **Workout note vs prescribed note (Task 5):** Add `notes?: string` to `WorkoutLogEntry` (does not exist today). Render prescribed `exercise.notes` read-only in muted style; render `entry.notes` as an editable textarea below the cells.
- **Keyboard fix (Task 3):** Shared `useVisualViewport` hook reads `window.visualViewport.height` and exposes a max-height clamp; both `ExerciseReplaceSheet` and `ExercisePickerSheet` consume it. Falls back to `100dvh` when `visualViewport` is unavailable.
- **Supersets (Task 1):** Extract `GroupRail` from `TodayClient.tsx:29-79` into a shared component used by both Today and the routine view's `DayCard`.

---

## File Map

| File | What changes |
|---|---|
| `src/components/workout/GroupRail.tsx` | **Create** — extract from `TodayClient.tsx`, shared by Today and routine view |
| `src/components/workout/GroupRail.test.tsx` | **Create** — unit tests for label and rail rendering |
| `src/components/workout/TodayClient.tsx` | Import shared `GroupRail`; add auto-save, session notes textarea, inline edit sheet, BW widget, timer integration; consume `dayResolver` |
| `src/components/workout/TodayClient.test.tsx` | Add tests for auto-save, notes round-trip, edit-prescription override, BW widget, timer integration |
| `src/components/workout/ProgramDetailClient.tsx` | Wrap exercise rows in `GroupRail` inside `DayCard`; render group notes |
| `src/components/workout/ProgramDetailClient.test.tsx` | Add tests verifying superset/circuit labels appear in routine view |
| `src/lib/workout/dayResolver.ts` | **Create** — extracted resolution logic (first-time, advance-from-last-log, fallback) |
| `src/lib/workout/dayResolver.test.ts` | **Create** — unit tests for progression scenarios |
| `src/lib/workout/useDebouncedAutoSave.ts` | **Create** — generic debounced auto-save hook |
| `src/lib/workout/useDebouncedAutoSave.test.ts` | **Create** — fake-timers tests |
| `src/lib/programs/types.ts` | Add `notes?: string` to `WorkoutLogEntry`; add `BodyweightEntry`; extend `BackupDocument` with optional `bodyweight` |
| `src/lib/workout/sessionState.ts` | Round-trip `entry.notes` through serialise/hydrate (in addition to sets) |
| `src/lib/workout/sessionState.test.ts` | Add tests for notes round-trip |
| `src/components/workout/ExerciseEditSheet.tsx` | **Create** — sheet to edit sets/reps/load/rest/notes of a single exercise |
| `src/components/workout/ExerciseEditSheet.test.tsx` | **Create** — interaction tests |
| `src/lib/ui/useVisualViewport.ts` | **Create** — hook returning current visual-viewport height + ready flag |
| `src/lib/ui/useVisualViewport.test.ts` | **Create** — JSDOM mock of `window.visualViewport` |
| `src/components/workout/ExerciseReplaceSheet.tsx` | Use `useVisualViewport` to clamp sheet max-height |
| `src/components/workout/ExercisePickerSheet.tsx` | Use `useVisualViewport` to clamp sheet max-height |
| `src/lib/storage/appDb.ts` | DB version 3 → 4: add `bodyweight` object store |
| `src/lib/storage/appDb.test.ts` | Add v4 upgrade test |
| `src/lib/storage/bodyweightRepo.ts` | **Create** — `list`, `save`, `remove` repo for bodyweight entries |
| `src/lib/storage/bodyweightRepo.test.ts` | **Create** — repo tests |
| `src/lib/backup/backup.ts` | Include `bodyweight` in export and restore (optional) |
| `src/lib/backup/backup.test.ts` | Test bodyweight round-trip + backwards compat with old backups |
| `src/components/workout/BodyweightWidget.tsx` | **Create** — small "log BW" widget on Today |
| `src/components/workout/BodyweightWidget.test.tsx` | **Create** — interaction tests |
| `src/components/profile/BodyweightSparkline.tsx` | **Create** — SVG sparkline of recent weights |
| `src/components/profile/BodyweightSparkline.test.tsx` | **Create** — render tests |
| `src/components/profile/ProfileClient.tsx` | Mount `BodyweightSparkline` above Body card |
| `src/lib/workout/parseDuration.ts` | **Create** — regex parser for time specs (e.g. `60s`, `1:30`, `45-60s`) |
| `src/lib/workout/parseDuration.test.ts` | **Create** — exhaustive parser tests |
| `src/components/workout/RestTimer.tsx` | **Create** — countdown component with manual override |
| `src/components/workout/RestTimer.test.tsx` | **Create** — countdown + start/pause/reset tests |

---

## Task 1: Extract `GroupRail` and Apply It on the Routine View

**Files:**
- Create: `src/components/workout/GroupRail.tsx`
- Create: `src/components/workout/GroupRail.test.tsx`
- Modify: `src/components/workout/TodayClient.tsx` (replace inline component)
- Modify: `src/components/workout/ProgramDetailClient.tsx` (use it inside `DayCard`)
- Modify: `src/components/workout/ProgramDetailClient.test.tsx`

The Today screen already renders superset/circuit/giant-set labels with a vertical bracket via the inline `GroupRail` (TodayClient.tsx:29-79). The routine view (`ProgramDetailClient` `DayCard`) flattens all exercises in a section into a single list (`section.groups.flatMap(...)`), losing the grouping. Extract `GroupRail` into a reusable component and wrap each `group.exercises.map(...)` inside `DayCard` with it. Also display `group.notes` when present.

- [ ] **Step 1: Write the failing test for `GroupRail`**

Create `src/components/workout/GroupRail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { GroupRail } from "./GroupRail";

describe("GroupRail", () => {
  it("renders children without label for single-type group", () => {
    render(
      <GroupRail type="single">
        <span>Exercise A</span>
      </GroupRail>
    );
    expect(screen.getByText("Exercise A")).toBeInTheDocument();
    expect(screen.queryByText(/SUPERSET|CIRCUIT|GIANT SET/i)).toBeNull();
  });

  it("renders SUPERSET label for superset group", () => {
    render(<GroupRail type="superset"><span>A</span></GroupRail>);
    expect(screen.getByText("SUPERSET")).toBeInTheDocument();
  });

  it("renders CIRCUIT label for circuit group", () => {
    render(<GroupRail type="circuit"><span>A</span></GroupRail>);
    expect(screen.getByText("CIRCUIT")).toBeInTheDocument();
  });

  it("renders GIANT SET label for giant-set group", () => {
    render(<GroupRail type="giant-set"><span>A</span></GroupRail>);
    expect(screen.getByText("GIANT SET")).toBeInTheDocument();
  });

  it("appends notes text to the label when notes provided", () => {
    render(<GroupRail type="superset" notes="rest 90s"><span>A</span></GroupRail>);
    expect(screen.getByText(/SUPERSET · rest 90s/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/components/workout/GroupRail.test.tsx`
Expected: FAIL with module-not-found for `./GroupRail`.

- [ ] **Step 3: Create the shared `GroupRail` component**

Create `src/components/workout/GroupRail.tsx`:

```tsx
import type { ProgramGroup } from "@/lib/programs/types";

type Props = {
  type: ProgramGroup["type"];
  notes?: string;
  /** Optional density: "compact" for the routine view, "default" for Today. */
  density?: "default" | "compact";
  children: React.ReactNode;
};

const LABELS: Record<Exclude<ProgramGroup["type"], "single">, string> = {
  superset: "SUPERSET",
  circuit: "CIRCUIT",
  "giant-set": "GIANT SET",
};

export function GroupRail({ type, notes, density = "default", children }: Props) {
  if (type === "single") return <div>{children}</div>;
  const label = LABELS[type];
  const railLeft = density === "compact" ? 10 : 14;
  const labelPadTop = density === "compact" ? 2 : 4;
  return (
    <div style={{ position: "relative", paddingLeft: railLeft, paddingTop: labelPadTop }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: density === "compact" ? 9 : 9.5,
          letterSpacing: "0.14em",
          color: "var(--fg-3)",
          textTransform: "uppercase",
          padding: density === "compact" ? "4px 10px 2px" : "6px 10px 4px",
        }}
      >
        <span style={{ width: 8, height: 1, background: "var(--line-2)" }} />
        <span>{label}{notes ? ` · ${notes}` : ""}</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: density === "compact" ? 4 : 6,
          top: density === "compact" ? 18 : 26,
          bottom: 8,
          width: 2,
          background: "var(--line-2)",
          borderRadius: 1,
        }}
      />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun jest src/components/workout/GroupRail.test.tsx`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Replace the inline `GroupRail` in `TodayClient.tsx`**

Open `src/components/workout/TodayClient.tsx`. Delete the local `GroupRail` function (lines 29-79). Add an import near the top:

```tsx
import { GroupRail } from "./GroupRail";
```

Update the call site inside `SectionCard` (around line 256). The current code passes `type` and `children` only. Replace with:

```tsx
{section.groups.map((group) => (
  <GroupRail key={group.id} type={group.type} notes={group.notes}>
    {group.exercises.map((ex) => (
      <ExerciseRow
        key={ex.id}
        exercise={ex}
        cells={cells[ex.id] ?? [""]}
        onCellChange={(i, v) => onCellChange(ex.id, i, v)}
        onAddSet={() => onAddSet(ex.id)}
        onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
        onReplaceExercise={() => onReplaceExercise(ex.id)}
      />
    ))}
  </GroupRail>
))}
```

- [ ] **Step 6: Write the failing test for `ProgramDetailClient` group rendering**

Open `src/components/workout/ProgramDetailClient.test.tsx`. Add a new test inside the existing `describe` block (or add a new one):

```tsx
it("renders SUPERSET label inside an expanded day card", async () => {
  const user = userEvent.setup();
  programRepo.get = jest.fn().mockResolvedValue({
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
  // Wait for load and expand the day card
  const header = await screen.findByText("Push");
  await user.click(header);
  expect(await screen.findByText(/SUPERSET · rest 90s/)).toBeInTheDocument();
});
```

If `ProgramDetailClient.test.tsx` does not currently import `programRepo` and `userEvent`, add those imports at the top:

```tsx
import userEvent from "@testing-library/user-event";
import { programRepo } from "@/lib/storage/programRepo";
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `bun jest src/components/workout/ProgramDetailClient.test.tsx`
Expected: FAIL because no SUPERSET label is currently rendered.

- [ ] **Step 8: Wrap exercise rows inside `DayCard` with `GroupRail`**

Open `src/components/workout/ProgramDetailClient.tsx`. Add an import:

```tsx
import { GroupRail } from "./GroupRail";
```

In the expanded body of `DayCard` (around line 332), replace the `section.groups.flatMap(...)` block with:

```tsx
{day.sections.map((section, si) => (
  <div key={section.id}>
    <SectionHeader section={section} />
    {section.groups.map((group, gi) => (
      <GroupRail
        key={group.id}
        type={group.type}
        notes={group.notes}
        density="compact"
      >
        {group.exercises.map((ex, ei) => (
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
        ))}
      </GroupRail>
    ))}
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
```

- [ ] **Step 9: Run both touched test files**

Run: `bun jest src/components/workout/GroupRail.test.tsx src/components/workout/ProgramDetailClient.test.tsx src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/workout/GroupRail.tsx src/components/workout/GroupRail.test.tsx \
        src/components/workout/TodayClient.tsx \
        src/components/workout/ProgramDetailClient.tsx \
        src/components/workout/ProgramDetailClient.test.tsx
git commit -m "feat(workout): show supersets and circuits in routine view"
```

---

## Task 2: Extract `dayResolver` and Verify Routine Progression

**Files:**
- Create: `src/lib/workout/dayResolver.ts`
- Create: `src/lib/workout/dayResolver.test.ts`
- Modify: `src/components/workout/TodayClient.tsx` (consume the extracted resolver)

The day-selection logic at `TodayClient.tsx:593-633` decides which day to show on Today. It works for first-time users (returns `days[0]`), and finds the most-recent log to advance to the next day. The user has only finished day 1 once and isn't confident the progression handles week boundaries, rest days, or missing days. Extract the logic and unit-test these cases.

- [ ] **Step 1: Write the failing test for the resolver**

Create `src/lib/workout/dayResolver.test.ts`:

```ts
import { resolveNextDay } from "./dayResolver";
import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

function day(id: string, dayNumber: number, weekNumber?: number): ProgramDay {
  return { id, dayNumber, weekNumber, title: `Day ${dayNumber}`, sections: [] };
}

function log(dayId: string, performedAt: string): WorkoutLogDocument {
  return { id: `log-${dayId}`, programId: "p1", dayId, performedAt, entries: [] };
}

describe("resolveNextDay", () => {
  const days = [day("d1", 1, 1), day("d2", 2, 1), day("d3", 3, 1), day("d4", 1, 2)];

  it("returns undefined when there are no days", () => {
    expect(resolveNextDay([], [], "2026-05-18")).toBeUndefined();
  });

  it("returns days[0] for a first-time user (no logs)", () => {
    expect(resolveNextDay(days, [], "2026-05-18")?.id).toBe("d1");
  });

  it("returns the day with a log dated today (resume in-progress)", () => {
    const logs = [log("d2", "2026-05-18T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("advances to the next day after the most recent log", () => {
    const logs = [log("d1", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("crosses week boundaries (d3 → d4)", () => {
    const logs = [log("d3", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d4");
  });

  it("wraps from last day back to first", () => {
    const logs = [log("d4", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("ignores logs whose dayId no longer exists in the program", () => {
    const logs = [
      log("removed-day", "2026-05-17T10:00:00.000Z"),
      log("d2", "2026-05-16T09:00:00.000Z"),
    ];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d3");
  });

  it("starts at days[0] when every prior log references a removed day", () => {
    const logs = [log("removed-day", "2026-05-17T10:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("treats today's log on a removed day as 'start at days[0]'", () => {
    const logs = [log("removed-day", "2026-05-18T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/lib/workout/dayResolver.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create `dayResolver.ts` with the extracted logic**

Create `src/lib/workout/dayResolver.ts`:

```ts
import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

/**
 * Choose which day to render on Today.
 *
 *  - If a log was performed on `todayDate`, resume that day.
 *  - Otherwise advance to the day immediately after the most recent valid log.
 *  - Skip logs whose dayId no longer exists in `days` (handles days removed
 *    from the program after a log was written).
 *  - First-time / unresolved → `days[0]`.
 *  - `todayDate` is the local YYYY-MM-DD string used to detect "today".
 */
export function resolveNextDay(
  days: ProgramDay[],
  logs: WorkoutLogDocument[],
  todayDate: string,
): ProgramDay | undefined {
  if (days.length === 0) return undefined;

  const dayIds = new Set(days.map((d) => d.id));

  const todayLog = logs.find(
    (l) => l.performedAt.slice(0, 10) === todayDate && dayIds.has(l.dayId),
  );
  if (todayLog) {
    return days.find((d) => d.id === todayLog.dayId) ?? days[0];
  }

  const sortedLogs = [...logs].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const validLog = sortedLogs.find((log) => dayIds.has(log.dayId));
  if (validLog) {
    const idx = days.findIndex((d) => d.id === validLog.dayId);
    return days[(idx + 1) % days.length];
  }

  return days[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun jest src/lib/workout/dayResolver.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Replace inline logic in `TodayClient.tsx`**

Open `src/components/workout/TodayClient.tsx`. Add an import near the top:

```tsx
import { resolveNextDay } from "@/lib/workout/dayResolver";
```

Replace the inline resolution inside the `useEffect` (currently lines ~593-633). The new effect body becomes:

```tsx
logRepo
  .listForProgram(activeProgram.id)
  .then((logs) => {
    if (cancelled) return;
    const today = localDateString();
    setResolvedDay(resolveNextDay(days, logs, today));
    setDayResolving(false);
  })
  .catch((e) => {
    if (cancelled) return;
    console.error("[TodayClient] day resolution failed", e);
    setResolvedDay(days[0]);
    setDayResolving(false);
  });
```

- [ ] **Step 6: Run all touched tests**

Run: `bun jest src/lib/workout/dayResolver.test.ts src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workout/dayResolver.ts src/lib/workout/dayResolver.test.ts \
        src/components/workout/TodayClient.tsx
git commit -m "refactor(workout): extract dayResolver and cover progression scenarios"
```

---

## Task 3: Catalog Keyboard Fix via Shared `useVisualViewport`

**Files:**
- Create: `src/lib/ui/useVisualViewport.ts`
- Create: `src/lib/ui/useVisualViewport.test.ts`
- Modify: `src/components/workout/ExerciseReplaceSheet.tsx`
- Modify: `src/components/workout/ExercisePickerSheet.tsx`

On Android Chrome, the soft keyboard shrinks the visual viewport but the sheet's `max-height: 70vh` references the layout viewport. When the search results are few, the list slides under the keyboard and becomes unreachable. Build a `useVisualViewport` hook that reads `window.visualViewport.height` (and updates on `resize`), and use it to clamp each sheet's max-height.

- [ ] **Step 1: Write the failing hook test**

Create `src/lib/ui/useVisualViewport.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { useVisualViewport } from "./useVisualViewport";

describe("useVisualViewport", () => {
  let listeners: Record<string, ((e: Event) => void)[]>;
  let originalVV: VisualViewport | undefined;

  beforeEach(() => {
    listeners = {};
    originalVV = window.visualViewport ?? undefined;
    const mockVV = {
      height: 800,
      addEventListener: (type: string, cb: (e: Event) => void) => {
        (listeners[type] ||= []).push(cb);
      },
      removeEventListener: (type: string, cb: (e: Event) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== cb);
      },
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: mockVV,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVV,
    });
  });

  it("returns the initial viewport height", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.height).toBe(800);
    expect(result.current.ready).toBe(true);
  });

  it("updates when the resize event fires", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => {
      (window.visualViewport as unknown as { height: number }).height = 400;
      listeners["resize"]?.forEach((fn) => fn(new Event("resize")));
    });
    expect(result.current.height).toBe(400);
  });

  it("returns ready=false and a falsy height when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.ready).toBe(false);
    expect(result.current.height).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/lib/ui/useVisualViewport.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the hook**

Create `src/lib/ui/useVisualViewport.ts`:

```ts
import { useEffect, useState } from "react";

export type VisualViewportState = {
  /** Current visualViewport.height — undefined if the API is unavailable. */
  height: number | undefined;
  /** True once the hook has read from the API at least once. */
  ready: boolean;
};

/**
 * Tracks the height of `window.visualViewport`. Updates on resize.
 * Returns `ready: false` on SSR or in browsers without the VisualViewport API,
 * so callers can fall back to `100dvh` or similar.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    return vv ? { height: vv.height, ready: true } : { height: undefined, ready: false };
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setState({ height: vv!.height, ready: true });
    }
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun jest src/lib/ui/useVisualViewport.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Wire `useVisualViewport` into `ExerciseReplaceSheet`**

Open `src/components/workout/ExerciseReplaceSheet.tsx`. Add the import:

```tsx
import { useVisualViewport } from "@/lib/ui/useVisualViewport";
```

Inside the component, after the existing `useState` calls, read the viewport:

```tsx
const { height: vvHeight, ready: vvReady } = useVisualViewport();
const sheetMaxHeight = vvReady && vvHeight !== undefined
  ? Math.min(vvHeight - 8, vvHeight * 0.92)
  : undefined;
```

Replace the existing sheet inline style. Find the outer panel `<div>` that opens with `className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"`. Update its style prop from:

```tsx
style={{
  maxHeight: "70vh",
  background: "var(--bg-1)",
  borderTop: "1px solid var(--line)",
  borderRadius: "12px 12px 0 0",
}}
```

to:

```tsx
style={{
  maxHeight: sheetMaxHeight ?? "70dvh",
  background: "var(--bg-1)",
  borderTop: "1px solid var(--line)",
  borderRadius: "12px 12px 0 0",
}}
```

- [ ] **Step 6: Wire the same fix into `ExercisePickerSheet`**

Open `src/components/workout/ExercisePickerSheet.tsx`. Apply the identical pattern: import the hook, read `vvHeight`/`vvReady`, compute `sheetMaxHeight`, replace `maxHeight: "70vh"` (or whichever value is currently set) with the same fallback expression.

If the picker sheet has its own outer panel style block matching the same shape, mirror the change exactly.

- [ ] **Step 7: Run the sheet tests**

Run: `bun jest src/components/workout/ExerciseReplaceSheet src/components/workout/ExercisePickerSheet src/lib/ui/useVisualViewport`
Expected: All PASS. (If there are no existing tests for the sheets, only the hook test runs.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/useVisualViewport.ts src/lib/ui/useVisualViewport.test.ts \
        src/components/workout/ExerciseReplaceSheet.tsx \
        src/components/workout/ExercisePickerSheet.tsx
git commit -m "fix(workout): keep exercise sheets above the soft keyboard"
```

---

## Task 4: Auto-Save While Workout in Progress

**Files:**
- Create: `src/lib/workout/useDebouncedAutoSave.ts`
- Create: `src/lib/workout/useDebouncedAutoSave.test.ts`
- Modify: `src/components/workout/TodayClient.tsx`
- Modify: `src/components/workout/TodayClient.test.tsx`

Currently `finishWorkout` only runs on the manual "Finish" button. Add a 1500ms debounced auto-save that fires whenever cells change, holds the same log id across saves (via `useRef`), and shows a small status indicator near the Finish button: "Saving…" / "Saved" / "Save failed — retry".

- [ ] **Step 1: Write the failing hook test**

Create `src/lib/workout/useDebouncedAutoSave.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { useDebouncedAutoSave } from "./useDebouncedAutoSave";

jest.useFakeTimers();

describe("useDebouncedAutoSave", () => {
  it("does not call the save function before the delay elapses", () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { jest.advanceTimersByTime(999); });
    expect(save).not.toHaveBeenCalled();
  });

  it("calls save with the latest value after the delay", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledWith("b");
  });

  it("debounces rapid changes into a single save", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { jest.advanceTimersByTime(500); });
    rerender({ v: "c" });
    act(() => { jest.advanceTimersByTime(500); });
    rerender({ v: "d" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("d");
  });

  it("exposes the save status to consumers (idle | saving | saved | error)", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedAutoSave(v, save, 1000),
      { initialProps: { v: "a" } }
    );
    expect(result.current.status).toBe("idle");
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(result.current.status).toBe("saved");
  });

  it("reports error status when save throws", async () => {
    const save = jest.fn().mockRejectedValue(new Error("nope"));
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedAutoSave(v, save, 1000),
      { initialProps: { v: "a" } }
    );
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(result.current.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/lib/workout/useDebouncedAutoSave.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the hook**

Create `src/lib/workout/useDebouncedAutoSave.ts`:

```ts
import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export type UseDebouncedAutoSaveResult = {
  status: AutoSaveStatus;
  /** Force-flush the pending save (e.g. before unmount). */
  flush: () => Promise<void>;
};

/**
 * Run `save(value)` `delayMs` after `value` last changes.
 * Holds onto the original save reference per render via a ref so changing the
 * callback identity does not re-arm the timer.
 */
export function useDebouncedAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs: number,
): UseDebouncedAutoSaveResult {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const saveRef = useRef(save);
  saveRef.current = save;
  const firstRunRef = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doSave() {
    setStatus("saving");
    try {
      await saveRef.current(valueRef.current);
      setStatus("saved");
    } catch (e) {
      console.error("[autoSave] save failed", e);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void doSave(); }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }

  return { status, flush };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun jest src/lib/workout/useDebouncedAutoSave.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Wire auto-save into `TodayClient`**

Open `src/components/workout/TodayClient.tsx`. Inside `TodayWorkout`, after the `cells` state declaration, add a ref to hold the log id across saves:

```tsx
const logIdRef = useRef<string | null>(null);
```

Extract the save logic into a shared `saveCells` function used by both the auto-save hook and the manual Finish button. The current `finishWorkout` reads `existing?.id ?? crypto.randomUUID()` from disk on every call — keep that behavior on the first save, but cache the id in the ref so subsequent saves reuse it (never mint a new uuid per tick or you'll create duplicate logs):

```tsx
async function saveCells(currentCells: CellMap) {
  const today = localDateString();
  if (!logIdRef.current) {
    const existing = await logRepo.getForDay(program.id, day.id, today);
    logIdRef.current = existing?.id ?? crypto.randomUUID();
  }
  const exerciseNameMap = new Map<string, string>();
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        exerciseNameMap.set(ex.id, ex.name);
      }
    }
  }
  const entries = Object.entries(currentCells).map(([exerciseId, vals]) => ({
    exerciseId,
    exerciseName: exerciseNameMap.get(exerciseId),
    sets: serialiseSets(vals),
  }));
  await logRepo.save({
    id: logIdRef.current,
    programId: program.id,
    dayId: day.id,
    performedAt: new Date().toISOString(),
    entries,
  });
}

const { status: autoSaveStatus } = useDebouncedAutoSave(cells, saveCells, 1500);

async function finishWorkout() {
  if (saving.current) return;
  saving.current = true;
  setSaveError(null);
  try {
    await saveCells(cells);
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  } catch (e) {
    console.error("[finishWorkout] save failed", e);
    setSaveError("Failed to save workout. Please try again.");
  } finally {
    saving.current = false;
  }
}
```

Add the import at the top:

```tsx
import { useDebouncedAutoSave } from "@/lib/workout/useDebouncedAutoSave";
```

Remove the now-unused inline name-map and entry-serialisation code that used to live inside `finishWorkout` (those moved into `saveCells`).

- [ ] **Step 6: Add auto-save indicator to the `WorkoutProgress` footer**

Inside `WorkoutProgress` in the same file, accept a new `autoSaveStatus` prop and render a small dot before the counter. Update the component signature:

```tsx
function WorkoutProgress({
  cells,
  onFinish,
  saved,
  autoSaveStatus,
}: {
  cells: CellMap;
  onFinish: () => void;
  saved: boolean;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
}) {
```

Inside the footer row, before the counter span, insert:

```tsx
<span
  role="status"
  aria-live="polite"
  style={{
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color:
      autoSaveStatus === "error"
        ? "var(--bad)"
        : autoSaveStatus === "saving"
        ? "var(--fg-3)"
        : autoSaveStatus === "saved"
        ? "var(--good)"
        : "var(--fg-4)",
  }}
>
  {autoSaveStatus === "saving" && "saving…"}
  {autoSaveStatus === "saved" && "saved"}
  {autoSaveStatus === "error" && "save failed"}
  {autoSaveStatus === "idle" && ""}
</span>
```

In the `TodayWorkout` JSX at the bottom, pass the new prop:

```tsx
<WorkoutProgress cells={cells} onFinish={finishWorkout} saved={saved} autoSaveStatus={autoSaveStatus} />
```

- [ ] **Step 7: Add a `TodayClient` auto-save test**

Open `src/components/workout/TodayClient.test.tsx`. Add a new test (keep the existing mocks but add `logRepo.save` to the jest.mock):

```tsx
const saveMock = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    listForProgram: jest.fn().mockResolvedValue([]),
    getForDay: jest.fn().mockResolvedValue(null),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));

it("auto-saves cells after debounce delay", async () => {
  jest.useFakeTimers();
  mockProfile = {
    id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
    trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
  };
  mockPrograms = [program as unknown as ProfileDocument];
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<MemoryRouter><TodayClient /></MemoryRouter>);
  const cells = await screen.findAllByRole("textbox");
  await user.type(cells[0], "60x10");
  // SetCell commits onBlur (see SetCell.tsx) — tab away to flush the onChange.
  await user.tab();
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(saveMock).toHaveBeenCalledTimes(1);
  expect(saveMock.mock.calls[0][0].entries[0].sets[0]).toEqual({
    setNumber: 1, weight: 60, reps: 10,
  });
  jest.useRealTimers();
});
```

Add the missing imports:

```tsx
import userEvent from "@testing-library/user-event";
import { act } from "@testing-library/react";
```

- [ ] **Step 8: Run all touched tests**

Run: `bun jest src/lib/workout/useDebouncedAutoSave src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/workout/useDebouncedAutoSave.ts src/lib/workout/useDebouncedAutoSave.test.ts \
        src/components/workout/TodayClient.tsx \
        src/components/workout/TodayClient.test.tsx
git commit -m "feat(workout): auto-save in-progress workouts every 1.5s"
```

---

## Task 5: Editable Free-Text Note Field (Session vs Prescribed)

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/workout/sessionState.ts`
- Modify: `src/lib/workout/sessionState.test.ts`
- Modify: `src/components/workout/TodayClient.tsx`
- Modify: `src/components/workout/TodayClient.test.tsx`

`WorkoutLogEntry` has no `notes` field yet. Prescribed notes (`exercise.notes`) already render in muted style at TodayClient.tsx:148. Add a per-exercise editable textarea ("note") whose value persists on `WorkoutLogEntry.notes`, hydrates back from the log, and round-trips through `serialiseSets`/`hydrateFromLog` (or paired note helpers). Display the editable note visually distinct from the prescribed one.

- [ ] **Step 1: Extend `WorkoutLogEntry` with a `notes` field**

Open `src/lib/programs/types.ts`. In the `WorkoutLogEntry` definition, add `notes?: string`:

```ts
export type WorkoutLogEntry = {
  exerciseId: ID;
  exerciseName?: string;
  canonicalExerciseId?: ID;
  sets: WorkoutSetLog[];
  notes?: string;
};
```

- [ ] **Step 2: Write the failing test for notes helpers**

Open `src/lib/workout/sessionState.test.ts`. Append a new describe block:

```ts
import { extractEntryNotes, applyEntryNotes } from "./sessionState";

describe("extractEntryNotes / applyEntryNotes", () => {
  it("extractEntryNotes returns the notes string from a log entry", () => {
    const entry = {
      exerciseId: "e1",
      sets: [],
      notes: "felt strong today",
    };
    expect(extractEntryNotes(entry)).toBe("felt strong today");
  });

  it("extractEntryNotes returns empty string when entry has no notes", () => {
    expect(extractEntryNotes({ exerciseId: "e1", sets: [] })).toBe("");
  });

  it("applyEntryNotes writes notes onto an entry", () => {
    const entry = { exerciseId: "e1", sets: [] };
    expect(applyEntryNotes(entry, "ouch right shoulder")).toEqual({
      exerciseId: "e1",
      sets: [],
      notes: "ouch right shoulder",
    });
  });

  it("applyEntryNotes drops the field for empty strings", () => {
    const entry = { exerciseId: "e1", sets: [], notes: "stale" };
    expect(applyEntryNotes(entry, "")).toEqual({ exerciseId: "e1", sets: [] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun jest src/lib/workout/sessionState.test.ts`
Expected: FAIL because `extractEntryNotes` / `applyEntryNotes` are not exported.

- [ ] **Step 4: Implement the helpers**

Open `src/lib/workout/sessionState.ts`. Append:

```ts
export function extractEntryNotes(entry: { notes?: string }): string {
  return entry.notes ?? "";
}

export function applyEntryNotes<T extends { notes?: string }>(entry: T, notes: string): T {
  if (!notes.trim()) {
    const { notes: _drop, ...rest } = entry;
    return rest as T;
  }
  return { ...entry, notes };
}
```

- [ ] **Step 5: Run the helpers tests**

Run: `bun jest src/lib/workout/sessionState.test.ts`
Expected: PASS.

- [ ] **Step 6: Add note state and UI to `ExerciseRow` and `TodayWorkout`**

Open `src/components/workout/TodayClient.tsx`. Add a new state map alongside `cells`:

```tsx
const [notes, setNotes] = useState<Record<string, string>>({});
```

Update the hydration `useEffect` (around line 325) so it also hydrates notes:

```tsx
const hydratedNotes: Record<string, string> = {};
for (const entry of log.entries) {
  hydrated[entry.exerciseId] = hydrateFromLog(entry, prescribedSetsMap.get(entry.exerciseId));
  if (entry.notes) hydratedNotes[entry.exerciseId] = entry.notes;
}
setCells((prev) => ({ ...prev, ...hydrated }));
setNotes((prev) => ({ ...prev, ...hydratedNotes }));
```

In `saveCells` (added in Task 4), enrich each entry with notes:

```tsx
const entries = Object.entries(currentCells).map(([exerciseId, vals]) => {
  const base = {
    exerciseId,
    exerciseName: exerciseNameMap.get(exerciseId),
    sets: serialiseSets(vals),
  };
  return applyEntryNotes(base, notes[exerciseId] ?? "");
});
```

Add the `applyEntryNotes` import:

```tsx
import { serialiseSets, hydrateFromLog, applyEntryNotes } from "@/lib/workout/sessionState";
```

Pass `notes`, `onNotesChange` through `SectionCard` to `ExerciseRow`. Add the prop chain.

In `ExerciseRow`, after the cells grid, render the editable note textarea:

```tsx
<details style={{ marginTop: 6 }}>
  <summary
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--fg-4)",
      cursor: "pointer",
      listStyle: "none",
      userSelect: "none",
    }}
  >
    {note ? "note ▾" : "+ add note"}
  </summary>
  <textarea
    value={note}
    onChange={(e) => onNoteChange(e.target.value)}
    rows={2}
    placeholder="Your note about this set (felt good, ouch, etc.)"
    style={{
      width: "100%",
      marginTop: 4,
      background: "var(--bg-2)",
      color: "var(--fg)",
      border: "1px solid var(--line)",
      borderRadius: 4,
      padding: "4px 6px",
      fontFamily: "inherit",
      fontSize: 12,
      resize: "vertical",
    }}
  />
</details>
```

Also visually distinguish the prescribed note (already at line 148): wrap that label in a "PRESCRIBED" affix so users can tell them apart:

```tsx
{exercise.notes && (
  <div style={{
    fontSize: 11, color: "var(--fg-2)", fontFamily: "var(--font-mono)", marginTop: 3,
  }}>
    <span style={{
      color: "var(--fg-4)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontSize: 9,
      marginRight: 4,
    }}>prescribed</span>
    <span>{exercise.notes}</span>
  </div>
)}
```

Make sure to add `note: string; onNoteChange: (v: string) => void;` to `ExerciseRow`'s prop type, and to `SectionCard`'s. Pass through:

```tsx
note={notes[ex.id] ?? ""}
onNoteChange={(v) => onNoteChange(ex.id, v)}
```

Define `onNoteChange` in `TodayWorkout`:

```tsx
const handleNoteChange = useCallback((exId: string, v: string) => {
  setNotes((prev) => ({ ...prev, [exId]: v }));
}, []);
```

Auto-save key: since auto-save watches `cells`, also include `notes` in the watched value. The simplest change: pass a combined object to `useDebouncedAutoSave`:

```tsx
const autoSavePayload = useMemo(() => ({ cells, notes }), [cells, notes]);

async function saveCells({ cells: c, notes: n }: { cells: CellMap; notes: Record<string, string> }) {
  // ... use c and n above instead of closure-captured cells/notes
}

const { status: autoSaveStatus } = useDebouncedAutoSave(autoSavePayload, saveCells, 1500);
```

Update `finishWorkout` to pass `{ cells, notes }` likewise.

- [ ] **Step 7: Add a `TodayClient` test that round-trips a note**

Open `src/components/workout/TodayClient.test.tsx`. Append:

```tsx
it("persists per-exercise notes in the saved log", async () => {
  jest.useFakeTimers();
  mockProfile = {
    id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
    trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
  };
  mockPrograms = [program as unknown as ProfileDocument];
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<MemoryRouter><TodayClient /></MemoryRouter>);
  await user.click(await screen.findByText(/add note/i));
  await user.type(screen.getByPlaceholderText(/your note about this set/i), "felt strong");
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(saveMock.mock.calls.at(-1)![0].entries[0].notes).toBe("felt strong");
  jest.useRealTimers();
});
```

- [ ] **Step 8: Run all touched tests**

Run: `bun jest src/lib/workout/sessionState src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/programs/types.ts src/lib/workout/sessionState.ts \
        src/lib/workout/sessionState.test.ts \
        src/components/workout/TodayClient.tsx src/components/workout/TodayClient.test.tsx
git commit -m "feat(workout): editable per-exercise notes during workout"
```

---

## Task 6: In-Place Exercise Edit on Today (Sets / Reps / Load / Rest / Notes)

**Files:**
- Create: `src/components/workout/ExerciseEditSheet.tsx`
- Create: `src/components/workout/ExerciseEditSheet.test.tsx`
- Modify: `src/components/workout/TodayClient.tsx`

Today screen lets the user replace an exercise from the catalogue but not edit its prescription. Add a pencil-icon button next to each exercise that opens a small sheet (sets / reps / load / rest / prescribed note). Saving applies the change as a **day-scoped override** on the program (same shape used by `EditClient.tsx:16-33`). The override engine (`overrides.ts:25-29`) preserves the day's `id`/`weekNumber`/`dayNumber`, so the `useEffect` watching `[program.id, day.id]` does not re-fire and in-progress cells are preserved.

- [ ] **Step 1: Write the failing test for `ExerciseEditSheet`**

Create `src/components/workout/ExerciseEditSheet.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExerciseEditSheet } from "./ExerciseEditSheet";

const baseExercise = {
  id: "e1",
  name: "Bench Press",
  sets: 3,
  reps: "8-10",
  load: "70kg",
  rest: "90s",
  notes: "pause 1s at chest",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
};

describe("ExerciseEditSheet", () => {
  it("renders the existing values into inputs", () => {
    render(<ExerciseEditSheet exercise={baseExercise} onSave={() => undefined} onClose={() => undefined} />);
    expect(screen.getByLabelText(/sets/i)).toHaveValue(3);
    expect(screen.getByLabelText(/reps/i)).toHaveValue("8-10");
    expect(screen.getByLabelText(/load/i)).toHaveValue("70kg");
    expect(screen.getByLabelText(/rest/i)).toHaveValue("90s");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("pause 1s at chest");
  });

  it("calls onSave with the edited values", async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<ExerciseEditSheet exercise={baseExercise} onSave={onSave} onClose={() => undefined} />);
    await user.clear(screen.getByLabelText(/reps/i));
    await user.type(screen.getByLabelText(/reps/i), "6");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      sets: 3, reps: "6", load: "70kg", rest: "90s",
    }));
  });

  it("drops blank values rather than persisting empty strings", async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<ExerciseEditSheet exercise={baseExercise} onSave={onSave} onClose={() => undefined} />);
    await user.clear(screen.getByLabelText(/load/i));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave.mock.calls[0][0].load).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/components/workout/ExerciseEditSheet.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `ExerciseEditSheet`**

Create `src/components/workout/ExerciseEditSheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ProgramExercise } from "@/lib/programs/types";

type Props = {
  exercise: ProgramExercise;
  onSave: (patch: Partial<ProgramExercise>) => void;
  onClose: () => void;
};

export function ExerciseEditSheet({ exercise, onSave, onClose }: Props) {
  const [sets, setSets] = useState<string>(exercise.sets?.toString() ?? "");
  const [reps, setReps] = useState<string>(exercise.reps ?? "");
  const [load, setLoad] = useState<string>(exercise.load ?? "");
  const [rest, setRest] = useState<string>(exercise.rest ?? "");
  const [notes, setNotes] = useState<string>(exercise.notes ?? "");

  function submit() {
    const patch: Partial<ProgramExercise> = {
      sets: sets.trim() ? Number(sets) : undefined,
      reps: reps.trim() || undefined,
      load: load.trim() || undefined,
      rest: rest.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    onSave(patch);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "12px 12px 0 0",
          padding: "12px 16px 16px",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="tx-up flex-1">Edit {exercise.name}</span>
          <button type="button" onClick={onClose} className="p-1 muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sets">
            <input
              type="number"
              min={1}
              max={20}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              className="input w-full"
            />
          </Field>
          <Field label="Reps">
            <input value={reps} onChange={(e) => setReps(e.target.value)} className="input w-full" />
          </Field>
          <Field label="Load">
            <input value={load} onChange={(e) => setLoad(e.target.value)} className="input w-full" />
          </Field>
          <Field label="Rest">
            <input value={rest} onChange={(e) => setRest(e.target.value)} className="input w-full" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="input w-full"
          />
        </Field>
        <button type="button" className="button w-full mt-3" onClick={submit}>
          Save
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2">
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun jest src/components/workout/ExerciseEditSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the edit button into `ExerciseRow` and `TodayWorkout`**

Open `src/components/workout/TodayClient.tsx`. Add the import:

```tsx
import { Pencil } from "lucide-react";
import { ExerciseEditSheet } from "./ExerciseEditSheet";
import { programRepo } from "@/lib/storage/programRepo";
```

Inside `ExerciseRow`, add a new button next to the swap button:

```tsx
<button
  className="btn ghost"
  onClick={onEdit}
  style={{ padding: "3px 6px", flexShrink: 0 }}
  aria-label={`Edit prescription for ${exercise.name}`}
  title="Edit prescription"
  type="button"
>
  <Pencil size={13} aria-hidden />
</button>
```

Add `onEdit: () => void` to its props, plumb it through `SectionCard` and `TodayWorkout`.

In `TodayWorkout`, add the state and handler:

```tsx
const [editTarget, setEditTarget] = useState<ProgramExercise | null>(null);
const { refresh } = useLocalData();

async function applyExerciseEdit(patch: Partial<ProgramExercise>) {
  if (!editTarget) return;
  const fresh = await programRepo.get(program.id);
  if (!fresh) return;
  // Build a day patch with the single exercise updated.
  const patchedDay = {
    ...day,
    sections: day.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        exercises: g.exercises.map((e) => e.id === editTarget.id ? { ...e, ...patch } : e),
      })),
    })),
  };
  const filteredOverrides = fresh.overrides.filter(
    (o) => !(o.scope === "day" && o.dayId === day.id),
  );
  const newOverride = {
    id: crypto.randomUUID(),
    scope: "day" as const,
    programId: program.id,
    dayId: day.id,
    replacement: patchedDay,
    reason: "Edited from Today",
    createdAt: new Date().toISOString(),
  };
  await programRepo.save({ ...fresh, overrides: [...filteredOverrides, newOverride] });
  await refresh();
  setEditTarget(null);
}
```

Render the sheet at the bottom of the `return`:

```tsx
{editTarget && (
  <ExerciseEditSheet
    exercise={editTarget}
    onSave={applyExerciseEdit}
    onClose={() => setEditTarget(null)}
  />
)}
```

Add a helper to `ExerciseRow` so clicking the pencil passes the full exercise object up:

```tsx
onEdit={() => setEditTarget(ex)}
```

- [ ] **Step 6: Verify in-progress cells survive the override save (manual)**

This step is verification only — there is no test runner equivalent because the assertion is about React state. Open `src/components/workout/TodayClient.tsx` and confirm:

1. The hydration `useEffect` keys on `[program.id, day.id]`.
2. The day override path in `applyOverride` (`overrides.ts:28`) preserves the slot's `id`, so the `day` prop passed to `TodayWorkout` will keep its identity after `refresh()`.
3. The `TodayWorkout` component is keyed by `program.id`/`day.id` upstream — confirm `TodayClient` does not unmount it between renders. If it does, change the parent to key on `program.id` only.

Add a comment above the `useEffect` documenting this contract:

```tsx
// Hydration only re-runs when program or day identity changes.
// Day-scoped prescription edits keep both ids stable (see overrides.ts:25-29),
// so the user's in-progress cells survive an edit.
```

- [ ] **Step 7: Add a `TodayClient` test for the edit flow**

Open `src/components/workout/TodayClient.test.tsx`. Mock `programRepo` and `refresh`, then:

```tsx
it("saves a day-scoped override when the user edits a prescription", async () => {
  const saveProgram = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(require("@/lib/storage/programRepo").programRepo, "get").mockResolvedValue(program);
  jest.spyOn(require("@/lib/storage/programRepo").programRepo, "save").mockImplementation(saveProgram);
  mockProfile = {
    id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [],
    trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z",
  };
  mockPrograms = [program as unknown as ProfileDocument];
  const user = userEvent.setup();
  render(<MemoryRouter><TodayClient /></MemoryRouter>);
  const editBtn = await screen.findByRole("button", { name: /edit prescription for bench press/i });
  await user.click(editBtn);
  await user.clear(screen.getByLabelText(/reps/i));
  await user.type(screen.getByLabelText(/reps/i), "5");
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(saveProgram).toHaveBeenCalledWith(expect.objectContaining({
    overrides: expect.arrayContaining([
      expect.objectContaining({ scope: "day", dayId: "day-1" }),
    ]),
  }));
});
```

- [ ] **Step 8: Run the touched tests**

Run: `bun jest src/components/workout/ExerciseEditSheet src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/workout/ExerciseEditSheet.tsx \
        src/components/workout/ExerciseEditSheet.test.tsx \
        src/components/workout/TodayClient.tsx \
        src/components/workout/TodayClient.test.tsx
git commit -m "feat(workout): inline edit prescription on Today (day-scoped override)"
```

---

## Task 7: Bodyweight Tracking on Today and Profile Trend

**Files:**
- Modify: `src/lib/programs/types.ts` (add `BodyweightEntry`, extend `BackupDocument`)
- Modify: `src/lib/storage/appDb.ts` (DB v3 → v4)
- Modify: `src/lib/storage/appDb.test.ts`
- Create: `src/lib/storage/bodyweightRepo.ts`
- Create: `src/lib/storage/bodyweightRepo.test.ts`
- Modify: `src/lib/backup/backup.ts` (include bodyweight, optional)
- Modify: `src/lib/backup/backup.test.ts`
- Create: `src/components/workout/BodyweightWidget.tsx`
- Create: `src/components/workout/BodyweightWidget.test.tsx`
- Create: `src/components/profile/BodyweightSparkline.tsx`
- Create: `src/components/profile/BodyweightSparkline.test.tsx`
- Modify: `src/components/workout/TodayClient.tsx`
- Modify: `src/components/profile/ProfileClient.tsx`

Add a small "Log bodyweight" widget at the top of the Today screen. Persist entries to a new `bodyweight` IndexedDB store. Render a sparkline on the Profile page showing the last 30 days of entries. Backup/restore include the bodyweight entries as an optional field (older backups still restore cleanly).

- [ ] **Step 1: Add the `BodyweightEntry` type and extend `BackupDocument`**

Open `src/lib/programs/types.ts`. Append:

```ts
export type BodyweightEntry = {
  /** ISO date the weight was recorded — also the key (YYYY-MM-DD). */
  id: ISODate;
  value: number;
  unit: "kg" | "lb";
  recordedAt: ISODate;
};
```

In `BackupDocument`, add the optional field:

```ts
export type BackupDocument = {
  version: 1;
  exportedAt: ISODate;
  profile?: ProfileDocument;
  programs: ProgramDocument[];
  logs: WorkoutLogDocument[];
  aliases: AliasDocument[];
  userExercises?: UserExerciseDocument[];
  bodyweight?: BodyweightEntry[];
};
```

- [ ] **Step 2: Bump DB to v4 with an additive `bodyweight` store**

Open `src/lib/storage/appDb.ts`. Change `DB_VERSION = 3` to `DB_VERSION = 4`. Add `bodyweight` to the `TrainerDb` schema:

```ts
bodyweight: {
  key: string;
  value: BodyweightEntry;
};
```

Import the type:

```ts
import type { AliasDocument, BackupDocument, BodyweightEntry, ProfileDocument, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
```

Inside the `upgrade` callback, append the v3 → v4 branch:

```ts
// v3 → v4: add bodyweight store
if (oldVersion < 4) {
  if (!db.objectStoreNames.contains("bodyweight")) {
    db.createObjectStore("bodyweight", { keyPath: "id" });
  }
}
```

- [ ] **Step 3: Write the failing test for v4 upgrade**

Open `src/lib/storage/appDb.test.ts`. Append:

```ts
it("v4 upgrade creates the bodyweight store without dropping existing data", async () => {
  // Seed v3 schema manually (or use existing helper if present), open at v4.
  const db = await getDb();
  expect(db.objectStoreNames.contains("bodyweight")).toBe(true);
});
```

- [ ] **Step 4: Run the test**

Run: `bun jest src/lib/storage/appDb.test.ts`
Expected: PASS (the store should exist after the migration).

- [ ] **Step 5: Write the failing test for `bodyweightRepo`**

Create `src/lib/storage/bodyweightRepo.test.ts`:

```ts
import "fake-indexeddb/auto";
import { bodyweightRepo } from "./bodyweightRepo";
import { resetDbConnection } from "./appDb";

beforeEach(() => {
  resetDbConnection();
  indexedDB.deleteDatabase("trainer-local-first");
});

describe("bodyweightRepo", () => {
  it("save then list returns the entry", async () => {
    await bodyweightRepo.save({
      id: "2026-05-18",
      value: 80,
      unit: "kg",
      recordedAt: "2026-05-18T10:00:00.000Z",
    });
    const all = await bodyweightRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(80);
  });

  it("save twice with same id overwrites", async () => {
    await bodyweightRepo.save({ id: "2026-05-18", value: 80, unit: "kg", recordedAt: "2026-05-18T10:00:00.000Z" });
    await bodyweightRepo.save({ id: "2026-05-18", value: 81, unit: "kg", recordedAt: "2026-05-18T18:00:00.000Z" });
    const all = await bodyweightRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(81);
  });

  it("remove deletes a single entry", async () => {
    await bodyweightRepo.save({ id: "2026-05-18", value: 80, unit: "kg", recordedAt: "2026-05-18T10:00:00.000Z" });
    await bodyweightRepo.remove("2026-05-18");
    expect(await bodyweightRepo.list()).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun jest src/lib/storage/bodyweightRepo.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 7: Implement `bodyweightRepo`**

Create `src/lib/storage/bodyweightRepo.ts`:

```ts
import { getDb } from "./appDb";
import type { BodyweightEntry } from "@/lib/programs/types";

export const bodyweightRepo = {
  async list(): Promise<BodyweightEntry[]> {
    return (await getDb()).getAll("bodyweight");
  },

  async save(entry: BodyweightEntry): Promise<void> {
    await (await getDb()).put("bodyweight", entry);
  },

  async remove(id: string): Promise<void> {
    await (await getDb()).delete("bodyweight", id);
  },
};
```

- [ ] **Step 8: Run the repo test**

Run: `bun jest src/lib/storage/bodyweightRepo.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 9: Include bodyweight in backup/restore**

Open `src/lib/backup/backup.ts`. Add the import:

```ts
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
```

In `exportBackup`, add `bodyweight: await bodyweightRepo.list()` to the returned object.

In `restoreBackup`, add the optional validation (mirroring `userExercises`):

```ts
if (doc["bodyweight"] !== undefined) {
  if (!isArrayOfObjects(doc["bodyweight"])) {
    throw new Error("Invalid backup: 'bodyweight' must be an array of objects.");
  }
  if (!hasIds(doc["bodyweight"])) {
    throw new Error("Invalid backup: 'bodyweight' entries must have string ids.");
  }
}
```

Add `"bodyweight"` to the transaction store list:

```ts
const tx = db.transaction(["profile", "programs", "logs", "aliases", "userExercises", "bodyweight"], "readwrite");
```

Clear it before restore:

```ts
tx.objectStore("bodyweight").clear();
```

And populate:

```ts
for (const e of b.bodyweight ?? []) tx.objectStore("bodyweight").put(e);
```

- [ ] **Step 10: Add backup tests covering bodyweight**

Open `src/lib/backup/backup.test.ts`. Append:

```ts
it("round-trips bodyweight entries through export → restore", async () => {
  await bodyweightRepo.save({
    id: "2026-05-18", value: 80, unit: "kg", recordedAt: "2026-05-18T10:00:00.000Z",
  });
  const backup = await exportBackup();
  await resetWorkspace();
  await restoreBackup(backup);
  const restored = await bodyweightRepo.list();
  expect(restored).toHaveLength(1);
  expect(restored[0].value).toBe(80);
});

it("restores a backup without a bodyweight field (backwards compatibility)", async () => {
  const oldBackup = {
    version: 1,
    exportedAt: "2026-05-18T10:00:00.000Z",
    programs: [],
    logs: [],
    aliases: [],
  };
  await expect(restoreBackup(oldBackup)).resolves.toBeUndefined();
});
```

Add the import:

```ts
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
```

- [ ] **Step 11: Write the failing test for `BodyweightWidget`**

Create `src/components/workout/BodyweightWidget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BodyweightWidget } from "./BodyweightWidget";

const saveMock = jest.fn().mockResolvedValue(undefined);
const listMock = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/storage/bodyweightRepo", () => ({
  bodyweightRepo: {
    list: () => listMock(),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));

beforeEach(() => { saveMock.mockClear(); listMock.mockReset().mockResolvedValue([]); });

describe("BodyweightWidget", () => {
  it("shows the call-to-action when no entry exists for today", async () => {
    render(<BodyweightWidget />);
    expect(await screen.findByText(/log bodyweight/i)).toBeInTheDocument();
  });

  it("saves an entry when the user submits", async () => {
    const user = userEvent.setup();
    render(<BodyweightWidget />);
    await user.click(await screen.findByText(/log bodyweight/i));
    await user.type(screen.getByPlaceholderText(/weight/i), "80");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ value: 80, unit: "kg" }));
  });

  it("shows the current weight when an entry exists for today", async () => {
    listMock.mockResolvedValue([
      { id: "2026-05-18", value: 81, unit: "lb", recordedAt: "2026-05-18T10:00:00.000Z" },
    ]);
    // Stub today to 2026-05-18 by mocking Date — or accept a `today` prop on the widget.
    render(<BodyweightWidget today="2026-05-18" />);
    expect(await screen.findByText(/81 lb/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Implement `BodyweightWidget`**

Create `src/components/workout/BodyweightWidget.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import type { BodyweightEntry } from "@/lib/programs/types";

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BodyweightWidget({ today }: { today?: string } = {}) {
  const date = today ?? todayString();
  const [entry, setEntry] = useState<BodyweightEntry | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  useEffect(() => {
    bodyweightRepo.list().then((all) => {
      const today = all.find((e) => e.id === date);
      setEntry(today);
      if (today) { setValue(String(today.value)); setUnit(today.unit); }
    });
  }, [date]);

  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    const saved: BodyweightEntry = {
      id: date,
      value: v,
      unit,
      recordedAt: new Date().toISOString(),
    };
    await bodyweightRepo.save(saved);
    setEntry(saved);
    setEditing(false);
  }

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: "8px 10px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        BW
      </span>
      {entry && !editing ? (
        <>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)" }}>
            {entry.value} {entry.unit}
          </span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setEditing(true)}
            style={{ padding: "2px 6px", fontSize: 10 }}
          >
            update
          </button>
        </>
      ) : !editing ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => setEditing(true)}
          style={{ padding: "2px 6px", fontSize: 11 }}
        >
          Log bodyweight
        </button>
      ) : (
        <>
          <input
            type="number"
            value={value}
            placeholder="weight"
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 70, fontSize: 12 }}
            autoFocus
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "kg" | "lb")}
            className="input"
            style={{ width: 56, fontSize: 12 }}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
          <button type="button" className="button" onClick={save} style={{ padding: "3px 8px", fontSize: 11 }}>
            Save
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Run the widget tests**

Run: `bun jest src/components/workout/BodyweightWidget.test.tsx`
Expected: PASS, all 3 tests green.

- [ ] **Step 14: Mount `BodyweightWidget` on Today**

Open `src/components/workout/TodayClient.tsx`. Add the import:

```tsx
import { BodyweightWidget } from "./BodyweightWidget";
```

Inside `TodayWorkout`, render the widget right after the Day header `<div>` block (after line 514, before the sections map):

```tsx
<BodyweightWidget />
```

- [ ] **Step 15: Write the failing test for `BodyweightSparkline`**

Create `src/components/profile/BodyweightSparkline.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { BodyweightSparkline } from "./BodyweightSparkline";

describe("BodyweightSparkline", () => {
  it("renders a placeholder when there are fewer than two entries", () => {
    render(<BodyweightSparkline entries={[]} />);
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
  });

  it("renders an SVG line for two or more entries", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-05-10", value: 80, unit: "kg", recordedAt: "2026-05-10T00:00:00.000Z" },
          { id: "2026-05-12", value: 81, unit: "kg", recordedAt: "2026-05-12T00:00:00.000Z" },
          { id: "2026-05-14", value: 82, unit: "kg", recordedAt: "2026-05-14T00:00:00.000Z" },
        ]}
      />
    );
    expect(document.querySelector("svg polyline")).toBeTruthy();
  });

  it("shows latest value with unit", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-05-10", value: 80, unit: "kg", recordedAt: "2026-05-10T00:00:00.000Z" },
          { id: "2026-05-12", value: 81, unit: "kg", recordedAt: "2026-05-12T00:00:00.000Z" },
        ]}
      />
    );
    expect(screen.getByText(/81 kg/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 16: Implement `BodyweightSparkline`**

Create `src/components/profile/BodyweightSparkline.tsx`:

```tsx
import type { BodyweightEntry } from "@/lib/programs/types";

type Props = {
  entries: BodyweightEntry[];
};

const WIDTH = 220;
const HEIGHT = 40;
const PAD = 4;

export function BodyweightSparkline({ entries }: Props) {
  if (entries.length < 2) {
    return (
      <div className="panel">
        <p className="tx-up mb-1">Bodyweight</p>
        <p className="muted text-xs">Not enough data — log at least two entries.</p>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const values = sorted.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (WIDTH - PAD * 2) / (sorted.length - 1);
  const points = sorted.map((e, i) => {
    const x = PAD + i * stepX;
    const y = HEIGHT - PAD - ((e.value - min) / range) * (HEIGHT - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const latest = sorted[sorted.length - 1];

  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-1">
        <span className="tx-up flex-1">Bodyweight</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)" }}>
          {latest.value} {latest.unit}
        </span>
      </div>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label={`Bodyweight trend, ${sorted.length} entries`}
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
```

- [ ] **Step 17: Run sparkline tests**

Run: `bun jest src/components/profile/BodyweightSparkline.test.tsx`
Expected: PASS.

- [ ] **Step 18: Mount the sparkline on the Profile page**

Open `src/components/profile/ProfileClient.tsx`. Add imports:

```tsx
import { BodyweightSparkline } from "./BodyweightSparkline";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import type { BodyweightEntry } from "@/lib/programs/types";
```

Add state and load:

```tsx
const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);

useEffect(() => {
  bodyweightRepo.list().then(setBodyweight);
}, []);
```

Render the sparkline above the `Body` card, after the avatar header and heatmap:

```tsx
<BodyweightSparkline entries={bodyweight} />
```

- [ ] **Step 19: Run profile + backup tests**

Run: `bun jest src/components/profile/BodyweightSparkline src/lib/backup/backup.test.ts src/components/workout/BodyweightWidget`
Expected: All PASS.

- [ ] **Step 20: Commit**

```bash
git add src/lib/programs/types.ts src/lib/storage/appDb.ts src/lib/storage/appDb.test.ts \
        src/lib/storage/bodyweightRepo.ts src/lib/storage/bodyweightRepo.test.ts \
        src/lib/backup/backup.ts src/lib/backup/backup.test.ts \
        src/components/workout/BodyweightWidget.tsx src/components/workout/BodyweightWidget.test.tsx \
        src/components/profile/BodyweightSparkline.tsx src/components/profile/BodyweightSparkline.test.tsx \
        src/components/workout/TodayClient.tsx src/components/profile/ProfileClient.tsx
git commit -m "feat(profile,workout): bodyweight tracking with sparkline trend"
```

---

## Task 8: Rest Timer Driven by Exercise Notes

**Files:**
- Create: `src/lib/workout/parseDuration.ts`
- Create: `src/lib/workout/parseDuration.test.ts`
- Create: `src/components/workout/RestTimer.tsx`
- Create: `src/components/workout/RestTimer.test.tsx`
- Modify: `src/components/workout/TodayClient.tsx`

Add a `RestTimer` on Today that:
- Parses a duration from `exercise.rest` first, then from `exercise.notes`.
- Patterns supported: `90s`, `90 sec`, `1:30`, `2 min`, `90-120s` (range → midpoint), `45 to 60 seconds`.
- If no pattern matches, shows a number input prompting the user to enter seconds.
- Provides start / pause / reset. Audible bell + vibration on completion (no-op when unsupported).
- Renders inline below each exercise's cells row.

- [ ] **Step 1: Write the failing test for `parseDuration`**

Create `src/lib/workout/parseDuration.test.ts`:

```ts
import { parseDuration } from "./parseDuration";

describe("parseDuration", () => {
  it("parses '60s' to 60", () => {
    expect(parseDuration("60s")).toBe(60);
  });
  it("parses '90 sec' to 90", () => {
    expect(parseDuration("90 sec")).toBe(90);
  });
  it("parses '2 min' to 120", () => {
    expect(parseDuration("2 min")).toBe(120);
  });
  it("parses '1:30' to 90", () => {
    expect(parseDuration("1:30")).toBe(90);
  });
  it("parses '0:45' to 45", () => {
    expect(parseDuration("0:45")).toBe(45);
  });
  it("parses '45-60s' to midpoint 53", () => {
    expect(parseDuration("45-60s")).toBe(53);
  });
  it("parses '90 to 120 seconds' to midpoint 105", () => {
    expect(parseDuration("90 to 120 seconds")).toBe(105);
  });
  it("parses a mixed sentence with a duration in it", () => {
    expect(parseDuration("rest 75s between sets")).toBe(75);
  });
  it("returns undefined for unknown formats", () => {
    expect(parseDuration("no time here")).toBeUndefined();
  });
  it("returns undefined for empty string", () => {
    expect(parseDuration("")).toBeUndefined();
  });
  it("treats bare number as seconds", () => {
    expect(parseDuration("90")).toBe(90);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun jest src/lib/workout/parseDuration.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `parseDuration`**

Create `src/lib/workout/parseDuration.ts`:

```ts
const MMSS = /(\d+):(\d{1,2})/;
const RANGE_S = /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:s\b|sec|seconds)/i;
const RANGE_M = /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:m\b|min|minutes)/i;
const SINGLE_S = /(\d+)\s*(?:s\b|sec|seconds)/i;
const SINGLE_M = /(\d+)\s*(?:m\b|min|minutes)/i;
const BARE_INT = /^\s*(\d+)\s*$/;

export function parseDuration(input: string): number | undefined {
  if (!input) return undefined;
  const s = input.trim();

  const bare = BARE_INT.exec(s);
  if (bare) return Number(bare[1]);

  const rs = RANGE_S.exec(s);
  if (rs) return Math.round((Number(rs[1]) + Number(rs[2])) / 2);

  const rm = RANGE_M.exec(s);
  if (rm) return Math.round(((Number(rm[1]) + Number(rm[2])) / 2) * 60);

  const mmss = MMSS.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);

  const ss = SINGLE_S.exec(s);
  if (ss) return Number(ss[1]);

  const mm = SINGLE_M.exec(s);
  if (mm) return Number(mm[1]) * 60;

  return undefined;
}
```

- [ ] **Step 4: Run the parser tests**

Run: `bun jest src/lib/workout/parseDuration.test.ts`
Expected: PASS, all 11 tests green.

- [ ] **Step 5: Write the failing test for `RestTimer`**

Create `src/components/workout/RestTimer.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestTimer } from "./RestTimer";

jest.useFakeTimers();

describe("RestTimer", () => {
  it("shows the prescribed duration parsed from rest text", () => {
    render(<RestTimer restText="90s" />);
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it("prompts for input when no duration can be parsed", () => {
    render(<RestTimer restText="" />);
    expect(screen.getByPlaceholderText(/seconds/i)).toBeInTheDocument();
  });

  it("counts down by one second after start", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText(/0:59/)).toBeInTheDocument();
  });

  it("stops at zero", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="2s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
  });

  it("pause and reset return to the original duration", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<RestTimer restText="60s" />);
    await user.click(screen.getByRole("button", { name: /start/i }));
    await act(async () => { jest.advanceTimersByTime(5000); });
    await user.click(screen.getByRole("button", { name: /pause/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByText(/1:00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement `RestTimer`**

Create `src/components/workout/RestTimer.tsx`:

```tsx
"use client";

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

  if (seconds === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <input
          type="number"
          placeholder="seconds"
          min={5}
          max={600}
          className="input"
          style={{ width: 80, fontSize: 12 }}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) {
              setSeconds(n); setRemaining(n);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, minWidth: 36 }}>
        {fmt(remaining)}
      </span>
      <button
        type="button"
        className="btn ghost"
        aria-label={running ? "Pause" : "Start"}
        onClick={() => setRunning((r) => !r)}
        style={{ padding: "3px 6px" }}
      >
        {running ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-label="Reset"
        onClick={() => { setRunning(false); setRemaining(seconds); }}
        style={{ padding: "3px 6px" }}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Run the timer tests**

Run: `bun jest src/components/workout/RestTimer.test.tsx`
Expected: PASS, all 5 tests green.

- [ ] **Step 8: Mount `RestTimer` inside `ExerciseRow` on Today**

Open `src/components/workout/TodayClient.tsx`. Add the import:

```tsx
import { RestTimer } from "./RestTimer";
```

Inside `ExerciseRow`, after the cells/add-set row (after the closing `</div>` of the `display: "flex", flexWrap: "wrap"` block), add:

```tsx
<RestTimer restText={exercise.rest} notes={exercise.notes} />
```

- [ ] **Step 9: Run all touched tests**

Run: `bun jest src/lib/workout/parseDuration src/components/workout/RestTimer src/components/workout/TodayClient.test.tsx`
Expected: All PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/workout/parseDuration.ts src/lib/workout/parseDuration.test.ts \
        src/components/workout/RestTimer.tsx src/components/workout/RestTimer.test.tsx \
        src/components/workout/TodayClient.tsx
git commit -m "feat(workout): per-exercise rest timer with duration parsing"
```

---

## Final Steps

- [ ] **Step 1: Full test suite**

Run: `bun jest`
Expected: All tests PASS, no regressions in previously green tests.

- [ ] **Step 2: TypeScript compile check**

Run: `bunx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Lint**

Run: `bun lint`
Expected: No new errors. Fix any warnings introduced by the new code.

- [ ] **Step 4: Manual smoke test**

Start dev server (`bun dev`) and verify on a mobile-sized window:

- Routine view: open a program with a superset; expand the day; verify SUPERSET label and vertical rail render.
- Today: type into a cell; wait ~1.5s; "saved" appears. Refresh the page; cells re-hydrate.
- Today: open an exercise note; type; refresh; note persists.
- Today: tap the pencil; edit `Reps` to a new value; save; observe the prescription line updates and your in-progress cells are not cleared.
- Today: open the catalogue (Replace exercise); focus the search input; on mobile the list remains scrollable above the keyboard.
- Today: log a bodyweight; navigate to Profile; the sparkline renders.
- Today: each exercise shows a rest timer; click Start; counts down; vibrates at zero (only on a device that supports it).
- Routine progression: log today, open Today again — should advance to the next day; tomorrow, log again — should advance one more.

- [ ] **Step 5: Done**

If everything is green, hand back to the user with a summary of the eight features and which commits implement each. If anything failed, debug in place and re-run.
