import { trackWorkoutEvent } from "./analyticsSeam";
import type { WorkoutSavedEvent } from "./events";

describe("trackWorkoutEvent", () => {
  it("accepts a WorkoutSavedEvent without throwing", async () => {
    const event: WorkoutSavedEvent = {
      type: "workout_saved",
      programId: "prog-1",
      dayId: "day-1",
      performedAt: new Date().toISOString(),
      exerciseCount: 4,
      totalSets: 12,
      completedSets: 10,
    };
    await expect(trackWorkoutEvent(event)).resolves.toBeUndefined();
  });
});
