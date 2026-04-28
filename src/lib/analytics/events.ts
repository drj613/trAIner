import type { ID, ISODate } from "@/lib/programs/types";

export type WorkoutSavedEvent = {
  type: "workout_saved";
  programId: ID;
  dayId: ID;
  performedAt: ISODate;
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
};

export type WorkoutEvent = WorkoutSavedEvent;
