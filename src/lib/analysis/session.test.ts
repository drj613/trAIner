import type { ProgramDay } from "@/lib/programs/types";
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

// ---------------------------------------------------------------------------
// Phase 5 — split total/working session sets
// ---------------------------------------------------------------------------

describe("analyzeSessions — total vs. working sets", () => {
  // Mixed session: warmup (excluded by section default) + mobility (excluded by
  // section default) + strength (working) + an explicitly-excluded skill drill
  // (countsTowardVolume: false overriding a section that would otherwise count it).
  const mixedSessionDay: ProgramDay = {
    id: "d-mixed",
    dayNumber: 1,
    weekNumber: 1,
    title: "Mixed Session",
    sections: [
      {
        id: "s-warmup",
        type: "warmup",
        name: "Warmup",
        groups: [{
          id: "g-warmup",
          type: "single",
          exercises: [{
            id: "e-warmup",
            name: "Treadmill Jog",
            sets: 2,
            reps: "5 min",
            tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      },
      {
        id: "s-mobility",
        type: "mobility",
        name: "Mobility",
        groups: [{
          id: "g-mobility",
          type: "single",
          exercises: [{
            id: "e-mobility",
            name: "Hip Opener",
            sets: 2,
            reps: "10",
            tags: { primary: ["glutes"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      },
      {
        id: "s-strength",
        type: "strength",
        name: "Strength",
        groups: [{
          id: "g-strength",
          type: "single",
          exercises: [{
            id: "e-strength",
            name: "Back Squat",
            sets: 4,
            reps: "5",
            tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      },
      {
        id: "s-skill",
        type: "strength",
        name: "Skill Work",
        groups: [{
          id: "g-skill",
          type: "single",
          exercises: [{
            id: "e-skill",
            name: "Muscle-Up Practice",
            sets: 3,
            reps: "3",
            countsTowardVolume: false,
            tags: { primary: ["lats"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      },
    ],
  };

  it("totalSets counts every prescribed set while workingSets counts only gated sets", () => {
    const [result] = analyzeSessions([mixedSessionDay]);
    expect(result.exerciseCount).toBe(4); // all exercise objects, regardless of gating
    expect(result.totalSets).toBe(2 + 2 + 4 + 3); // 11 — every prescribed exercise
    expect(result.workingSets).toBe(4); // only Back Squat (strength) is gated in
  });

  it("estimatedMinutes derives from totalSets (all prescribed activity), not workingSets", () => {
    const [result] = analyzeSessions([mixedSessionDay]);
    expect(result.estimatedMinutes).toBe(result.totalSets * 3 + 10);
    expect(result.estimatedMinutes).toBe(11 * 3 + 10);
  });

  // Glute session: an activation warmup that currently inflates the direct
  // glute cap past the session threshold, plus a working set of Hip Thrusts.
  const gluteSessionDay: ProgramDay = {
    id: "d-glute",
    dayNumber: 1,
    weekNumber: 1,
    title: "Glute Day",
    sections: [
      {
        id: "s-activation",
        type: "warmup",
        name: "Activation",
        groups: [{
          id: "g-activation",
          type: "single",
          exercises: [{
            id: "e-activation",
            name: "Banded Glute Bridge",
            sets: 8,
            reps: "15",
            tags: { primary: ["glutes"], secondary: [], incidental: [], modifiers: ["activation"] },
          }],
        }],
      },
      {
        id: "s-working",
        type: "strength",
        name: "Strength",
        groups: [{
          id: "g-working",
          type: "single",
          exercises: [{
            id: "e-hip-thrust",
            name: "Hip Thrust",
            sets: 4,
            reps: "8-10",
            tags: { primary: ["glutes"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      },
    ],
  };

  it("does not let the activation warmup count toward the direct glute cap", () => {
    const [result] = analyzeSessions([gluteSessionDay]);
    // Only the working Hip Thrust sets count toward the direct per-muscle cap —
    // the activation warmup (8 sets) is gated out entirely.
    expect(result.muscleSetCounts.glutes).toBe(4);
    expect(result.warnings.some((w) => w.message.includes("glutes"))).toBe(false);
  });

  it("still counts the activation warmup toward totalSets and estimated duration", () => {
    const [result] = analyzeSessions([gluteSessionDay]);
    expect(result.totalSets).toBe(8 + 4); // 12 — activation still counted as prescribed activity
    expect(result.estimatedMinutes).toBe(12 * 3 + 10);
    expect(result.workingSets).toBe(4); // only the Hip Thrust sets are "working"
  });
});
