import { inferGoal } from "./goals";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("inferGoal", () => {
  it("infers a training goal from the balanced program", () => {
    const result = inferGoal(balancedProgram.days);
    expect(["strength", "general_fitness", "hypertrophy"]).toContain(result.primary);
    expect(result.fingerprint).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("infers hypertrophy for the imbalanced bro-split program", () => {
    const result = inferGoal(imbalancedProgram.days);
    expect(result.primary).toBe("hypertrophy");
  });

  it("generates a human-readable fingerprint", () => {
    const result = inferGoal(balancedProgram.days);
    expect(result.fingerprint.length).toBeGreaterThan(10);
  });

  it("secondary goal is string or null", () => {
    const result = inferGoal(balancedProgram.days);
    expect(typeof result.secondary === "string" || result.secondary === null).toBe(true);
  });
});
