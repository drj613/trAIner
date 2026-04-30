import { analyzeSessions } from "./session";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("analyzeSessions", () => {
  it("counts exercises and sets per day", () => {
    const results = analyzeSessions(balancedProgram.days);
    const upperA = results.find((r) => r.dayId === "day-1")!;
    expect(upperA.exerciseCount).toBe(7);
    expect(upperA.totalSets).toBe(4 + 4 + 3 + 3 + 3 + 3 + 3); // 23
  });

  it("estimates session duration", () => {
    const results = analyzeSessions(balancedProgram.days);
    const upperA = results.find((r) => r.dayId === "day-1")!;
    // (23 sets × 3) + 10 = 79 minutes
    expect(upperA.estimatedMinutes).toBe(23 * 3 + 10);
  });

  it("flags sessions with too many exercises", () => {
    const results = analyzeSessions(imbalancedProgram.days);
    const chestDay = results.find((r) => r.dayId === "day-1")!;
    expect(chestDay.exerciseCount).toBe(11);
    expect(chestDay.warnings.some((w) => w.message.includes("exercises"))).toBe(true);
  });

  it("flags per-muscle volume exceeding session cap", () => {
    const results = analyzeSessions(imbalancedProgram.days);
    const chestDay = results.find((r) => r.dayId === "day-1")!;
    expect(chestDay.warnings.some((w) => w.message.includes("chest"))).toBe(true);
  });
});
