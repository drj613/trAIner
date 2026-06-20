import { analyzePeriodization } from "./periodization";
import { balancedProgram, multiWeekProgram } from "./fixtures";
import type { ProgramDay } from "@/lib/programs/types";

function squatWeek(weekNumber: number, sets: number, reps: string, load: string): ProgramDay {
  return {
    id: `w${weekNumber}`, dayNumber: 1, weekNumber, title: `Week ${weekNumber}`,
    sections: [{
      id: `s${weekNumber}`, type: "strength", name: "Main",
      groups: [{
        id: `g${weekNumber}`, type: "single",
        exercises: [{
          id: `e${weekNumber}`, name: "Back Squat", sets, reps, load,
          tags: { primary: ["quads", "glutes"], secondary: ["hamstrings"], incidental: [], modifiers: [] },
        }],
      }],
    }],
  };
}

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

  it("classifies a heavy low-volume final week as a peak, not a deload", () => {
    const peaking: ProgramDay[] = [
      squatWeek(1, 6, "5", "75%"),
      squatWeek(2, 6, "4", "80%"),
      squatWeek(3, 5, "3", "85%"),
      squatWeek(4, 2, "1-2", "92%"),
    ];
    const r = analyzePeriodization(peaking);
    expect(r.peakDetected).toBe(true);
    expect(r.deloadDetected).toBe(false);
    expect(r.warnings.some((w) => /no deload/i.test(w.message))).toBe(false);
  });

  it("does not warn 'static' when sets are flat but intensity is rising", () => {
    const linear: ProgramDay[] = [
      squatWeek(1, 4, "8", "70%"),
      squatWeek(2, 4, "6", "78%"),
      squatWeek(3, 4, "4", "86%"),
    ];
    const r = analyzePeriodization(linear);
    expect(r.volumePattern).toBe("static");
    expect(r.intensityProgression).toBe("rising");
    expect(r.warnings.some((w) => /flat across all weeks|progressive overload/i.test(w.message))).toBe(false);
  });
});
