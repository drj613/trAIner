import { scoreVolumeDimension, scorePeriodizationDimension, computeOverallScore } from "./score";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { balancedProgram, imbalancedProgram } from "./fixtures";
import type { DimensionKey } from "./types";

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

describe("scorePeriodizationDimension (de-double-counted)", () => {
  it("penalizes a missing deload exactly once (no double-count)", () => {
    const result = {
      weeksDetected: 4,
      volumePattern: "wave" as const,
      deloadDetected: false,
      peakDetected: false,
      intensityProgression: "flat" as const,
      warnings: [{ severity: "yellow" as const, dimension: "periodization", message: "No deload week detected — ..." }],
    };
    // -20 for missing deload only; NOT -20 -5.
    expect(scorePeriodizationDimension(result).score).toBe(80);
  });

  it("scores a single-week program at 100 (no periodization penalty)", () => {
    const result = {
      weeksDetected: 1,
      volumePattern: "static" as const,
      deloadDetected: false,
      peakDetected: false,
      intensityProgression: "unknown" as const,
      warnings: [{ severity: "yellow" as const, dimension: "periodization", message: "Single-week program — ..." }],
    };
    expect(scorePeriodizationDimension(result).score).toBe(100);
  });

  it("does not penalize a peak week (peak ≠ missing deload)", () => {
    const result = {
      weeksDetected: 4,
      volumePattern: "wave" as const,
      deloadDetected: false,
      peakDetected: true,
      intensityProgression: "rising" as const,
      warnings: [],
    };
    expect(scorePeriodizationDimension(result).score).toBe(100);
  });
});

describe("computeOverallScore with graded subset", () => {
  const dims = {
    volume:        { name: "Volume",        score: 30, grade: "F" as const },
    session:       { name: "Session",       score: 80, grade: "B" as const },
    balance:       { name: "Balance",       score: 60, grade: "C" as const },
    periodization: { name: "Periodization", score: 40, grade: "D" as const },
  };

  it("renormalizes weights over the graded subset", () => {
    const graded: DimensionKey[] = ["session", "balance"];
    const result = computeOverallScore(dims, graded);
    // (80×0.235 + 60×0.294) / (0.235 + 0.294) = 36.44 / 0.529 = 68.88 → 69
    expect(result.score).toBe(69);
    expect(result.grade).toBe("C");
  });

  it("defaults to all four dimensions (back-compat)", () => {
    const withDefault = computeOverallScore(dims);
    // 30×0.353 + 80×0.235 + 60×0.294 + 40×0.118 = 51.75 → 52 (weights sum to 1.0)
    expect(withDefault.score).toBe(52);
  });
});
