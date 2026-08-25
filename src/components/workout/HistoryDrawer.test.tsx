import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDrawer } from "./HistoryDrawer";
import type { ExerciseHistoryRow } from "@/lib/workout/historyProjection";

/**
 * Deterministic drawer rows.
 *
 * The drawer consumes `ExerciseHistoryRow` straight from the shared projection,
 * so a fixture only has to supply the fields a test is actually about. Every
 * other field is filled in here: one workout per row unless `logId` is given,
 * dates descending from the newest, and `versionKey` defaulting to the concrete
 * id the way `versionKeyForIdentity` does.
 */
export function makeHistoryDrawerRows(
  inputs: Array<Partial<ExerciseHistoryRow> & Pick<ExerciseHistoryRow, "performedName">>,
): ExerciseHistoryRow[] {
  return inputs.map((input, index) => {
    const day = 20 - index;
    return {
      logId: `log-${index}`,
      entryIndex: 0,
      performedAt: `2026-04-${String(day).padStart(2, "0")}T14:00:00.000Z`,
      performedDate: `2026-04-${String(day).padStart(2, "0")}`,
      sets: ["100x5"],
      volumeLb: 500,
      versionKey: input.concreteExerciseId ?? `name:${input.performedName}`,
      ...input,
    };
  });
}

const squatRows = makeHistoryDrawerRows([
  {
    performedName: "High Bar Back Squat",
    concreteExerciseId: "barbell-high-bar-squat",
    currentVersionLabel: "High Bar Back Squat",
    movementId: "squat",
  },
  {
    performedName: "Low Bar Back Squat",
    concreteExerciseId: "barbell-low-bar-squat",
    currentVersionLabel: "Low Bar Back Squat",
    movementId: "squat",
  },
  {
    performedName: "Back Squat",
    concreteExerciseId: "barbell-back-squat",
    currentVersionLabel: "Back Squat",
    movementId: "squat",
  },
]);

function renderDrawer(props: Partial<React.ComponentProps<typeof HistoryDrawer>> = {}) {
  return render(
    <HistoryDrawer
      exerciseName="Squat"
      rows={squatRows}
      onClose={jest.fn()}
      {...props}
    />,
  );
}

describe("HistoryDrawer — family-wide Today history", () => {
  it("renders the family name as heading", () => {
    renderDrawer();
    expect(screen.getByRole("heading", { name: "Squat" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("defaults to the whole family rather than the active version", () => {
    renderDrawer({ activeVersionKey: "barbell-high-bar-squat" });
    expect(screen.getAllByTestId("history-row")).toHaveLength(3);
    expect(screen.getByLabelText("Filter by version")).toHaveValue("");
  });

  it("emphasizes the active version without hiding the others", () => {
    renderDrawer({ activeVersionKey: "barbell-high-bar-squat" });
    const active = screen
      .getAllByTestId("history-row")
      .filter((row) => row.getAttribute("data-active-version") === "true");
    expect(active).toHaveLength(1);
    expect(within(active[0]).getByText("High Bar Back Squat")).toBeInTheDocument();
  });

  it("filters the combined list down to one version", async () => {
    const user = userEvent.setup();
    renderDrawer({ activeVersionKey: "barbell-high-bar-squat" });
    await user.selectOptions(screen.getByLabelText("Filter by version"), "barbell-low-bar-squat");
    const rows = screen.getAllByTestId("history-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Low Bar Back Squat")).toBeInTheDocument();
  });

  // Item 2 of the Task 12 hand-off: `rows.length` counted ENTRIES and called
  // them sessions, so two workouts that each logged the exercise twice read as
  // "4 sessions". Workouts and entries are different numbers and the header
  // must say both.
  it("counts workouts and entries separately", () => {
    const rows = makeHistoryDrawerRows([
      { performedName: "Back Squat", logId: "log-a", entryIndex: 0, performedAt: "2026-04-20T14:00:00.000Z", performedDate: "2026-04-20" },
      { performedName: "Back Squat", logId: "log-a", entryIndex: 1, performedAt: "2026-04-20T14:00:00.000Z", performedDate: "2026-04-20" },
      { performedName: "Back Squat", logId: "log-b", entryIndex: 0, performedAt: "2026-04-13T14:00:00.000Z", performedDate: "2026-04-13" },
      { performedName: "Back Squat", logId: "log-b", entryIndex: 1, performedAt: "2026-04-13T14:00:00.000Z", performedDate: "2026-04-13" },
    ]);
    renderDrawer({ rows });
    expect(screen.getByText("2 workouts · 4 entries")).toBeInTheDocument();
  });

  // Item 3: two entries from one workout used to render as two identical date
  // blocks.
  it("groups same-workout entries under one date", () => {
    const rows = makeHistoryDrawerRows([
      { performedName: "Back Squat", logId: "log-a", entryIndex: 0, performedAt: "2026-04-20T14:00:00.000Z", performedDate: "2026-04-20", sets: ["225x5"] },
      { performedName: "Back Squat", logId: "log-a", entryIndex: 1, performedAt: "2026-04-20T14:00:00.000Z", performedDate: "2026-04-20", sets: ["185x8"] },
    ]);
    renderDrawer({ rows });
    expect(screen.getAllByText("Apr 20 (Mon)")).toHaveLength(1);
    expect(screen.getAllByTestId("history-row")).toHaveLength(2);
  });

  // Item 4: the old `limit = 8` sliced entries, so "last 8" could show three
  // workouts. The cap is on workouts now, and the label says so.
  it("caps the list at eight workouts, not eight entries", () => {
    // TWO entries per workout, so the two rules give different answers:
    // slicing entries would show 8 entries across 4 workouts.
    const rows = makeHistoryDrawerRows(
      Array.from({ length: 20 }, (_, i) => ({
        performedName: "Back Squat",
        logId: `log-${String(Math.floor(i / 2)).padStart(2, "0")}`,
        entryIndex: i % 2,
        performedAt: `2026-04-${String(20 - Math.floor(i / 2)).padStart(2, "0")}T14:00:00.000Z`,
        performedDate: `2026-04-${String(20 - Math.floor(i / 2)).padStart(2, "0")}`,
      })),
    );
    renderDrawer({ rows });
    expect(screen.getAllByTestId("history-workout")).toHaveLength(8);
    expect(screen.getAllByTestId("history-row")).toHaveLength(16);
    expect(screen.getByText(/8 workouts · 16 entries · last 8/)).toBeInTheDocument();
  });

  // The invariant. A saved correction changes the current badge and the
  // grouping; it never rewrites what the user logged.
  it("shows the immutable performed label beside the current version badge", () => {
    const rows = makeHistoryDrawerRows([
      {
        performedName: "Squats",
        concreteExerciseId: "barbell-back-squat",
        currentVersionLabel: "Back Squat",
      },
    ]);
    renderDrawer({ rows });
    const row = screen.getByTestId("history-row");
    expect(within(row).getByText("Squats")).toBeInTheDocument();
    expect(within(row).getByTestId("history-row-current-version")).toHaveTextContent("Back Squat");
  });

  it("does not repeat the current version badge when it matches what was logged", () => {
    const rows = makeHistoryDrawerRows([
      {
        performedName: "Back Squat",
        concreteExerciseId: "barbell-back-squat",
        currentVersionLabel: "Back Squat",
      },
    ]);
    renderDrawer({ rows });
    expect(screen.queryByTestId("history-row-current-version")).not.toBeInTheDocument();
  });

  // Item 12: a row can legitimately carry no set labels and zero volume — an
  // entry whose `sets` was present but unreadable. A blank line reads as a
  // rendering bug and invites the user to delete real data.
  it("marks a row whose sets could not be read instead of rendering a blank line", () => {
    const rows = makeHistoryDrawerRows([
      { performedName: "Back Squat", sets: [], volumeLb: 0 },
    ]);
    renderDrawer({ rows });
    expect(screen.getByText("sets could not be read")).toBeInTheDocument();
  });

  it("does not mark a note-only row as unreadable", () => {
    const rows = makeHistoryDrawerRows([
      { performedName: "Back Squat", sets: [], volumeLb: 0, note: "shoulder felt off, skipped" },
    ]);
    renderDrawer({ rows });
    expect(screen.getByText("shoulder felt off, skipped")).toBeInTheDocument();
    expect(screen.queryByText("sets could not be read")).not.toBeInTheDocument();
  });

  // Item 9 / spec ~491: a family surface shows no PR, best set, or trend.
  it("shows no family-wide best set or trend", () => {
    renderDrawer();
    expect(screen.queryByText(/best/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trend/i)).not.toBeInTheDocument();
  });

  it("shows the per-workout volume", () => {
    renderDrawer({
      rows: makeHistoryDrawerRows([
        { performedName: "Back Squat", logId: "log-a", volumeLb: 1125, sets: ["225x5"] },
        { performedName: "Back Squat", logId: "log-a", entryIndex: 1, performedAt: "2026-04-20T14:00:00.000Z", performedDate: "2026-04-20", volumeLb: 555, sets: ["185x3"] },
      ]),
    });
    expect(screen.getByText("1,680")).toBeInTheDocument();
  });

  it("hides the volume label when a workout has no volume", () => {
    renderDrawer({
      rows: makeHistoryDrawerRows([{ performedName: "Holds", sets: ["40s hold"], volumeLb: 0 }]),
    });
    expect(screen.queryByText(/^vol$/i)).not.toBeInTheDocument();
    expect(screen.getByText("40s hold")).toBeInTheDocument();
  });

  it("renders raw-text set values as pills", () => {
    renderDrawer({
      rows: makeHistoryDrawerRows([
        { performedName: "Holds", sets: ["2.5kg x10", "40s hold"], volumeLb: 0 },
      ]),
    });
    expect(screen.getByText("2.5kg x10")).toBeInTheDocument();
    expect(screen.getByText("40s hold")).toBeInTheDocument();
  });

  it("shows the empty state when there are no rows", () => {
    renderDrawer({ rows: [] });
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by version")).not.toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = jest.fn();
    renderDrawer({ onClose });
    await userEvent.click(screen.getByTestId("history-drawer-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  // Item 17: `ExerciseHistoryRow.performedDate` is typed `string` but
  // `historyProjection.ts:317` derives it from stored data, and the drawer has
  // no error boundary above it — `localYmd.split is not a function` unwound the
  // whole day page rather than spoiling one row.
  it("renders every row when a performedDate is not a string", () => {
    const corrupt = [
      { performedName: "Back Squat", logId: "l1", performedDate: 7, sets: ["100x5"] },
      { performedName: "Back Squat", logId: "l2", performedDate: {}, sets: ["110x5"] },
      { performedName: "Back Squat", logId: "l3", performedDate: null, sets: ["120x5"] },
    ] as unknown as Array<Partial<ExerciseHistoryRow> & Pick<ExerciseHistoryRow, "performedName">>;
    renderDrawer({ rows: makeHistoryDrawerRows(corrupt) });
    expect(screen.getByText("100x5")).toBeInTheDocument();
    expect(screen.getByText("110x5")).toBeInTheDocument();
    expect(screen.getByText("120x5")).toBeInTheDocument();
  });

  // Item 7: a version key can contain `#` (`slot:<id>#<name>`, `name:<n>#<n>`),
  // which is invalid unescaped in a CSS selector and truncates a URL. It must
  // still be selectable in the filter.
  it("filters on a version key containing a '#'", async () => {
    const user = userEvent.setup();
    const rows = makeHistoryDrawerRows([
      { performedName: "Copenhagen Plank", versionKey: "name:copenhagen plank#copenhagen plank", sets: ["30s"] },
      { performedName: "Back Squat", concreteExerciseId: "barbell-back-squat", sets: ["225x5"] },
    ]);
    renderDrawer({ rows });
    await user.selectOptions(
      screen.getByLabelText("Filter by version"),
      "name:copenhagen plank#copenhagen plank",
    );
    const visible = screen.getAllByTestId("history-row");
    expect(visible).toHaveLength(1);
    expect(within(visible[0]).getByText("Copenhagen Plank")).toBeInTheDocument();
  });

  it("offers a correction for a row the catalogue could not resolve", async () => {
    const user = userEvent.setup();
    const onCorrect = jest.fn();
    const rows = makeHistoryDrawerRows([
      { performedName: "Copenhagen Plank", versionKey: "name:copenhagen plank#copenhagen plank" },
    ]);
    renderDrawer({ rows, onCorrect });
    await user.click(screen.getByRole("button", { name: /fix .*Copenhagen Plank/i }));
    expect(onCorrect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "normalized-name", value: "Copenhagen Plank" }),
    );
  });

  it("offers no correction affordance for a resolved row", () => {
    renderDrawer({ onCorrect: jest.fn() });
    expect(screen.queryByRole("button", { name: /^fix /i })).not.toBeInTheDocument();
  });
  // Item 11: two distinct logs sharing an id is out of contract and still open,
  // and two logs whose ids we cannot read at all are preserved by `appDb`
  // deliberately. Neither may collapse two workouts into one block — coercing
  // the id to text would make every unreadable id `"[object Object]"` and
  // undercount what the user actually did.
  it("keeps two workouts apart when neither log id is readable", () => {
    const rows = [
      { performedName: "Back Squat", logId: {}, sets: ["225x5"], performedDate: "2026-04-20", performedAt: "2026-04-20T14:00:00.000Z" },
      { performedName: "Back Squat", logId: {}, sets: ["215x5"], performedDate: "2026-04-13", performedAt: "2026-04-13T14:00:00.000Z" },
    ] as unknown as Array<Partial<ExerciseHistoryRow> & Pick<ExerciseHistoryRow, "performedName">>;
    renderDrawer({ rows: makeHistoryDrawerRows(rows) });
    expect(screen.getAllByTestId("history-workout")).toHaveLength(2);
    expect(screen.getByText("2 workouts · 2 entries")).toBeInTheDocument();
  });

  // The correction is about the token the log actually holds. Using the current
  // label instead would key the override on a name the user never typed, so the
  // correction would not resolve the row it was made from.
  it("corrects an unresolved row on what was logged, not on the current label", async () => {
    const user = userEvent.setup();
    const onCorrect = jest.fn();
    const rows = makeHistoryDrawerRows([
      {
        performedName: "Sled Push Ladder Thing",
        versionKey: "name:sled push ladder thing#sled push ladder thing",
        currentVersionLabel: "Sled Push",
      },
    ]);
    renderDrawer({ rows, onCorrect });
    await user.click(screen.getByRole("button", { name: /fix identity for Sled Push Ladder Thing/i }));
    expect(onCorrect).toHaveBeenCalledWith({
      kind: "normalized-name",
      value: "Sled Push Ladder Thing",
    });
  });
});
