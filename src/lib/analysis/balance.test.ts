import { analyzeBalance } from "./balance";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("analyzeBalance", () => {
  it("computes quad:ham ratio for balanced program (lower body present)", () => {
    const result = analyzeBalance(balancedProgram.days);
    // balancedProgram has quads (4+3=7 sets) and hamstrings (3+3=6 sets)
    expect(result.quadHamRatio).not.toBeNull();
    expect(result.quadHamRatio!).toBeGreaterThan(0.5);
    expect(result.quadHamRatio!).toBeLessThan(2.0);
  });

  it("flags balance issues for imbalanced program", () => {
    const result = analyzeBalance(imbalancedProgram.days);
    // The imbalanced program has no lower body — at minimum this must be flagged
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("identifies missing lower body in imbalanced program", () => {
    const result = analyzeBalance(imbalancedProgram.days);
    expect(result.warnings.some((w) => w.message.toLowerCase().includes("lower"))).toBe(true);
  });

  it("reports movement patterns structure", () => {
    const result = analyzeBalance(balancedProgram.days);
    // Without canonicalExerciseId in fixtures, catalog lookup returns undefined
    // and all movement patterns will be missing (patterns come only from catalog data)
    expect(Array.isArray(result.movementPatternsCovered)).toBe(true);
    expect(Array.isArray(result.movementPatternsMissing)).toBe(true);
    expect(result.movementPatternsCovered.length + result.movementPatternsMissing.length).toBe(6);
  });
});
