/**
 * Integration tests for session persistence on the workout day screen.
 *
 * Unlike WorkoutDayClient.test.tsx these do NOT mock logRepo — they run
 * against the real repository on fake-indexeddb, exercising the actual
 * read-modify-write save path. This is the layer where duplicate-session
 * and empty-historical-day bugs live.
 *
 * jest.config.js pins TZ=America/New_York so the local-vs-UTC calendar
 * boundary (~8pm–midnight local) is reproducible.
 */
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { deleteDB } from "idb";
import { WorkoutDayClient } from "./WorkoutDayClient";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { logRepo } from "@/lib/storage/logRepo";
import type { ProgramDocument } from "@/lib/programs/types";

const makeExercise = (id: string, name: string, canonicalExerciseId?: string) => ({
  id, name, sets: 2, reps: "5",
  ...(canonicalExerciseId ? { canonicalExerciseId } : {}),
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});

const program: ProgramDocument = {
  id: "p1", title: "Test Program", source: "import", active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, title: "Push Day",
      sections: [{
        id: "s1", name: "Main", type: "strength",
        groups: [{ id: "g1", type: "single", exercises: [makeExercise("e1", "Bench Press", "canon-bench")] }],
      }],
    },
    {
      id: "day-2", dayNumber: 2, title: "Pull Day",
      sections: [{
        id: "s2", name: "Main", type: "strength",
        groups: [{ id: "g2", type: "single", exercises: [makeExercise("e2", "Pull-Up")] }],
      }],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [program],
    profile: undefined,
    loading: false,
    error: undefined,
    refresh: jest.fn().mockResolvedValue(undefined),
    saveProgram: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/analytics/analyticsSeam", () => ({
  trackWorkoutEvent: jest.fn().mockResolvedValue(undefined),
}));

function renderDay(dayId = "day-1") {
  return render(
    <MemoryRouter initialEntries={[`/programs/p1/days/${dayId}`]}>
      <Routes>
        <Route path="/programs/:id/days/:dayId" element={<WorkoutDayClient />} />
      </Routes>
    </MemoryRouter>
  );
}

function cell(exId: string, i: number): HTMLInputElement {
  const el = document.getElementById(`cell-${exId}-${i}`);
  if (!el) throw new Error(`cell-${exId}-${i} not found`);
  return el as HTMLInputElement;
}

// Captured before fake timers install so we can yield to the real event
// loop (fake-indexeddb schedules its callbacks on the outer realm's timers).
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

function realSleep(ms: number) {
  return new Promise<void>((r) => realSetTimeout(r, ms));
}

/** Let pending debounce timers fire and IndexedDB callbacks settle. */
async function drainSaves() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2500);
  });
  await act(async () => {
    for (let i = 0; i < 25; i++) await realSleep(0);
  });
}

function useFakeClock(iso: string) {
  jest.useFakeTimers({
    doNotFake: ["setImmediate", "clearImmediate", "nextTick", "queueMicrotask"],
  });
  jest.setSystemTime(new Date(iso));
}

async function typeIntoCell(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLInputElement,
  value: string,
) {
  await user.clear(input);
  await user.type(input, value);
  fireEvent.blur(input); // commit (mirrors how sets are entered on device)
}

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(async () => {
  jest.useRealTimers();
  // Let any in-flight unmount-flush saves land before closing the
  // connection, so the next test's deleteDB isn't blocked.
  await realSleep(120);
  resetDbConnection();
});

describe("session persistence — no phantom or duplicate logs", () => {
  it("visiting a day and navigating away writes no log", async () => {
    const view = renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );

    view.unmount();
    // Allow the unmount flush + any in-flight IDB work to settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(await logRepo.list()).toHaveLength(0);
  });

  it("an evening session survives leaving and returning without duplicating", async () => {
    // 2026-06-11T03:30Z == 2026-06-10 23:30 EDT: UTC date ≠ local date.
    useFakeClock("2026-06-11T03:30:00.000Z");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const first = renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );

    await typeIntoCell(user, cell("e1", 0), "80x5");
    await drainSaves();
    expect(await logRepo.list()).toHaveLength(1);

    first.unmount();
    await drainSaves();

    // Coming back the same evening must show the logged set…
    renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() => expect(cell("e1", 0)).toHaveValue("80x5"));

    // …and continuing to log must update the SAME session, not mint a new one.
    await typeIntoCell(user, cell("e1", 1), "85x5");
    await drainSaves();

    const logs = await logRepo.list();
    expect(logs).toHaveLength(1);
    expect(logs[0].entries[0].sets).toHaveLength(2);
  });
});

describe("historical sessions", () => {
  it("a day completed on an earlier date shows that session's lifts read-only", async () => {
    await logRepo.save({
      id: "old-session",
      programId: "p1",
      dayId: "day-1",
      performedAt: "2026-06-08T22:00:00.000Z",
      completedAt: "2026-06-08T23:00:00.000Z",
      entries: [
        {
          exerciseId: "e1",
          exerciseName: "Bench Press",
          sets: [
            { setNumber: 1, weight: 100, reps: 5 },
            { setNumber: 2, weight: 100, reps: 4 },
          ],
        },
      ],
    });

    useFakeClock("2026-06-10T16:00:00.000Z"); // June 10, noon EDT
    renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });

    // The historical session's lifts are visible…
    await waitFor(() => expect(cell("e1", 0)).toHaveValue("100x5"));
    expect(cell("e1", 1)).toHaveValue("100x4");
    // …read-only, with the session date surfaced…
    expect(cell("e1", 0)).toHaveAttribute("readonly");
    expect(screen.getByText(/2026-06-08/)).toBeInTheDocument();
    // …and the Finish button reflects the completed state.
    expect(screen.getByRole("button", { name: /completed/i })).toBeDisabled();

    // Merely viewing the historical session must not write anything.
    await drainSaves();
    expect(await logRepo.list()).toHaveLength(1);
  });

  it("an in-progress session from an earlier date is resumed, not duplicated", async () => {
    await logRepo.save({
      id: "in-progress",
      programId: "p1",
      dayId: "day-1",
      performedAt: "2026-06-10T01:00:00.000Z", // June 9, 9pm EDT — yesterday local
      entries: [
        {
          exerciseId: "e1",
          exerciseName: "Bench Press",
          sets: [{ setNumber: 1, weight: 60, reps: 10 }],
        },
      ],
    });

    useFakeClock("2026-06-10T16:00:00.000Z");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });

    await waitFor(() => expect(cell("e1", 0)).toHaveValue("60x10"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );

    await typeIntoCell(user, cell("e1", 1), "65x10");
    await drainSaves();

    const logs = await logRepo.list();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe("in-progress");
    expect(logs[0].entries[0].sets).toHaveLength(2);
  });

  it("history follows the exercise across routines (matched by canonical id)", async () => {
    // A completed session under a DIFFERENT program ("p0", an earlier routine)
    // for an exercise whose canonical id matches the current routine's slot.
    // A new routine has a new program.id, so scoping history to program.id
    // would hide this prior session.
    await logRepo.save({
      id: "prior-routine-session",
      programId: "p0", // different program / earlier routine
      dayId: "old-day",
      performedAt: "2026-05-01T22:00:00.000Z",
      completedAt: "2026-05-01T23:00:00.000Z",
      entries: [
        {
          exerciseId: "old-slot-id", // legacy slot id, won't collide
          exerciseName: "Bench Press",
          canonicalExerciseId: "canon-bench", // matches p1/day-1/e1
          sets: [
            { setNumber: 1, weight: 120, reps: 5 },
            { setNumber: 2, weight: 110, reps: 4 },
          ],
        },
      ],
    });

    useFakeClock("2026-06-10T16:00:00.000Z");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDay(); // renders program p1, day-1 (slot e1 → canon-bench)
    await screen.findByRole("heading", { level: 1, name: "Push Day" });

    await user.click(
      screen.getByRole("button", { name: /history for bench press/i }),
    );

    const dialog = await screen.findByRole("dialog");
    // The prior routine's session must appear in this routine's history.
    await waitFor(() => expect(within(dialog).getByText("2026-05-01")).toBeInTheDocument());
    expect(within(dialog).getByText("120x5")).toBeInTheDocument();
  });

  it("Start new session on a previously-completed day begins a fresh editable session", async () => {
    await logRepo.save({
      id: "old-session",
      programId: "p1",
      dayId: "day-1",
      performedAt: "2026-06-08T22:00:00.000Z",
      completedAt: "2026-06-08T23:00:00.000Z",
      entries: [
        {
          exerciseId: "e1",
          exerciseName: "Bench Press",
          sets: [{ setNumber: 1, weight: 100, reps: 5 }],
        },
      ],
    });

    useFakeClock("2026-06-10T16:00:00.000Z");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDay();
    await screen.findByRole("heading", { level: 1, name: "Push Day" });
    await waitFor(() => expect(cell("e1", 0)).toHaveValue("100x5"));

    await user.click(screen.getByRole("button", { name: /start new session/i }));

    // Fresh, editable session.
    await waitFor(() => expect(cell("e1", 0)).toHaveValue(""));
    expect(cell("e1", 0)).not.toHaveAttribute("readonly");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish workout/i })).not.toBeDisabled()
    );

    await typeIntoCell(user, cell("e1", 0), "105x5");
    await drainSaves();

    const logs = (await logRepo.list()).sort((a, b) =>
      a.performedAt.localeCompare(b.performedAt)
    );
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe("old-session");
    expect(logs[0].entries[0].sets).toEqual([{ setNumber: 1, weight: 100, reps: 5 }]);
    expect(logs[1].performedDate).toBe("2026-06-10");
    expect(logs[1].entries[0].sets).toEqual([{ setNumber: 1, weight: 105, reps: 5 }]);
  });
});
