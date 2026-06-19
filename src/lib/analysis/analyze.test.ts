import { analyzeProgram } from "./analyze";
import { balancedProgram, imbalancedProgram, multiWeekProgram } from "./fixtures";
import type { ProgramDocument } from "@/lib/programs/types";

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

  it("does not emit below-maintenance warnings for untrained muscles", () => {
    const result = analyzeProgram(imbalancedProgram);
    const zeroSetWarnings = result.warnings.filter((w) => /0 sets\/week/.test(w.message));
    expect(zeroSetWarnings).toHaveLength(0);
  });

  it("uses median weekly volume across weeks, not sum or max", () => {
    // A program where week1 has 4 chest sets and week2 has 2 chest sets.
    // Median of [4, 2] sorted = [2, 4] → 3.0. Max would be 4, sum would be 6.
    const twoWeekProgram: ProgramDocument = {
      id: "program-test", title: "Test", source: "import", active: true,
      overrides: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
      days: [
        {
          id: "d1", dayNumber: 1, weekNumber: 1, title: "W1",
          sections: [{ id: "s1", type: "strength", name: "Main", groups: [{ id: "g1", type: "single", exercises: [
            { id: "e1", name: "Bench Press", sets: 4, reps: "8", tags: { primary: ["chest"], secondary: [], incidental: [], modifiers: [] } }
          ]}]}]
        },
        {
          id: "d2", dayNumber: 1, weekNumber: 2, title: "W2",
          sections: [{ id: "s2", type: "strength", name: "Main", groups: [{ id: "g2", type: "single", exercises: [
            { id: "e2", name: "Bench Press", sets: 2, reps: "8", tags: { primary: ["chest"], secondary: [], incidental: [], modifiers: [] } }
          ]}]}]
        },
      ]
    };
    const result = analyzeProgram(twoWeekProgram);
    const chestVolume = result.muscleVolumes.find((m) => m.muscle === "chest");
    expect(chestVolume?.effectiveSets).toBeCloseTo(3.0, 1); // median of [2, 4], not max=4 or sum=6
  });

  it("uses the typical (median) week, not the peak, for weekly volume", () => {
    // multiWeekProgram bench (chest primary) sets per week: 3, 4, 5, 2 → sorted [2,3,4,5] → median 3.5; max would be 5.
    const result = analyzeProgram(multiWeekProgram);
    const chest = result.muscleVolumes.find((m) => m.muscle === "chest");
    expect(chest?.effectiveSets).toBeCloseTo(3.5, 1);
  });
});
