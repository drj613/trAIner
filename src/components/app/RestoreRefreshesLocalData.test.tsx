import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { deleteDB } from "idb";
import { LocalDataProvider, useLocalData } from "./LocalDataProvider";
import { SettingsClient } from "./SettingsClient";
import { exportBackup } from "@/lib/backup/backup";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { logRepo } from "@/lib/storage/logRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { emptyTags, type ProgramDocument, type WorkoutLogDocument } from "@/lib/programs/types";

/**
 * Task 14a. A restore replaces every document in IndexedDB, but
 * `LocalDataProvider` reads `programs` and `profile` exactly once, in a
 * mount-time effect (`LocalDataProvider.tsx:76`). `App.tsx:48` mounts it above
 * the router, so it outlives navigation to and from Settings.
 *
 * That is not merely a stale-display bug. `saveProgram` writes whatever
 * document the provider is holding, so the first edit a user makes after a
 * restore puts the *pre-restore* program back over the restored one, under the
 * same id. IndexedDB is the only copy. The loss happens at the exact moment
 * the user is recovering their data.
 *
 * Nothing here is mocked. The real `restoreBackup` runs against
 * `fake-indexeddb`, driven through the real Settings file input, under the real
 * provider. `SettingsClient.test.tsx` mocks `@/lib/backup/backup` wholesale, so
 * a test written there could not observe any of this.
 */

const RESTORED_TITLE = "Restored routine";
const STALE_TITLE = "Stale routine";

function day(id: string, title: string) {
  return {
    id,
    dayNumber: Number(id.slice(-1)),
    title,
    sections: [
      {
        id: `${id}-s1`,
        name: "Main",
        type: "strength" as const,
        groups: [
          {
            id: `${id}-g1`,
            type: "single" as const,
            exercises: [
              { id: `${id}-e1`, name: "Back Squat", sets: 3, reps: "5", tags: emptyTags() },
            ],
          },
        ],
      },
    ],
  };
}

/** The document the backup file carries: two days, the good title. */
const restoredProgram: ProgramDocument = {
  id: "p1",
  title: RESTORED_TITLE,
  source: "manual",
  active: true,
  days: [day("day-1", "Lower"), day("day-2", "Upper")],
  overrides: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/**
 * What the store holds when Settings is opened: the same id, a different
 * title, and one of the two days missing. Both differences matter — a title is
 * easy to eyeball, a dropped day is the kind of loss a user would not notice
 * until the week it was scheduled.
 */
const staleProgram: ProgramDocument = {
  ...restoredProgram,
  title: STALE_TITLE,
  days: [day("day-1", "Lower")],
};

/**
 * Three logs live in the backup and none in the pre-restore store, purely so
 * the Settings stats panel has a number that changes. The panel is written
 * *after* the restore in `handleImport`, which makes "logs reads 3" a
 * completion signal for the whole handler that does not depend on the fix
 * being present. Waiting on the provider's own state instead would turn a
 * missing refresh into a timeout rather than a failed assertion.
 */
const logs: WorkoutLogDocument[] = [1, 2, 3].map((n) => ({
  id: `log-${n}`,
  programId: "p1",
  dayId: "day-1",
  performedAt: `2026-08-0${n}T12:00:00.000Z`,
  performedDate: `2026-08-0${n}`,
  entries: [
    {
      exerciseId: "day-1-e1",
      exerciseName: "Back Squat",
      sets: [{ setNumber: 1, weight: 100, reps: 5 }],
    },
  ],
}) as WorkoutLogDocument);

/**
 * Stands in for every real consumer of the provider — `RoutinesIndexClient`,
 * `WorkoutDayClient`, `DiffPage`, `ImportClient` all do the same two things:
 * read `programs` out of context, and hand one back to `saveProgram` with a
 * field changed. `active: false` is the edit; every other field rides along
 * from whatever copy the provider is holding, which is the whole defect.
 */
function LocalDataProbe() {
  const { programs, saveProgram } = useLocalData();

  return (
    <>
      <span data-testid="probe-title">{programs[0]?.title ?? "none"}</span>
      <span data-testid="probe-days">{programs[0]?.days.length ?? 0}</span>
      <button
        type="button"
        onClick={() => {
          const held = programs[0];
          if (held) void saveProgram({ ...held, active: false });
        }}
      >
        edit the first program
      </button>
    </>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter>
      <LocalDataProvider>
        <LocalDataProbe />
        <SettingsClient />
      </LocalDataProvider>
    </MemoryRouter>,
  );
}

/** The stats panel row for `key`, the last thing `handleImport` writes. */
function statValue(key: string) {
  const label = screen.getByText(key);
  return within(label.parentElement as HTMLElement).getAllByText(/^\d+$/)[0];
}

describe("a backup restore refreshes LocalDataProvider", () => {
  let backupFile: File;

  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();

    // Build the backup from a real workspace so the file is valid by
    // construction rather than by a hand-written literal that could drift out
    // of step with `restoreBackup`'s validation.
    await programRepo.save(restoredProgram);
    for (const log of logs) await logRepo.save(log);
    const payload = JSON.stringify(await exportBackup());
    backupFile = new File([payload], "workspace.json", { type: "application/json" });
    // jsdom 20 does not implement File.prototype.text; without this stub
    // handleImport's JSON.parse throws into its own catch and the test fails
    // looking like a production bug.
    Object.defineProperty(backupFile, "text", { value: async () => payload });

    // Now make the live store stale: same id, worse content, no logs.
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await programRepo.save(staleProgram);

    jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.spyOn(window, "alert").mockImplementation(() => undefined);
    window.URL.createObjectURL = jest.fn().mockReturnValue("blob:x");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDbConnection();
  });

  async function importTheBackup(container: HTMLElement) {
    await waitFor(() => expect(screen.getByTestId("probe-title")).toHaveTextContent(STALE_TITLE));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, backupFile);
    // `handleImport` writes the stats panel last, after the restore and after
    // the provider refresh. Three logs where there were none is that handler
    // reporting it finished.
    await waitFor(() => expect(statValue("logs")).toHaveTextContent("3"));
  }

  it("does not let a later save write the pre-restore program back over the restored one", async () => {
    const { container } = renderHarness();
    await importTheBackup(container);

    await userEvent.click(screen.getByRole("button", { name: /edit the first program/i }));

    const stored = await waitFor(async () => {
      const p = await programRepo.get("p1");
      // The edit is the canary: until `active` flips, the save has not landed
      // and the assertions below would be reading the restore, not the write
      // after it.
      expect(p?.active).toBe(false);
      return p;
    });

    expect(stored?.title).toBe(RESTORED_TITLE);
    expect(stored?.days).toHaveLength(2);
  }, 30_000);

  it("refreshes the provider exactly once for one restore", async () => {
    // Counting refreshes by watching the provider republish `programs` does
    // NOT work: two adjacent `await refresh()` calls settle in one React
    // commit, so a probe counting commits reports 1 for both one refresh and
    // two. That mutation (M2) survived such a probe. `programRepo.list()` is
    // called once per refresh and cannot be batched away.
    const listSpy = jest.spyOn(programRepo, "list");
    const { container } = renderHarness();
    await waitFor(() => expect(screen.getByTestId("probe-title")).toHaveTextContent(STALE_TITLE));

    // Calibrate the reads that a Settings action makes *without* refreshing
    // the provider, instead of asserting a hand-reasoned constant. Snapshot
    // runs the same tail as the import handler — export the workspace, then
    // reload the stats panel — and touches the provider not at all. Whatever
    // that costs in `programRepo.list` calls is the floor the restore has to
    // beat by exactly one.
    listSpy.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /snapshot \(undo point\)/i }));
    await waitFor(() => expect(statValue("snapshots")).toHaveTextContent("1"));
    const withoutARefresh = listSpy.mock.calls.length;
    expect(withoutARefresh).toBeGreaterThan(0);

    listSpy.mockClear();
    await importTheBackup(container);

    await waitFor(() => expect(screen.getByTestId("probe-title")).toHaveTextContent(RESTORED_TITLE));
    expect(screen.getByTestId("probe-days")).toHaveTextContent("2");
    // Exactly one more read than the no-refresh baseline. Zero refreshes lands
    // on `withoutARefresh`; two — one from this handler plus one from a
    // listener on the identity event `restoreBackup` already fires — lands on
    // `withoutARefresh + 2`. Neither can pass.
    expect(listSpy.mock.calls.length).toBe(withoutARefresh + 1);
  }, 30_000);
});
