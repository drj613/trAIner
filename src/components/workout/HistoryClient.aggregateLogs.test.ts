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
