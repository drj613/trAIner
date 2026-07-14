import type { ProgramDay, ProgramExercise, SectionType } from "@/lib/programs/types";
import type { MuscleGroup } from "./types";
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

  it("credits 'full body' expansion at half the tier weight", () => {
    const fullBodyDay: ProgramDay = {
      id: "fb-1", dayNumber: 1, weekNumber: 1, title: "Conditioning",
      sections: [{
        id: "fb-s1", type: "conditioning", name: "Metcon",
        groups: [{
          id: "fb-g1", type: "single",
          exercises: [{
            id: "fb-e1", name: "Thruster", sets: 4, reps: "10",
            tags: { primary: ["full body"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      }],
    };
    const volumes = countWeeklyVolume([fullBodyDay], 1);
    // 4 sets × 1.0 primary × 0.5 full-body discount = 2 per expanded muscle
    expect(volumes.get("quads")).toBe(2);
    expect(volumes.get("core")).toBe(2);
    expect(volumes.get("lats")).toBe(2);
  });
});

describe("countWeeklyVolume gates by countsTowardVolume", () => {
  const dayWith = (
    sectionType: SectionType,
    exercise: Partial<Omit<ProgramExercise, "tags">> & { tags?: Partial<ProgramExercise["tags"]> },
  ): ProgramDay => ({
    id: "d-1",
    dayNumber: 1,
    weekNumber: 1,
    title: "Day",
    sections: [{
      id: "s-1",
      type: sectionType,
      name: "Section",
      groups: [{
        id: "g-1",
        type: "single",
        exercises: [{
          id: "e-1",
          name: "Exercise",
          sets: 4,
          reps: "10",
          ...exercise,
          tags: {
            primary: ["quads"],
            secondary: [],
            incidental: [],
            modifiers: [],
            ...exercise.tags,
          },
        }],
      }],
    }],
  });

  it("zeroes volume for a warmup-activation exercise", () => {
    const day = dayWith("warmup", { tags: { modifiers: ["activation"] } });
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBe(0);
  });

  it("zeroes volume for a mobility exercise", () => {
    const day = dayWith("mobility", {});
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBe(0);
  });

  it("counts volume when countsTowardVolume is explicitly true inside a warmup section", () => {
    const day = dayWith("warmup", { countsTowardVolume: true });
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBeGreaterThan(0);
  });

  it("zeroes volume when countsTowardVolume is explicitly false inside a hypertrophy section", () => {
    const day = dayWith("hypertrophy", { countsTowardVolume: false });
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBe(0);
  });

  it("counts volume for conditioning work by default", () => {
    const day = dayWith("conditioning", {});
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBeGreaterThan(0);
  });

  it("counts volume for metcon work by default", () => {
    const day = dayWith("metcon", {});
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBeGreaterThan(0);
  });

  it("still counts ordinary legacy strength work with no countsTowardVolume field", () => {
    const day = dayWith("strength", {});
    const volumes = countWeeklyVolume([day], 1);
    expect(volumes.get("quads") ?? 0).toBeGreaterThan(0);
  });
});

describe("countWeeklyVolume deduplicates canonical muscles within a tier", () => {
  const dayWithTags = (tags: Partial<ProgramExercise["tags"]>): ProgramDay => ({
    id: "d-1",
    dayNumber: 1,
    weekNumber: 1,
    title: "Day",
    sections: [{
      id: "s-1",
      type: "strength" as SectionType,
      name: "Section",
      groups: [{
        id: "g-1",
        type: "single",
        exercises: [{
          id: "e-1",
          name: "Exercise",
          sets: 4,
          reps: "10",
          tags: { primary: [], secondary: [], incidental: [], modifiers: [], ...tags },
        }],
      }],
    }],
  });

  it("counts a canonical muscle once when the same alias appears twice (case-insensitive)", () => {
    const volumes = countWeeklyVolume([dayWithTags({ primary: ["chest", "Chest"] })], 1);
    // 4 sets × 1.0 primary, counted ONCE → 4 (not 8)
    expect(volumes.get("chest")).toBe(4);
  });

  it("counts a canonical muscle once when two different aliases map to it", () => {
    const volumes = countWeeklyVolume([dayWithTags({ primary: ["upper chest", "pectorals"] })], 1);
    // both aliases → chest, counted ONCE → 4 (not 8)
    expect(volumes.get("chest")).toBe(4);
  });

  it("keeps the larger factor for a muscle hit by both full-body and direct labels", () => {
    const volumes = countWeeklyVolume([dayWithTags({ primary: ["full body", "quads"] })], 1);
    // full-body gives quads factor 0.5, direct quads gives 1.0 → max(0.5,1.0)=1.0
    // 4 sets × 1.0 primary × 1.0 → 4 (NOT 0.5+1.0 = 1.5 × 4 = 6)
    expect(volumes.get("quads")).toBe(4);
  });

  it("deduplicates a repeated full-body label", () => {
    const volumes = countWeeklyVolume([dayWithTags({ primary: ["full body", "full body"] })], 1);
    // one full-body expansion: 4 sets × 1.0 primary × 0.5 discount → 2 (not 4)
    expect(volumes.get("quads")).toBe(2);
    expect(volumes.get("core")).toBe(2);
  });

  it("keeps tiers additive: primary and secondary on the same muscle still sum", () => {
    const volumes = countWeeklyVolume([dayWithTags({ primary: ["chest"], secondary: ["chest"] })], 1);
    // primary 4×1.0 + secondary 4×0.5 = 4 + 2 = 6 (cross-tier addition preserved)
    expect(volumes.get("chest")).toBe(6);
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

  it("labels sets between MEV and MAV-low as lower-end productive, still green", () => {
    // chest: mev 5, mavLow 6 — 5.5 sets sits in the gap
    const volumes = new Map<MuscleGroup, number>([["chest", 5.5]]);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(chest.severity).toBe("green");
    expect(chest.label).toBe("Productive — lower end");
  });
});
