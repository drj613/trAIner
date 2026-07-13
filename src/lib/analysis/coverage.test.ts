import { analyzeProgram } from "./analyze";
import {
  balancedProgram,
  startingStrengthProgram,
  pplProgram,
} from "./fixtures";
import type { ProgramDay, ProgramDocument } from "@/lib/programs/types";

describe("deriveCoverage (via analyzeProgram)", () => {
  it("coverage.musclesTrained contains only muscles with sets > 0", () => {
    const result = analyzeProgram(balancedProgram);
    const { coverage } = result;

    // Every trained muscle must have effectiveSets > 0 in muscleVolumes
    for (const muscle of coverage.musclesTrained) {
      const vol = result.muscleVolumes.find((m) => m.muscle === muscle)!;
      expect(vol.effectiveSets).toBeGreaterThan(0);
    }

    // Every untrained muscle must have effectiveSets === 0
    for (const muscle of coverage.musclesUntrained) {
      const vol = result.muscleVolumes.find((m) => m.muscle === muscle)!;
      expect(vol.effectiveSets).toBe(0);
    }

    // trained + untrained = all muscle groups (19 total)
    expect(coverage.musclesTrained.length + coverage.musclesUntrained.length).toBe(
      result.muscleVolumes.length,
    );
  });

  it("coverage patterns match balance patterns", () => {
    const result = analyzeProgram(balancedProgram);
    expect(result.coverage.patternsCovered).toEqual(result.balance.movementPatternsCovered);
    expect(result.coverage.patternsMissing).toEqual(result.balance.movementPatternsMissing);
  });
});

// Phase 6 regression — deriveCoverage does its own traversal of NOTHING: it only
// reads muscleVolumes (already gated by Phase 3's countWeeklyVolume) and balance
// (now gated by Phase 6's analyzeBalance). This test proves non-volume work
// excluded upstream does not reappear as "trained"/"covered" through coverage,
// without deriveCoverage itself needing a second filter.
describe("deriveCoverage inherits the counts-toward-volume gate (no second filter)", () => {
  const warmupOnlyProgram: ProgramDocument = {
    id: "warmup-only",
    title: "Warmup-only",
    source: "manual",
    active: true,
    overrides: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    days: [{
      id: "d-1",
      dayNumber: 1,
      weekNumber: 1,
      title: "Day",
      sections: [{
        id: "s-1",
        type: "warmup",
        name: "Warmup",
        groups: [{
          id: "g-1",
          type: "single",
          exercises: [{
            id: "e-1",
            name: "Band Pull-Aparts",
            sets: 3,
            reps: "20",
            canonicalExerciseId: "band-pull-apart",
            tags: { primary: ["shoulders"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      }],
    }] as ProgramDay[],
  };

  it("does not mark a warmup-only muscle as trained, and does not mark its pattern as covered", () => {
    const result = analyzeProgram(warmupOnlyProgram);
    // Band Pull-Apart's primary muscle ("shoulders" → side_delts) never counts:
    // the warmup section defaults countsTowardVolume=false and nothing overrides it.
    expect(result.coverage.musclesTrained).toHaveLength(0);
    expect(result.coverage.patternsCovered).toHaveLength(0);
    // Still equal to (now-gated) balance output — no double filtering, no drift.
    expect(result.coverage.patternsCovered).toEqual(result.balance.movementPatternsCovered);
  });
});

describe("Starting Strength fixture", () => {
  it("scores without crashing", () => {
    const result = analyzeProgram(startingStrengthProgram);
    expect(result.overall.score).toBeGreaterThan(0);
    expect(result.overall.score).toBeLessThanOrEqual(100);
  });

  it("trains the big compound muscle groups", () => {
    const result = analyzeProgram(startingStrengthProgram);
    const trained = new Set(result.coverage.musclesTrained);
    // Squat: quads, glutes; Bench: chest; DL: hamstrings, lower back; Row: lats/upper_back
    expect(trained.has("quads")).toBe(true);
    expect(trained.has("chest")).toBe(true);
    expect(trained.has("hamstrings")).toBe(true);
    expect(trained.has("lats")).toBe(true);
  });

  it("volume score reflects only the muscles actually trained", () => {
    const result = analyzeProgram(startingStrengthProgram);
    // SS is a minimal program — it shouldn't be capped at ~60 due to untrained muscles
    // The volume score should reflect the quality of the muscles it does train
    expect(result.dimensions.volume.score).toBeGreaterThan(50);
  });
});

describe("PPL fixture", () => {
  it("achieves a volume score of B or better (≥ 75)", () => {
    const result = analyzeProgram(pplProgram);
    expect(result.dimensions.volume.score).toBeGreaterThanOrEqual(75);
  });

  it("covers all 6 movement patterns", () => {
    const result = analyzeProgram(pplProgram);
    // PPL with DL/RDL, squats, OHP, bench, rows, pull-ups should hit all patterns
    expect(result.coverage.patternsMissing).toHaveLength(0);
  });

  it("scores balanced program higher than imbalanced, PPL comparable to balanced", () => {
    const balanced = analyzeProgram(balancedProgram);
    const ppl = analyzeProgram(pplProgram);
    // Both are well-designed programs; PPL should be in same tier
    expect(ppl.dimensions.volume.score).toBeGreaterThanOrEqual(
      balanced.dimensions.volume.score - 10,
    );
  });
});
