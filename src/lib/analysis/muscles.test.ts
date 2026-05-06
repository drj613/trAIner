import {
  mapMuscle,
  mapMuscleExpanded,
  parseRepRange,
  repMidpoint,
  isCompound,
  classifyMovement,
  detectMovementPatterns,
} from "./muscles";
import type { ProgramExercise } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

const makeExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  id: "test",
  name: "Test Exercise",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
  ...overrides,
});

describe("mapMuscle", () => {
  it("maps catalog labels to canonical groups", () => {
    expect(mapMuscle("chest")).toBe("chest");
    expect(mapMuscle("upper chest")).toBe("chest");
    expect(mapMuscle("pectorals")).toBe("chest");
    expect(mapMuscle("middle back")).toBe("upper_back");
    expect(mapMuscle("mid back")).toBe("upper_back");
    expect(mapMuscle("traps")).toBe("upper_back");
    expect(mapMuscle("rhomboids")).toBe("upper_back");
    expect(mapMuscle("quadriceps")).toBe("quads");
    expect(mapMuscle("quads")).toBe("quads");
    expect(mapMuscle("abdominals")).toBe("core");
    expect(mapMuscle("abs")).toBe("core");
    expect(mapMuscle("obliques")).toBe("core");
    expect(mapMuscle("hip flexors")).toBe("core");
    expect(mapMuscle("glute medius")).toBe("glutes");
    expect(mapMuscle("side delts")).toBe("side_delts");
    expect(mapMuscle("brachialis")).toBe("biceps");
    expect(mapMuscle("soleus")).toBe("calves");
    expect(mapMuscle("scapular stabilizers")).toBe("rotator_cuff");
  });

  it("is case-insensitive", () => {
    expect(mapMuscle("Chest")).toBe("chest");
    expect(mapMuscle("LATS")).toBe("lats");
  });

  it("returns undefined for unknown labels", () => {
    expect(mapMuscle("unknown muscle")).toBeUndefined();
  });
});

describe("parseRepRange", () => {
  it("parses single number", () => {
    expect(parseRepRange("5")).toEqual({ low: 5, high: 5 });
  });

  it("parses dash range", () => {
    expect(parseRepRange("8-12")).toEqual({ low: 8, high: 12 });
  });

  it("parses en-dash range", () => {
    expect(parseRepRange("5–8")).toEqual({ low: 5, high: 8 });
  });

  it("returns null for AMRAP and other non-numeric", () => {
    expect(parseRepRange("AMRAP")).toBeNull();
    expect(parseRepRange(undefined)).toBeNull();
  });
});

describe("repMidpoint", () => {
  it("returns midpoint of range", () => {
    expect(repMidpoint("8-12")).toBe(10);
  });

  it("returns the number for single rep", () => {
    expect(repMidpoint("5")).toBe(5);
  });
});

describe("isCompound", () => {
  it("returns true for exercises with compound tag", () => {
    const mockCatalogItem = { tags: ["compound"], movementPatterns: [] } as any;
    expect(isCompound(makeExercise(), mockCatalogItem)).toBe(true);
  });

  it("returns false for exercises with isolation tag", () => {
    const mockCatalogItem = { tags: ["isolation"], movementPatterns: [] } as any;
    expect(isCompound(makeExercise(), mockCatalogItem)).toBe(false);
  });

  it("infers compound from 2+ primary muscles", () => {
    expect(isCompound(makeExercise({ tags: { primary: ["chest", "triceps"], secondary: [], incidental: [], modifiers: [] } }))).toBe(true);
  });
});

// M7 — serratus anterior maps to upper_back, not rotator_cuff
describe("mapMuscle — M7 serratus anterior fix", () => {
  it("maps serratus anterior to upper_back", () => {
    expect(mapMuscle("serratus anterior")).toBe("upper_back");
  });

  it("does not map serratus anterior to rotator_cuff", () => {
    expect(mapMuscle("serratus anterior")).not.toBe("rotator_cuff");
  });
});

// H12 — mapMuscleExpanded returns multiple muscles for "full body"
describe("mapMuscleExpanded — H12 full body expansion", () => {
  it("returns multiple muscle groups for full body", () => {
    const result = mapMuscleExpanded("full body");
    expect(result.length).toBeGreaterThan(1);
    expect(result).toContain("quads");
    expect(result).toContain("lats");
    expect(result).toContain("glutes");
    expect(result).toContain("core");
  });

  it("returns a single-element array for normal muscle labels", () => {
    expect(mapMuscleExpanded("chest")).toEqual(["chest"]);
    expect(mapMuscleExpanded("hamstrings")).toEqual(["hamstrings"]);
  });

  it("returns empty array for unknown labels", () => {
    expect(mapMuscleExpanded("unknown thing")).toEqual([]);
  });
});

// H17 — classifyMovement returns "legs" for hip hinge patterns
describe("classifyMovement — H17 hinge patterns", () => {
  const makeCatalogItem = (movementPatterns: string[]): ExerciseCatalogItem =>
    ({ id: "test", name: "Test", movementPatterns, tags: [], primaryMuscles: [], secondaryMuscles: [] } as any);

  it('returns "legs" for hinge pattern', () => {
    expect(classifyMovement(makeCatalogItem(["hinge"]))).toBe("legs");
  });

  it('returns "legs" for hip hinge pattern', () => {
    expect(classifyMovement(makeCatalogItem(["hip hinge"]))).toBe("legs");
  });

  it('returns "legs" for hip extension pattern', () => {
    expect(classifyMovement(makeCatalogItem(["hip extension"]))).toBe("legs");
  });

  it('still returns "legs" for squat pattern', () => {
    expect(classifyMovement(makeCatalogItem(["squat"]))).toBe("legs");
  });

  it('returns "other" for unrecognized patterns', () => {
    expect(classifyMovement(makeCatalogItem(["balance"]))).toBe("other");
  });
});

// H2 — detectMovementPatterns fallback when catalogItem is undefined
describe("detectMovementPatterns — H2 fallback", () => {
  it("detects horizontal_push from chest primary muscle when no catalog item", () => {
    const exercise = makeExercise({ tags: { primary: ["chest"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("horizontal_push");
  });

  it("detects hip_hinge from hamstring primary muscle when no catalog item", () => {
    const exercise = makeExercise({ tags: { primary: ["hamstrings"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("hip_hinge");
  });

  it("detects squat from quad primary muscle when no catalog item", () => {
    const exercise = makeExercise({ tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("squat");
  });

  it("detects vertical_push from delt primary muscle when no catalog item", () => {
    const exercise = makeExercise({ tags: { primary: ["front delts"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("vertical_push");
  });

  it("detects horizontal_pull from lats primary muscle when no catalog item", () => {
    const exercise = makeExercise({ tags: { primary: ["lats"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("horizontal_pull");
  });

  it("returns empty array for exercises with no recognizable primary muscles", () => {
    const exercise = makeExercise({ tags: { primary: ["neck"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toEqual([]);
  });

  // Fix 1 — exact-set matching: rear delts should be horizontal_pull, not vertical_push
  it("detects horizontal_pull (not vertical_push) from rear delts primary muscle", () => {
    const exercise = makeExercise({ tags: { primary: ["rear delts"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("horizontal_pull");
    expect(result).not.toContain("vertical_push");
  });

  // Fix 1 — lats should produce both horizontal_pull and vertical_pull
  it("detects both horizontal_pull and vertical_pull from lats primary muscle", () => {
    const exercise = makeExercise({ tags: { primary: ["lats"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toContain("horizontal_pull");
    expect(result).toContain("vertical_pull");
  });

  // Fix 1 — "lateral" should NOT be matched (no false positive from substring)
  it("does not detect any pattern from lateral (no substring false positive)", () => {
    const exercise = makeExercise({ tags: { primary: ["lateral"], secondary: [], incidental: [], modifiers: [] } });
    const result = detectMovementPatterns(undefined, exercise);
    expect(result).toEqual([]);
  });
});
