import { deleteDB } from "idb";
import { DB_NAME, resetDbConnection } from "./appDb";
import { metricsRepo } from "./metricsRepo";
import type { ExerciseMetricsDocument } from "./metricsRepo";

describe("metricsRepo", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
  });

  it("saves and retrieves metrics for an exercise", async () => {
    const doc: ExerciseMetricsDocument = {
      exerciseId: "pull-up",
      lastPerformedAt: "2026-04-01T10:00:00.000Z",
      totalSessions: 5,
      totalSets: 20,
      recentLoads: [60, 62.5, 65],
    };
    await metricsRepo.save(doc);
    const result = await metricsRepo.get("pull-up");
    expect(result?.totalSessions).toBe(5);
    expect(result?.recentLoads).toEqual([60, 62.5, 65]);
  });

  it("returns undefined for unknown exercise", async () => {
    const result = await metricsRepo.get("ghost-exercise");
    expect(result).toBeUndefined();
  });

  it("overwrites existing metrics on re-save", async () => {
    const first: ExerciseMetricsDocument = {
      exerciseId: "bench-press",
      lastPerformedAt: "2026-03-01T10:00:00.000Z",
      totalSessions: 1,
      totalSets: 3,
      recentLoads: [80],
    };
    const second: ExerciseMetricsDocument = { ...first, totalSessions: 2, totalSets: 6 };
    await metricsRepo.save(first);
    await metricsRepo.save(second);
    const result = await metricsRepo.get("bench-press");
    expect(result?.totalSessions).toBe(2);
  });
});
