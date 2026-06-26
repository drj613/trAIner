import { aggregateLogs } from "./HistoryClient";
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
