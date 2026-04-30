import { countWeeklyVolume, scoreVolume } from "./volume";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("countWeeklyVolume", () => {
  it("counts tiered volume for a balanced program (week 1)", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    // Bench Press (4 sets): chest=4×1.0, front_delts=4×1.0
    // Incline DB Press (4 sets): chest=4×1.0, front_delts=4×1.0
    // Total chest from primary across Upper A + Upper B: 4+4=8
    expect(volumes.get("chest")).toBeGreaterThanOrEqual(8);
  });

  it("counts secondary muscles at 0.5 weight", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    // Triceps gets direct work plus secondary from pressing
    const triceps = volumes.get("triceps")!;
    expect(triceps).toBeGreaterThan(6);
    expect(triceps).toBeLessThan(15);
  });

  it("returns zero for muscle groups not trained", () => {
    const volumes = countWeeklyVolume(imbalancedProgram.days, 1);
    expect(volumes.get("quads") ?? 0).toBe(0);
    expect(volumes.get("hamstrings") ?? 0).toBe(0);
  });

  it("handles missing week number by treating all days as week 1", () => {
    const volumes = countWeeklyVolume(balancedProgram.days);
    expect(volumes.get("chest")).toBeGreaterThan(0);
  });
});

describe("scoreVolume", () => {
  it("flags imbalanced program with chest above MAV", () => {
    const volumes = countWeeklyVolume(imbalancedProgram.days, 1);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(chest.severity).toBe("red");
  });

  it("scores balanced program muscles in green range", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(["green", "yellow"]).toContain(chest.severity);
  });
});
