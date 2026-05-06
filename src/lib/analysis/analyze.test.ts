import { analyzeProgram } from "./analyze";
import { balancedProgram, imbalancedProgram, multiWeekProgram } from "./fixtures";

describe("analyzeProgram", () => {
  it("returns a complete AnalysisResult for a balanced program", () => {
    const result = analyzeProgram(balancedProgram);
    expect(result.overall.grade).toBeTruthy();
    expect(result.overall.score).toBeGreaterThanOrEqual(0);
    expect(result.overall.score).toBeLessThanOrEqual(100);
    expect(result.muscleVolumes.length).toBeGreaterThan(0);
    expect(result.sessions.length).toBe(3);
  });

  it("scores balanced program higher than imbalanced", () => {
    const balanced = analyzeProgram(balancedProgram);
    const imbalanced = analyzeProgram(imbalancedProgram);
    expect(balanced.overall.score).toBeGreaterThan(imbalanced.overall.score);
  });

  it("collects warnings from all dimensions", () => {
    const result = analyzeProgram(imbalancedProgram);
    expect(result.warnings.length).toBeGreaterThan(0);
    const dimensions = new Set(result.warnings.map((w) => w.dimension));
    expect(dimensions.size).toBeGreaterThan(1);
  });

  it("handles multi-week programs", () => {
    const result = analyzeProgram(multiWeekProgram);
    expect(result.periodization.weeksDetected).toBe(4);
    expect(result.periodization.deloadDetected).toBe(true);
  });
});
