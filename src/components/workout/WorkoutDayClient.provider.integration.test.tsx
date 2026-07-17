/**
 * Integration test with the REAL LocalDataProvider (unmocked) on
 * fake-indexeddb. Guards against saves that go through the provider's global
 * refresh(): refresh flips `loading`, which swaps the whole workout view for
 * a "Loading…" paragraph — the page collapses, scroll jumps to the top, and
 * every row remounts. In-place saves (saveProgram) must keep the tree mounted.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { deleteDB } from "idb";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { WorkoutDayClient } from "./WorkoutDayClient";
import { programRepo } from "@/lib/storage/programRepo";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import type { ProgramDay, ProgramDocument } from "@/lib/programs/types";

jest.mock("@/lib/analytics/analyticsSeam", () => ({
  trackWorkoutEvent: jest.fn().mockResolvedValue(undefined),
}));

const program: ProgramDocument = {
  id: "p1", title: "Test Program", source: "import", active: true,
  days: [
    {
      id: "day-1", dayNumber: 1, title: "Push Day",
      sections: [{
        id: "s1", name: "Main", type: "strength",
        groups: [{
          id: "g1", type: "single",
          exercises: [{
            id: "e1", name: "Bench Press", sets: 2, reps: "5",
            tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      }],
    },
  ],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
  await programRepo.save(program);
});

afterEach(() => {
  resetDbConnection();
});

function renderDay() {
  return render(
    <LocalDataProvider>
      <MemoryRouter initialEntries={["/programs/p1/days/day-1"]}>
        <Routes>
          <Route path="/programs/:id/days/:dayId" element={<WorkoutDayClient />} />
        </Routes>
      </MemoryRouter>
    </LocalDataProvider>
  );
}

describe("WorkoutDayClient unit toggle (real provider)", () => {
  it("persists the unit without unmounting the view", async () => {
    renderDay();
    const heading = await screen.findByRole("heading", { level: 1, name: "Push Day" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /weight unit lb — switch to kg/i }));
    await screen.findByRole("button", { name: /weight unit kg — switch to lb/i });

    // Same DOM node ⇒ the tree never unmounted (no "Loading…" blank-out,
    // no scroll-to-top). A remount would produce a new heading element.
    expect(screen.getByRole("heading", { level: 1, name: "Push Day" })).toBe(heading);

    // And the change actually landed in storage as a day override.
    const stored = await programRepo.get("p1");
    const override = stored?.overrides.find((o) => o.scope === "day" && o.dayId === "day-1");
    expect((override?.replacement as ProgramDay).sections[0].groups[0].exercises[0].unit).toBe("kg");
  });
});
