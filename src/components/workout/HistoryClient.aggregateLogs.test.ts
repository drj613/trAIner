import { aggregateLogs } from "./HistoryClient";
import { makeIdentityContext } from "@/lib/catalog/identity.testFixtures";
import { projectExerciseHistory } from "@/lib/workout/historyProjection";
import type { WorkoutLogDocument } from "@/lib/programs/types";

describe("aggregateLogs date attribution", () => {
  it("dates a session by its local day, not the UTC date of performedAt", () => {
    // 2026-05-02T02:00Z is still 2026-05-01 in America/New_York (jest TZ pin).
    const logs: WorkoutLogDocument[] = [{
      id: "l1", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z",
      entries: [{
        exerciseId: "bench", exerciseName: "Bench",
        sets: [{ setNumber: 1, weight: 60, reps: 10 }],
      }],
    }];
    const summaries = aggregateLogs(logs);
    // lastDate is formatted as "MM/DD" from the local YYYY-MM-DD date.
    expect(summaries[0].lastDate).toBe("05/01");
  });

  it("prefers explicit performedDate when present", () => {
    const logs: WorkoutLogDocument[] = [{
      id: "l2", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z", performedDate: "2026-05-01",
      entries: [{
        exerciseId: "bench", exerciseName: "Bench",
        sets: [{ setNumber: 1, weight: 60, reps: 10 }],
      }],
    }];
    expect(aggregateLogs(logs)[0].lastDate).toBe("05/01");
  });
});

// The all-time summary is moving onto the shared lossless projection (Task 13).
// These lock the two boundaries together now: same local-day attribution, and
// no entry lost when one workout logs the same exercise twice.
describe("shared projection boundary", () => {
  const context = makeIdentityContext();

  it("attributes a session to the same local day as the shared projection", () => {
    const logs: WorkoutLogDocument[] = [{
      id: "l3", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z",
      entries: [{
        exerciseId: "bench", exerciseName: "Bench",
        sets: [{ setNumber: 1, weight: 60, reps: 10 }],
      }],
    }];
    expect(aggregateLogs(logs)[0].lastDate).toBe("05/01");
    expect(projectExerciseHistory(logs, context).rows[0].performedDate).toBe("2026-05-01");
  });

  it("keeps both entries of a twice-logged exercise while summarizing one workout", () => {
    const logs: WorkoutLogDocument[] = [{
      id: "l4", programId: "p1", dayId: "d1",
      performedAt: "2026-05-03T14:00:00.000Z", performedDate: "2026-05-03",
      entries: [
        { exerciseId: "bench", exerciseName: "Bench", sets: [{ setNumber: 1, weight: 135, reps: 5 }] },
        { exerciseId: "bench", exerciseName: "Bench", sets: [{ setNumber: 1, weight: 115, reps: 10 }] },
      ],
    }];
    // One exercise row on the index, either side of the migration.
    expect(aggregateLogs(logs)).toHaveLength(1);

    const projection = projectExerciseHistory(logs, context);
    expect(projection.rows.map((row) => row.entryIndex)).toEqual([0, 1]);
    // `slot:bench#bench` — the slot id qualified by the normalized performed
    // name, so two different exercises swapped into one slot stay apart.
    expect(projection.versionSummaries.get("slot:bench#bench")).toMatchObject({
      sessionCount: 1,
      entryCount: 2,
      sessionVolumesLb: [135 * 5 + 115 * 10],
    });
  });
});

// ─── Unreadable stored shapes ────────────────────────────────────────────────

describe("aggregateLogs on logs it cannot fully read", () => {
  // The shipped all-time History page renders straight from this function, so a
  // throw here means the user sees no history at all — the worst outcome in a
  // local-first app, where IndexedDB holds their only copy.
  // `src/lib/storage/appDb.ts:186-195` preserves every shape below on purpose.
  const goodLog: WorkoutLogDocument = {
    id: "l-good", programId: "p1", dayId: "d1",
    performedAt: "2026-06-01T14:00:00.000Z", performedDate: "2026-06-01",
    entries: [{
      exerciseId: "bench", exerciseName: "Bench", sets: [{ setNumber: 1, weight: 135, reps: 5 }],
    }],
  };
  const badLog = (over: Record<string, unknown>): WorkoutLogDocument => ({
    id: "l-bad", programId: "p1", dayId: "d1",
    performedAt: "2026-06-02T14:00:00.000Z", performedDate: "2026-06-02", ...over,
  } as unknown as WorkoutLogDocument);

  it.each([
    ["entries is undefined", badLog({})],
    ["entries is null", badLog({ entries: null })],
    ["entries is a string", badLog({ entries: "corrupt" })],
    ["entries holds null", badLog({ entries: [null] })],
    ["an entry's sets is a string", badLog({ entries: [{ exerciseId: "a", sets: "corrupt" }] })],
    ["an entry's sets is undefined", badLog({ entries: [{ exerciseId: "a" }] })],
    ["an entry's sets holds null", badLog({ entries: [{ exerciseId: "a", sets: [null] }] })],
    ["performedDate is a number", badLog({
      performedDate: 7,
      entries: [{ exerciseId: "a", sets: [{ setNumber: 1, weight: 1, reps: 1 }] }],
    })],
  ])("still lists the readable workout when %s", (_label, bad) => {
    const summaries = aggregateLogs([bad, goodLog]);
    const bench = summaries.find((s) => s.exerciseId === "bench");
    expect(bench).toMatchObject({
      name: "Bench", sessions: 1, lastDate: "06/01", best: "135×5", volumes: [675],
    });
    // No phantom row invented from a log we cannot read. Without this, iterating
    // a string `entries` walks its characters and yields a summary with no id.
    expect(summaries.map((s) => s.exerciseId as string | undefined)).not.toContain(undefined);
  });

  it("shows a placeholder rather than a blank cell when the date is unreadable", () => {
    // A blank date reads as a rendering bug and invites the user to delete real
    // data; "—" says plainly that we have nothing to show there.
    //
    // FIXTURE STRENGTHENED in fix round 3 (assertion unchanged). It previously
    // set only `performedDate: 7` and left `performedAt` readable, so the date
    // was not in fact unreadable — `logLocalDate` now recovers it from
    // `performedAt` (see the test below). Both fields are corrupt here so the
    // condition the name describes actually holds.
    const summaries = aggregateLogs([badLog({
      performedAt: 7,
      performedDate: 7,
      entries: [{ exerciseId: "a", exerciseName: "Mystery", sets: [{ setNumber: 1, reps: 5 }] }],
    })]);
    expect(summaries[0].lastDate).toBe("—");
  });

  // An unreadable `performedDate` is not a lost date. The v7 migration
  // backfilled `performedDate` *from* `performedAt`, so `performedAt` is the
  // authoritative value and recovering the real day beats showing a placeholder.
  it("recovers the day from performedAt when performedDate is unreadable", () => {
    const summaries = aggregateLogs([badLog({
      performedDate: 7,
      entries: [{ exerciseId: "a", exerciseName: "Mystery", sets: [{ setNumber: 1, reps: 5 }] }],
    })]);
    expect(summaries[0].lastDate).toBe("06/02");
  });

  it("keeps the readable sets of an entry that also holds an unreadable one", () => {
    const summaries = aggregateLogs([badLog({
      entries: [{
        exerciseId: "a", exerciseName: "Mystery",
        sets: [{ setNumber: 1, weight: 100, reps: 5 }, null],
      }],
    })]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ lastSets: ["100×5"], best: "100×5", volumes: [500] });
  });

  it("names a row from an unreadable exercise name as text rather than throwing it away", () => {
    const summaries = aggregateLogs([badLog({
      entries: [{ exerciseId: "slot-7", exerciseName: 7, sets: [{ setNumber: 1, reps: 5 }] }],
    })]);
    expect(summaries).toHaveLength(1);
    expect(typeof summaries[0].name).toBe("string");
    expect(summaries[0].name).toBe("slot-7");
  });
});
