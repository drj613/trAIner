import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import { logRepo } from "@/lib/storage/logRepo";
import type { WorkoutLogDocument } from "@/lib/programs/types";
import { HistoryClient } from "./HistoryClient";

/**
 * Logs for the all-time history page, installed over `logRepo.list`.
 *
 * Real catalogue ids throughout: `barbell-high-bar-squat` and
 * `barbell-low-bar-squat` are two versions of the shipped `squat` movement, so
 * the page has a genuine family to combine, and `barbell-bench-press` gives it a
 * second family to keep separate. A fixture with invented ids resolves to
 * nothing and would exercise no grouping rule at all.
 */
function makeHistoryClientFixture(logs: WorkoutLogDocument[]) {
  const spy = jest.spyOn(logRepo, "list");
  return {
    logs,
    install() {
      spy.mockResolvedValue(logs);
    },
    fail(error: Error) {
      spy.mockRejectedValue(error);
    },
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function log(
  id: string,
  performedAt: string,
  entries: WorkoutLogDocument["entries"],
): WorkoutLogDocument {
  return { id, programId: "p1", dayId: "d1", performedAt, entries } as WorkoutLogDocument;
}

const squatLogs = [
  log("l-high", daysAgo(10), [
    {
      exerciseId: "e1",
      exerciseName: "High Bar Back Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      sets: [{ setNumber: 1, weight: 225, reps: 5 }],
    },
  ]),
  log("l-low", daysAgo(3), [
    {
      exerciseId: "e2",
      exerciseName: "Low Bar Squat",
      canonicalExerciseId: "barbell-low-bar-squat",
      sets: [{ setNumber: 1, weight: 275, reps: 3 }],
    },
  ]),
];

const benchLog = log("l-bench", daysAgo(200), [
  {
    exerciseId: "e3",
    exerciseName: "Barbell Bench Press",
    canonicalExerciseId: "barbell-bench-press",
    sets: [{ setNumber: 1, weight: 185, reps: 5 }],
  },
]);

const unresolvedLog = log("l-plank", daysAgo(1), [
  {
    exerciseId: "e4",
    exerciseName: "Sled Push Ladder Thing",
    sets: [{ setNumber: 1, rawCell: "30s hold" }],
  },
]);

function renderHistory() {
  return render(
    <ExerciseNormalizationProvider>
      <HistoryClient />
    </ExerciseNormalizationProvider>,
  );
}

async function openFamily(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  return user;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("HistoryClient — all-time family history", () => {
  it("shows one index row per movement family, counting workouts not entries", async () => {
    // `l-low` logs the squat TWICE, so the family has 3 workouts and 4 entries.
    // A fixture with one entry per workout cannot tell the two counts apart.
    const twice = {
      ...squatLogs[1],
      entries: [...squatLogs[1].entries, { ...squatLogs[1].entries[0] }],
    } as WorkoutLogDocument;
    const third = log("l-third", daysAgo(20), [
      {
        exerciseId: "e1", exerciseName: "High Bar Back Squat",
        canonicalExerciseId: "barbell-high-bar-squat",
        sets: [{ setNumber: 1, weight: 205, reps: 5 }],
      },
    ]);
    makeHistoryClientFixture([squatLogs[0], twice, third, benchLog]).install();
    renderHistory();
    const squat = await screen.findByRole("button", { name: /^Squat\b/ });
    expect(within(squat).getByText("3 workouts")).toBeInTheDocument();
    expect(within(squat).getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Bench Press\b/ })).toBeInTheDocument();
  });

  // Spec ~491: a family index row may show only comparable family-level facts.
  // Best set, PR and volume trend are not comparable across mechanically
  // different versions of one movement.
  it("shows no best set or trend on a family index row", async () => {
    makeHistoryClientFixture(squatLogs).install();
    renderHistory();
    const squat = await screen.findByRole("button", { name: /^Squat\b/ });
    expect(within(squat).queryByText("275x3")).not.toBeInTheDocument();
    expect(within(squat).queryByText("225x5")).not.toBeInTheDocument();
    expect(within(squat).queryByTestId("trend")).not.toBeInTheDocument();
  });

  it("opens one Squat history combining both versions, newest first", async () => {
    makeHistoryClientFixture(squatLogs).install();
    renderHistory();
    await openFamily(/^Squat\b/);
    const rows = screen.getAllByTestId("history-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Low Bar Squat")).toBeInTheDocument();
    expect(within(rows[1]).getByText("High Bar Back Squat")).toBeInTheDocument();
  });

  it("shows the immutable performed label with the current version badge", async () => {
    makeHistoryClientFixture(squatLogs).install();
    renderHistory();
    await openFamily(/^Squat\b/);
    // "Low Bar Squat" is what the user typed; "Low Bar Back Squat" is what the
    // catalogue calls it now.
    const row = screen.getByText("Low Bar Squat").closest("[data-testid='history-row']");
    expect(within(row as HTMLElement).getByTestId("history-row-current-version"))
      .toHaveTextContent("Low Bar Back Squat");
  });

  it("shows metrics per concrete version, never for the family", async () => {
    makeHistoryClientFixture(squatLogs).install();
    renderHistory();
    await openFamily(/^Squat\b/);
    const panels = screen.getAllByTestId("version-summary");
    expect(panels).toHaveLength(2);
    const high = panels.find((p) => within(p).queryByText("High Bar Back Squat"));
    expect(within(high as HTMLElement).getByText("225x5")).toBeInTheDocument();
    // No family-level best anywhere outside the per-version panels.
    const detail = screen.getByTestId("family-detail");
    expect(within(detail).queryByTestId("family-best")).not.toBeInTheDocument();
  });

  // Item 5 + item 8: the old `sessions` counted ENTRIES. Two entries in one
  // workout is one session and two entries, and the UI has to be able to say so.
  it("counts a version's sessions by workout and reports entries separately", async () => {
    makeHistoryClientFixture([
      log("l-twice", daysAgo(2), [
        {
          exerciseId: "e1", exerciseName: "High Bar Back Squat",
          canonicalExerciseId: "barbell-high-bar-squat",
          sets: [{ setNumber: 1, weight: 225, reps: 5 }],
        },
        {
          exerciseId: "e1", exerciseName: "High Bar Back Squat",
          canonicalExerciseId: "barbell-high-bar-squat",
          sets: [{ setNumber: 1, weight: 185, reps: 8 }],
        },
      ]),
    ]).install();
    renderHistory();
    await openFamily(/^Squat\b/);
    expect(within(screen.getByTestId("version-summary")).getByText("1 session · 2 entries"))
      .toBeInTheDocument();
  });

  it("lets an unresolved name be corrected from its history row", async () => {
    const onlyPlank = makeHistoryClientFixture([unresolvedLog]);
    onlyPlank.install();
    renderHistory();
    const user = await openFamily(/^Sled Push Ladder Thing\b/);
    await user.click(screen.getByRole("button", { name: /Fix identity for Sled Push Ladder Thing/i }));
    expect(await screen.findByLabelText("Correct Sled Push Ladder Thing")).toBeInTheDocument();
  });

  it("filters the index by search text", async () => {
    makeHistoryClientFixture([...squatLogs, benchLog]).install();
    renderHistory();
    await screen.findByRole("button", { name: /^Squat\b/ });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/filter/i), "bench");
    expect(screen.getByRole("button", { name: /^Bench Press\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Squat\b/ })).not.toBeInTheDocument();
  });

  // The old `recent` / `stale` chips split on `sessions > 3`, where `sessions`
  // counted entries — a frequency test wearing the words of a time test. They
  // now mean what they say.
  it("splits recent from stale by when the family was last performed", async () => {
    makeHistoryClientFixture([...squatLogs, benchLog]).install();
    renderHistory();
    await screen.findByRole("button", { name: /^Squat\b/ });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "stale" }));
    expect(screen.getByRole("button", { name: /^Bench Press\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Squat\b/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "recent" }));
    expect(screen.getByRole("button", { name: /^Squat\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bench Press\b/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing has been logged", async () => {
    makeHistoryClientFixture([]).install();
    renderHistory();
    expect(await screen.findByText(/no history yet/i)).toBeInTheDocument();
  });

  /**
   * Item 6 of the Task 12 hand-off. The function this page replaces threw on
   * eight measured stored shapes, so one corrupt field showed the user no
   * history at all. `appDb.ts:186-195` keeps these logs deliberately, so they
   * exist in real storage.
   */
  it("still renders readable history beside a log it cannot read", async () => {
    makeHistoryClientFixture([
      log("l-bad-entries", daysAgo(4), "corrupt" as unknown as WorkoutLogDocument["entries"]),
      log("l-null-entry", daysAgo(5), [null] as unknown as WorkoutLogDocument["entries"]),
      log("l-bad-sets", daysAgo(6), [
        { exerciseId: "e9", exerciseName: "Deadlift", sets: "gone" },
      ] as unknown as WorkoutLogDocument["entries"]),
      {
        ...log("l-bad-date", daysAgo(7), [
          {
            exerciseId: "e1", exerciseName: "High Bar Back Squat",
            canonicalExerciseId: "barbell-high-bar-squat",
            sets: [{ setNumber: 1, weight: 205, reps: 5 }],
          },
        ]),
        performedDate: 7,
      } as unknown as WorkoutLogDocument,
      ...squatLogs,
    ]).install();
    renderHistory();
    const squat = await screen.findByRole("button", { name: /^Squat\b/ });
    expect(squat).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Deadlift\b/ })).toBeInTheDocument();
  });

  it("renders the empty state rather than nothing when the read fails", async () => {
    const fixture = makeHistoryClientFixture([]);
    fixture.fail(new Error("idb closed"));
    renderHistory();
    expect(await screen.findByText(/no history yet/i)).toBeInTheDocument();
  });
  // The header used to print `logs.length`, which counts stored records: a
  // skipped day with nothing recorded is a log, and calling it a workout
  // inflates the only number on the page that claims to be a total.
  it("counts only workouts that produced history in the header", async () => {
    makeHistoryClientFixture([
      ...squatLogs,
      log("l-skipped", daysAgo(5), [{ exerciseId: "e9", exerciseName: "Deadlift", sets: [] }]),
    ]).install();
    renderHistory();
    expect(await screen.findByText("1 movements · 2 workouts")).toBeInTheDocument();
  });

  it("shows a date it cannot read rather than a wrong one", async () => {
    makeHistoryClientFixture([
      {
        ...squatLogs[0],
        performedAt: 7,
        performedDate: 7,
      } as unknown as WorkoutLogDocument,
    ]).install();
    renderHistory();
    const squat = await screen.findByRole("button", { name: /^Squat\b/ });
    // `logLocalDate` has no date to report, so the row says so instead of
    // inventing one from an unreadable timestamp.
    expect(within(squat).getByText(/last —/)).toBeInTheDocument();
  });
});
