import { getDb } from "./appDb";

export type ExerciseMetricsDocument = {
  exerciseId: string;
  lastPerformedAt: string;
  totalSessions: number;
  totalSets: number;
  recentLoads: number[];
};

export const metricsRepo = {
  async get(exerciseId: string): Promise<ExerciseMetricsDocument | undefined> {
    return (await getDb()).get("metrics", exerciseId);
  },

  async save(doc: ExerciseMetricsDocument): Promise<void> {
    await (await getDb()).put("metrics", doc);
  },

  async list(): Promise<ExerciseMetricsDocument[]> {
    return (await getDb()).getAll("metrics");
  },
};
