import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { logRepo } from "@/lib/storage/logRepo";
import {
  normalizationOverrideKey,
  normalizationOverrideRepo,
} from "@/lib/storage/normalizationOverrideRepo";
import { programRepo } from "@/lib/storage/programRepo";
import {
  HATFIELD_ID,
  hatfieldJoinsSquat,
  logs,
  program,
  renderIdentityHarness,
} from "./ExerciseIdentityIntegration.testFixtures";

jest.mock("@/lib/analytics/analyticsSeam", () => ({
  trackWorkoutEvent: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Task 14's live-invalidation evidence. Four consumers, one provider, one
 * committed correction, real `fake-indexeddb` underneath all of it.
 *
 * The three claims it exists to settle, and how each is made falsifiable:
 *
 * 1. **One correction reaches every surface.** Not "the provider republished" —
 *    the all-time index goes from two movements to one, the library shows a
 *    `Squat` family it did not have, and the Today drawer gains a set it was
 *    not showing. Three independently-computed observations of one write.
 * 2. **Exactly one refresh.** The provider's generation counter is read from
 *    the DOM before and after, and the number of stored reads is counted. One
 *    is 1→2 and two reads; three would be 1→4 and six. The assertion is on the
 *    exact numbers, so it cannot be satisfied by "something happened".
 * 3. **Logs do not reload.** `logRepo.list` is spied and its count frozen
 *    across the correction. The count is also asserted non-zero, because a
 *    frozen count of zero would mean the surfaces never read logs at all and
 *    the whole test would be measuring an empty page.
 */
describe("exercise identity — one correction across every consumer", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await programRepo.save(program);
    for (const log of logs) await logRepo.save(log);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDbConnection();
  });

  async function waitForHarness() {
    renderIdentityHarness();
    await waitFor(() => expect(screen.getByTestId("identity-loaded")).toHaveTextContent("true"));
    await screen.findByText(/movements ·/);
    await screen.findByRole("heading", { level: 1, name: "Lower" });
  }

  function allTime() {
    return within(screen.getByTestId("all-time-surface"));
  }

  function library() {
    return within(screen.getByTestId("library-surface"));
  }

  it("regroups analysis, library, all-time history and the Today drawer without reloading logs", async () => {
    const listSpy = jest.spyOn(logRepo, "list");
    const overrideReads = jest.spyOn(normalizationOverrideRepo, "list");
    const user = userEvent.setup();

    await waitForHarness();

    // ── before ───────────────────────────────────────────────────────────────
    // Two movements: Hatfield stands alone because it ships with no family,
    // and the high-bar log is the `Squat` family on its own.
    expect(allTime().getByText(/^2 movements · 2 workouts$/)).toBeInTheDocument();

    // The library finds Hatfield, and it is an ordinary row — there is no
    // family disclosure to open, because it belongs to no family. Muscle
    // sections mount collapsed, so the section is opened the way a user opens
    // it; it keeps that state across the correction below.
    await user.type(library().getByPlaceholderText(/search exercises/i), "hatfield");
    const catalogue = within(library().getByRole("region", { name: "Catalogue" }));
    await user.click(catalogue.getByRole("button", { name: /^quads/ }));
    expect(await catalogue.findByRole("button", { name: /Hatfield Squat/ })).toBeInTheDocument();
    expect(catalogue.queryByRole("button", { name: /^Squat movement, \d+ versions?$/ })).toBeNull();

    // The Today drawer shows the slot's own history and nothing else.
    await user.click(screen.getByRole("button", { name: /history for hatfield squat/i }));
    const drawer = await screen.findByRole("dialog", { name: /history for hatfield squat/i });
    expect(drawer).toHaveTextContent("315x5");
    expect(drawer).not.toHaveTextContent("225x3");

    expect(screen.getByTestId("analysis-metadata")).toHaveTextContent("quads,glutes,adductors");

    const versionBefore = Number(screen.getByTestId("identity-version").textContent);
    const logReadsBefore = listSpy.mock.calls.length;
    const overrideReadsBefore = overrideReads.mock.calls.length;
    expect(logReadsBefore).toBeGreaterThan(0);

    // ── the one write ────────────────────────────────────────────────────────
    await act(async () => {
      await normalizationOverrideRepo.save(hatfieldJoinsSquat);
    });

    // ── after ────────────────────────────────────────────────────────────────
    // All-time collapses to one movement. This is the assertion that cannot be
    // passed by a re-render: the number is recomputed from the same logs.
    await waitFor(() =>
      expect(allTime().getByText(/^1 movements · 2 workouts$/)).toBeInTheDocument(),
    );

    // The library now nests Hatfield under a family row it did not have, and
    // the loose row is gone from the same open section.
    await waitFor(() =>
      expect(catalogue.getByRole("button", { name: /^Squat movement, \d+ versions?$/ })).toBeInTheDocument(),
    );

    // The drawer, still open, gains the high-bar session — same logs, new family.
    await waitFor(() => expect(drawer).toHaveTextContent("225x3"));
    expect(drawer).toHaveTextContent("315x5");

    // Analysis deliberately does NOT move: a correction changes grouping, never
    // what an exercise trains.
    expect(screen.getByTestId("analysis-metadata")).toHaveTextContent("quads,glutes,adductors");

    // ── exactly one refresh, and no log reload ───────────────────────────────
    expect(Number(screen.getByTestId("identity-version").textContent)).toBe(versionBefore + 1);
    expect(overrideReads.mock.calls.length).toBe(overrideReadsBefore + 1);
    expect(listSpy.mock.calls.length).toBe(logReadsBefore);
  }, 30_000);

  it("refreshes the identity context exactly once after a backup restore", async () => {
    // Export a workspace that already contains the correction, then take the
    // correction back out. The file is the only place it now exists, so any
    // regrouping after the restore can only have come from reading the
    // restored store — not from something left behind in memory.
    await normalizationOverrideRepo.save(hatfieldJoinsSquat, { dispatch: false });
    const file = await exportBackup();
    expect(file.normalizationOverrides).toHaveLength(1);
    await normalizationOverrideRepo.remove(
      normalizationOverrideKey("exercise-id", HATFIELD_ID),
      { dispatch: false },
    );

    const listSpy = jest.spyOn(logRepo, "list");
    const overrideReads = jest.spyOn(normalizationOverrideRepo, "list");

    await waitForHarness();
    expect(allTime().getByText(/^2 movements · 2 workouts$/)).toBeInTheDocument();

    const versionBefore = Number(screen.getByTestId("identity-version").textContent);
    const logReadsBefore = listSpy.mock.calls.length;
    const overrideReadsBefore = overrideReads.mock.calls.length;
    expect(logReadsBefore).toBeGreaterThan(0);

    await act(async () => {
      await restoreBackup(file);
    });

    // The restored correction reaches the consumers…
    await waitFor(() =>
      expect(allTime().getByText(/^1 movements · 2 workouts$/)).toBeInTheDocument(),
    );
    // …through exactly one refresh. A restore that published per-store, or
    // published before the commit and again after, would land here as +2 or
    // more; a restore that published nothing would leave it at +0.
    expect(Number(screen.getByTestId("identity-version").textContent)).toBe(versionBefore + 1);
    expect(overrideReads.mock.calls.length).toBe(overrideReadsBefore + 1);
    expect(listSpy.mock.calls.length).toBe(logReadsBefore);
  }, 30_000);
});
