import { DEFAULT_COUNTS_BY_SECTION, resolveCountsTowardVolume } from "./volumeRole";
import { SECTION_TYPES } from "@/lib/programs/types";
import type { ProgramExercise } from "@/lib/programs/types";

describe("DEFAULT_COUNTS_BY_SECTION", () => {
  it("has an entry for every SectionType, and no extras", () => {
    const keys = Object.keys(DEFAULT_COUNTS_BY_SECTION).sort();
    expect(keys).toEqual([...SECTION_TYPES].sort());
  });

  const expected: Record<string, boolean> = {
    warmup: false,
    explosive: true,
    strength: true,
    power: true,
    hypertrophy: true,
    accessory: true,
    metcon: true,
    cardio: false,
    conditioning: true,
    rehab: false,
    mobility: false,
    cooldown: false,
    training: true,
  };

  for (const [section, value] of Object.entries(expected)) {
    it(`defaults ${section} to ${value}`, () => {
      expect(DEFAULT_COUNTS_BY_SECTION[section as keyof typeof DEFAULT_COUNTS_BY_SECTION]).toBe(value);
    });
  }
});

function makeExercise(overrides: {
  countsTowardVolume?: boolean;
  modifiers?: string[];
}): ProgramExercise {
  return {
    id: "ex1",
    name: "Test Exercise",
    countsTowardVolume: overrides.countsTowardVolume,
    tags: {
      primary: [],
      secondary: [],
      incidental: [],
      modifiers: overrides.modifiers ?? [],
    },
  };
}

describe("resolveCountsTowardVolume precedence", () => {
  it("(1) explicit true overrides a warmup section", () => {
    const ex = makeExercise({ countsTowardVolume: true });
    expect(resolveCountsTowardVolume(ex, "warmup")).toBe(true);
  });

  it("(2) explicit false overrides a strength section", () => {
    const ex = makeExercise({ countsTowardVolume: false });
    expect(resolveCountsTowardVolume(ex, "strength")).toBe(false);
  });

  it("(3) exact modifier `activation` resolves false", () => {
    const ex = makeExercise({ modifiers: ["activation"] });
    expect(resolveCountsTowardVolume(ex, "strength")).toBe(false);
  });

  it("(4) modifier matching trims whitespace", () => {
    const ex = makeExercise({ modifiers: ["  activation  "] });
    expect(resolveCountsTowardVolume(ex, "strength")).toBe(false);
  });

  it("(5) modifier matching is case-insensitive", () => {
    const ex = makeExercise({ modifiers: ["ACTIVATION"] });
    expect(resolveCountsTowardVolume(ex, "strength")).toBe(false);
  });

  it("(6) `warmup` and `warm-up` modifiers resolve false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["warmup"] }), "strength")).toBe(false);
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["warm-up"] }), "strength")).toBe(false);
  });

  it("(7) `cooldown` and `cool-down` modifiers resolve false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["cooldown"] }), "strength")).toBe(false);
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["cool-down"] }), "strength")).toBe(false);
  });

  it("(8) `mobility` modifier resolves false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["mobility"] }), "strength")).toBe(false);
  });

  it("(9) `rehab` modifier resolves false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["rehab"] }), "strength")).toBe(false);
  });

  it("(10) `prehab` modifier resolves false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["prehab"] }), "strength")).toBe(false);
  });

  it("(11) `skill` modifier does NOT auto-resolve false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["skill"] }), "strength")).toBe(true);
  });

  it("(12) `technique` modifier does NOT auto-resolve false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["technique"] }), "strength")).toBe(true);
  });

  it("(13) `primer` modifier does NOT auto-resolve false", () => {
    expect(resolveCountsTowardVolume(makeExercise({ modifiers: ["primer"] }), "strength")).toBe(true);
  });

  it("(14) ambiguous legacy `training` section resolves true", () => {
    expect(resolveCountsTowardVolume(makeExercise({}), "training")).toBe(true);
  });

  it("(15) metcon section resolves true", () => {
    expect(resolveCountsTowardVolume(makeExercise({}), "metcon")).toBe(true);
  });

  it("(16) conditioning section resolves true", () => {
    expect(resolveCountsTowardVolume(makeExercise({}), "conditioning")).toBe(true);
  });
});
