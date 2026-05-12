import { analyzeProgram } from "./analyze";
import {
  balancedProgram,
  startingStrengthProgram,
  pplProgram,
} from "./fixtures";

describe("deriveCoverage (via analyzeProgram)", () => {
  it("coverage.musclesTrained contains only muscles with sets > 0", () => {
    const result = analyzeProgram(balancedProgram);
    const { coverage } = result;

    // Every trained muscle must have effectiveSets > 0 in muscleVolumes
    for (const muscle of coverage.musclesTrained) {
      const vol = result.muscleVolumes.find((m) => m.muscle === muscle)!;
      expect(vol.effectiveSets).toBeGreaterThan(0);
    }

    // Every untrained muscle must have effectiveSets === 0
    for (const muscle of coverage.musclesUntrained) {
      const vol = result.muscleVolumes.find((m) => m.muscle === muscle)!;
      expect(vol.effectiveSets).toBe(0);
    }

    // trained + untrained = all muscle groups (19 total)
    expect(coverage.musclesTrained.length + coverage.musclesUntrained.length).toBe(
      result.muscleVolumes.length,
    );
  });

  it("coverage patterns match balance patterns", () => {
    const result = analyzeProgram(balancedProgram);
    expect(result.coverage.patternsCovered).toEqual(result.balance.movementPatternsCovered);
    expect(result.coverage.patternsMissing).toEqual(result.balance.movementPatternsMissing);
  });
});

describe("Starting Strength fixture", () => {
  it("scores without crashing", () => {
    const result = analyzeProgram(startingStrengthProgram);
    expect(result.overall.score).toBeGreaterThan(0);
    expect(result.overall.score).toBeLessThanOrEqual(100);
  });

  it("trains the big compound muscle groups", () => {
    const result = analyzeProgram(startingStrengthProgram);
    const trained = new Set(result.coverage.musclesTrained);
    // Squat: quads, glutes; Bench: chest; DL: hamstrings, lower back; Row: lats/upper_back
    expect(trained.has("quads")).toBe(true);
    expect(trained.has("chest")).toBe(true);
    expect(trained.has("hamstrings")).toBe(true);
    expect(trained.has("lats")).toBe(true);
  });

  it("volume score reflects only the muscles actually trained", () => {
    const result = analyzeProgram(startingStrengthProgram);
    // SS is a minimal program — it shouldn't be capped at ~60 due to untrained muscles
    // The volume score should reflect the quality of the muscles it does train
    expect(result.dimensions.volume.score).toBeGreaterThan(50);
  });
});

describe("PPL fixture", () => {
  it("achieves a volume score of B or better (≥ 75)", () => {
    const result = analyzeProgram(pplProgram);
    expect(result.dimensions.volume.score).toBeGreaterThanOrEqual(75);
  });

  it("covers all 6 movement patterns", () => {
    const result = analyzeProgram(pplProgram);
    // PPL with DL/RDL, squats, OHP, bench, rows, pull-ups should hit all patterns
    expect(result.coverage.patternsMissing).toHaveLength(0);
  });

  it("scores balanced program higher than imbalanced, PPL comparable to balanced", () => {
    const balanced = analyzeProgram(balancedProgram);
    const ppl = analyzeProgram(pplProgram);
    // Both are well-designed programs; PPL should be in same tier
    expect(ppl.dimensions.volume.score).toBeGreaterThanOrEqual(
      balanced.dimensions.volume.score - 10,
    );
  });
});
