import { analyzePeriodization, heavySetShare } from "./periodization";
import { balancedProgram, multiWeekProgram } from "./fixtures";
import type { ProgramDay, ProgramExercise, SectionType } from "@/lib/programs/types";

function exOf(id: string, overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    id,
    name: overrides.name ?? id,
    sets: overrides.sets,
    reps: overrides.reps,
    load: overrides.load,
    countsTowardVolume: overrides.countsTowardVolume,
    tags: overrides.tags ?? { primary: ["quads"], secondary: [], incidental: [], modifiers: [] },
  };
}

function dayWithSections(
  id: string,
  weekNumber: number,
  sections: { type: SectionType; exercises: ProgramExercise[] }[],
): ProgramDay {
  return {
    id,
    dayNumber: 1,
    weekNumber,
    title: `Week ${weekNumber}`,
    sections: sections.map((s, i) => ({
      id: `${id}-s${i}`,
      type: s.type,
      name: s.type,
      groups: [{ id: `${id}-g${i}`, type: "single", exercises: s.exercises }],
    })),
  };
}

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

describe("periodization gates warmup/non-volume sections during traversal (7.1)", () => {
  it("does not let warmup ramp singles inflate heavySetShare, avg%, heavy-week classification, or peak detection", () => {
    const build = (wk: number) =>
      dayWithSections(`d${wk}`, wk, [
        { type: "strength", exercises: [exOf(`sq${wk}`, { name: "Back Squat", sets: 6, reps: "5", load: "70%" })] },
      ]);
    // Final week: light working sets (not heavy) + a warmup ramp that IS
    // heavy by the reps<=3-with-no-explicit-%/pct>=85 heuristics. If the
    // warmup ramp counts, it flips this week from "deload" to "peak".
    const finalWeek = dayWithSections("d4", 4, [
      { type: "strength", exercises: [exOf("sq4", { name: "Back Squat", sets: 2, reps: "8", load: "60%" })] },
      { type: "warmup", exercises: [exOf("ramp4", { name: "Bar Ramp", sets: 2, reps: "1", load: "95%" })] },
    ]);

    const r = analyzePeriodization([build(1), build(2), build(3), finalWeek]);

    // Gated final-week heavySetShare: only the 2 light strength sets count, 0 heavy.
    expect(heavySetShare([finalWeek])).toBe(0);
    // Correctly a deload (light + reduced volume), never a peak — warmup must not
    // make this week read as "heavy".
    expect(r.deloadDetected).toBe(true);
    expect(r.peakDetected).toBe(false);
    // Avg% intensity progression must ignore the warmup's 95% entirely.
    expect(r.intensityProgression).toBe("flat");
  });

  it("does not let warmup ramp singles skew average-reps-based intensity progression", () => {
    const week1 = dayWithSections("r1", 1, [
      { type: "strength", exercises: [exOf("b1", { name: "Bench Press", sets: 4, reps: "10" })] },
      { type: "warmup", exercises: [exOf("w1", { name: "Bar Ramp", sets: 3, reps: "1" })] },
    ]);
    const week2 = dayWithSections("r2", 2, [
      { type: "strength", exercises: [exOf("b2", { name: "Bench Press", sets: 4, reps: "9" })] },
    ]);
    const week3 = dayWithSections("r3", 3, [
      { type: "strength", exercises: [exOf("b3", { name: "Bench Press", sets: 4, reps: "8" })] },
    ]);
    // Rep midpoints drop 10 -> 8 across the block (gated) — a real intensity rise.
    // Ungated, week 1's average is dragged down to 5.5 by the warmup single,
    // which masks the rise.
    const r = analyzePeriodization([week1, week2, week3]);
    expect(r.intensityProgression).toBe("rising");
  });
});

describe("periodization gates constant warmup volume so it can't mask a real deload (7.3)", () => {
  it("detects a deload driven by reduced working volume + intensity, undisturbed by constant warmup", () => {
    const warmup = (wk: number) => exOf(`warmup-row-${wk}`, { name: "Warmup Row", sets: 15, reps: "10" });
    const build = (wk: number) =>
      dayWithSections(`bw${wk}`, wk, [
        { type: "warmup", exercises: [warmup(wk)] },
        { type: "strength", exercises: [exOf(`sq${wk}`, { name: "Back Squat", sets: 10, reps: "5", load: "75%" })] },
      ]);
    const deloadWeek = dayWithSections("bw4", 4, [
      { type: "warmup", exercises: [warmup(4)] },
      { type: "strength", exercises: [exOf("sq4", { name: "Back Squat", sets: 3, reps: "8", load: "55%" })] },
    ]);

    const r = analyzePeriodization([build(1), build(2), build(3), deloadWeek]);
    expect(r.deloadDetected).toBe(true);
    expect(r.peakDetected).toBe(false);
  });
});

describe("periodization guards zero-working-volume routines against spurious classification (7.4)", () => {
  it("reports no deload, no peak, and no NaN/Infinity for a pure-mobility multi-week routine", () => {
    const build = (wk: number, sets: number) =>
      dayWithSections(`mob${wk}`, wk, [
        { type: "mobility", exercises: [exOf(`mob-ex${wk}`, { name: "Hip Mobility Flow", sets, reps: "10" })] },
      ]);
    // A big set-count drop in the final week — if mobility were treated as
    // working volume (pre-fix bug), this reads as a deload. It should not,
    // since none of this counts toward working volume at all.
    const r = analyzePeriodization([build(1, 6), build(2, 6), build(3, 6), build(4, 1)]);

    expect(r.deloadDetected).toBe(false);
    expect(r.peakDetected).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});
