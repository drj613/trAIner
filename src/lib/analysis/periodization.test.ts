import { analyzePeriodization, heavySetShare } from "./periodization";
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

type ExSpec = { name: string; sets: number; reps: string; load?: string };

function weekOf(weekNumber: number, exercises: ExSpec[]): ProgramDay {
  return {
    id: `w${weekNumber}`, dayNumber: 1, weekNumber, title: `Week ${weekNumber}`,
    sections: [{
      id: `s${weekNumber}`, type: "strength", name: "Main",
      groups: exercises.map((e, i) => ({
        id: `g${weekNumber}-${i}`, type: "single" as const,
        exercises: [{
          id: `e${weekNumber}-${i}`, name: e.name, sets: e.sets, reps: e.reps, load: e.load,
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      })),
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

  it("classifies a peak week as peak when heavy SETS dominate but heavy exercises are a minority", () => {
    const build = (wk: number) => weekOf(wk, [
      { name: "Back Squat", sets: 5, reps: "5", load: "75%" },
      { name: "Bench Press", sets: 5, reps: "5", load: "72%" },
      { name: "Leg Press", sets: 4, reps: "10-12" },
      { name: "Leg Curl", sets: 4, reps: "10-12" },
      { name: "Calf Raise", sets: 4, reps: "12-15" },
    ]);
    const peakWeek = weekOf(4, [
      // 15 total sets (build weeks have 22, so volume "dropped": 15 <= 22×0.7).
      // 9 heavy sets across 2 of 5 exercises: 40% of exercises (old code says
      // deload) but 60% of sets (new code says peak).
      { name: "Back Squat", sets: 5, reps: "1-2", load: "92%" },
      { name: "Bench Press", sets: 4, reps: "1-2", load: "90%" },
      { name: "Leg Press", sets: 2, reps: "10-12" },
      { name: "Leg Curl", sets: 2, reps: "10-12" },
      { name: "Calf Raise", sets: 2, reps: "12-15" },
    ]);
    const r = analyzePeriodization([build(1), build(2), build(3), peakWeek]);
    expect(r.peakDetected).toBe(true);
    expect(r.deloadDetected).toBe(false);
  });

  it("classifies light triples in a final week as a deload, not a peak", () => {
    const build = (wk: number, sets: number) => weekOf(wk, [
      { name: "Back Squat", sets, reps: "5", load: "75%" },
      { name: "Bench Press", sets, reps: "5", load: "72%" },
    ]);
    const deloadWeek = weekOf(4, [
      // explicit 60% load must veto the "reps <= 3 means heavy" fallback
      { name: "Back Squat", sets: 3, reps: "3", load: "60%" },
      { name: "Bench Press", sets: 3, reps: "3", load: "60%" },
    ]);
    const r = analyzePeriodization([build(1, 5), build(2, 5), build(3, 5), deloadWeek]);
    expect(r.deloadDetected).toBe(true);
    expect(r.peakDetected).toBe(false);
  });
});

describe("heavySetShare", () => {
  it("returns the set-weighted share of heavy work", () => {
    const week = weekOf(1, [
      { name: "Back Squat", sets: 6, reps: "1-2", load: "92%" },
      { name: "Leg Press", sets: 2, reps: "10-12" },
    ]);
    expect(heavySetShare([week])).toBe(0.75);
  });

  it("returns 0 for an empty program", () => {
    expect(heavySetShare([])).toBe(0);
  });
});
