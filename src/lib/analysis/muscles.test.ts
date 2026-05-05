import { mapMuscle, parseRepRange, repMidpoint, isCompound } from "./muscles";
import type { ProgramExercise } from "@/lib/programs/types";

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
