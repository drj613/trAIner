import { scoreVolumeDimension, scorePeriodizationDimension } from "./score";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("scoreVolumeDimension", () => {
  it("scores a balanced program at B or better (≥ 75)", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    const results = scoreVolume(volumes);
    const score = scoreVolumeDimension(results);
    expect(score.score).toBeGreaterThanOrEqual(75);
    expect(["A", "B"]).toContain(score.grade);
  });

  it("does not count untrained muscles against the score", () => {
    // With the filter bug, untrained muscles (adductors, abductors) become red
    // and pull the average down. After the fix, only trained muscles are scored.
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    const results = scoreVolume(volumes);

    const trainedOnly = results.filter((r) => r.effectiveSets > 0);
    const allScore = scoreVolumeDimension(results);
    const trainedScore = scoreVolumeDimension(trainedOnly);

    expect(allScore.score).toBe(trainedScore.score);
  });

  it("keeps imbalanced program scoring below balanced", () => {
    const bVols = countWeeklyVolume(balancedProgram.days, 1);
    const bScore = scoreVolumeDimension(scoreVolume(bVols));

    const iVols = countWeeklyVolume(imbalancedProgram.days, 1);
    const iScore = scoreVolumeDimension(scoreVolume(iVols));

    expect(bScore.score).toBeGreaterThan(iScore.score);
  });
});

it("does not heavily penalize single-week programs", () => {
  const result = {
    weeksDetected: 1,
    volumePattern: "static" as const,
    deloadDetected: false,
    peakDetected: false,
    intensityProgression: "unknown" as const,
    warnings: [{ severity: "yellow" as const, dimension: "periodization", message: "Single-week program" }],
  };
  const score = scorePeriodizationDimension(result);
  expect(score.score).toBeGreaterThanOrEqual(90); // only the -5 yellow warning, no -30
});
