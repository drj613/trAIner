import { analyzePeriodization } from "./periodization";
import { balancedProgram, multiWeekProgram } from "./fixtures";

describe("analyzePeriodization", () => {
  it("detects single-week program as static", () => {
    const result = analyzePeriodization(balancedProgram.days);
    expect(result.weeksDetected).toBe(1);
    expect(result.volumePattern).toBe("static");
  });

  it("detects multi-week program with 4 weeks", () => {
    const result = analyzePeriodization(multiWeekProgram.days);
    expect(result.weeksDetected).toBe(4);
    expect(["increasing", "wave"]).toContain(result.volumePattern);
  });

  it("detects deload week", () => {
    const result = analyzePeriodization(multiWeekProgram.days);
    expect(result.deloadDetected).toBe(true);
  });

  it("warns about missing deload in single-week program", () => {
    const result = analyzePeriodization(balancedProgram.days);
    expect(result.warnings.some((w) => w.message.toLowerCase().includes("deload"))).toBe(true);
  });
});
