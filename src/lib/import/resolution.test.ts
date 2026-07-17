import {
  extractUnresolvedExercises,
  applyResolutions,
  buildInitialResolutions,
  CUSTOM_ID,
} from "./resolution";
import { getRenderableDays } from "@/lib/programs/overrides";
import { normalizePayload } from "./parser";
import variantsFixture from "./__fixtures__/variants-multiweek.json";
import type { ImportWarning, ProgramDay, ProgramDocument, ProgramExercise } from "@/lib/programs/types";

const warnings: ImportWarning[] = [
  {
    path: "days.1.sections.0.groups.0.exercises.0",
    message: "Landmine Press was imported without a catalog match.",
    rawName: "Landmine Press",
    suggestions: [
      { exerciseId: "landmine_press", name: "Landmine Press", score: 0.9 },
      { exerciseId: "half_kneeling_lp", name: "Half-Kneeling Landmine Press", score: 0.7 },
    ],
  },
  {
    path: "days.1.sections.0.groups.0.exercises.1",
    message: "Cable Y-Raise was imported without a catalog match.",
    rawName: "Cable Y-Raise",
    suggestions: [],
  },
  {
    path: "days.1.sections.0",
    message: "Unknown section type: power_endurance.",
  },
];

describe("extractUnresolvedExercises", () => {
  it("returns all exercise warnings including those with no suggestions", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items).toHaveLength(2);
  });

  it("excludes non-exercise warnings (e.g. unknown section type)", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items.every((i) => i.rawName !== "Unknown section type: power_endurance.")).toBe(true);
  });

  it("uses rawName field directly when present", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items[0].rawName).toBe("Landmine Press");
  });

  it("falls back to parsing message when rawName is absent", () => {
    const legacyWarnings: ImportWarning[] = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Old Exercise was imported without a catalog match.",
        suggestions: [{ exerciseId: "old_ex", name: "Old Exercise", score: 0.8 }],
      },
    ];
    const items = extractUnresolvedExercises(legacyWarnings);
    expect(items[0].rawName).toBe("Old Exercise");
  });

  it("carries path through for path-based resolution", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items[0].path).toBe("days.1.sections.0.groups.0.exercises.0");
  });

  it("carries suggestions through", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items[0].suggestions).toHaveLength(2);
    expect(items[0].suggestions[0].exerciseId).toBe("landmine_press");
  });
});

function makeProgram(exerciseName: string): ProgramDocument {
  return {
    id: "p1",
    title: "Test",
    source: "import",
    active: true,
    overrides: [],
    createdAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
    days: [
      {
        id: "d1",
        dayNumber: 1,
        title: "Day 1",
        sections: [
          {
            id: "s1",
            type: "strength",
            name: "Strength",
            groups: [
              {
                id: "g1",
                type: "single",
                exercises: [
                  {
                    id: "e1",
                    name: exerciseName,
                    canonicalExerciseId: undefined,
                    tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("applyResolutions", () => {
  it("patches canonicalExerciseId for matching exercise path", () => {
    const program = makeProgram("Landmine Press");
    // Path for days[0] (index 0) → days.1.sections.0.groups.0.exercises.0
    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: "landmine_press" },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId
    ).toBe("landmine_press");
  });

  it("does not modify exercises that already have canonicalExerciseId", () => {
    const program = makeProgram("Bench Press");
    program.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId = "bench_press";
    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: "OTHER" },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId
    ).toBe("bench_press");
  });

  it("returns a new program object (immutable)", () => {
    const program = makeProgram("Squat");
    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: "squat" },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(patched).not.toBe(program);
  });

  it("resolves exercises with same name in different sections independently", () => {
    const program: ProgramDocument = {
      id: "p1",
      title: "Test",
      source: "import",
      active: true,
      overrides: [],
      createdAt: "2026-04-29T00:00:00Z",
      updatedAt: "2026-04-29T00:00:00Z",
      days: [
        {
          id: "d1",
          dayNumber: 1,
          title: "Day 1",
          sections: [
            {
              id: "s1",
              type: "strength",
              name: "A",
              groups: [
                {
                  id: "g1",
                  type: "single",
                  exercises: [
                    {
                      id: "e1",
                      name: "Press",
                      canonicalExerciseId: undefined,
                      tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                    },
                  ],
                },
              ],
            },
            {
              id: "s2",
              type: "strength",
              name: "B",
              groups: [
                {
                  id: "g2",
                  type: "single",
                  exercises: [
                    {
                      id: "e2",
                      name: "Press",
                      canonicalExerciseId: undefined,
                      tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: "bench_press" },
      { path: "days.1.sections.1.groups.0.exercises.0", canonicalId: "overhead_press" },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("bench_press");
    expect(patched.days[0].sections[1].groups[0].exercises[0].canonicalExerciseId).toBe("overhead_press");
  });
});

describe("applyResolutions multi-week", () => {
  it("patches all days that share a dayNumber when the program has multiple weeks", () => {
    const makeDay = (id: string, dayNumber: number, weekNumber: number) => ({
      id,
      dayNumber,
      weekNumber,
      title: `Day ${dayNumber}`,
      sections: [
        {
          id: `s-${id}`,
          type: "strength" as const,
          name: "S",
          groups: [
            {
              id: `g-${id}`,
              type: "single" as const,
              exercises: [
                {
                  id: `e-${id}`,
                  name: "Moon Lunge",
                  canonicalExerciseId: undefined,
                  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                },
              ],
            },
          ],
        },
      ],
    });

    const program: ProgramDocument = {
      id: "p1",
      title: "Multi-Week",
      source: "import",
      active: true,
      overrides: [],
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T00:00:00Z",
      days: [
        makeDay("w1d1", 1, 1),
        makeDay("w2d1", 1, 2),
        makeDay("w3d1", 1, 3),
      ],
    };

    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: "moon-lunge" },
    ];
    const patched = applyResolutions(program, resolutions);

    expect(patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("moon-lunge");
    expect(patched.days[1].sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("moon-lunge");
    expect(patched.days[2].sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("moon-lunge");
  });
});

describe("CUSTOM_ID sentinel", () => {
  it("applyResolutions skips exercises resolved to CUSTOM_ID (no canonicalExerciseId set)", () => {
    const program = makeProgram("Incline Treadmill Walk");
    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: CUSTOM_ID },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId,
    ).toBeUndefined();
  });
});

describe("buildInitialResolutions", () => {
  it("pre-selects the top suggestion when score >= 0.65", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Bench Press",
        sectionType: "strength",
        suggestions: [
          { exerciseId: "barbell-bench-press", name: "Barbell Bench Press", score: 0.67 },
          { exerciseId: "dumbbell-bench-press", name: "Dumbbell Bench Press", score: 0.50 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe("barbell-bench-press");
  });

  it("does NOT pre-select when top score < 0.65", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Med Ball Chest Pass",
        sectionType: "explosive",
        suggestions: [
          { exerciseId: "medicine-ball-chest-pass", name: "Medicine Ball Chest Pass", score: 0.60 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBeUndefined();
  });

  it("sets CUSTOM_ID for warmup section items regardless of suggestions", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Wrist CARs",
        sectionType: "warmup",
        suggestions: [
          { exerciseId: "hip-cars", name: "Hip CARs", score: 0.33 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("sets CUSTOM_ID for cooldown section items", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Dead Hang",
        sectionType: "cooldown",
        suggestions: [],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("sets CUSTOM_ID for items with no suggestions", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "SkiErg",
        sectionType: "metcon",
        suggestions: [],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("leaves items with moderate scores (< 0.65) and non-auto-custom sections unresolved", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Row Erg",
        sectionType: "conditioning",
        suggestions: [{ exerciseId: "row", name: "Row", score: 0.50 }],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBeUndefined();
  });
});

describe("extractUnresolvedExercises with sectionType", () => {
  it("carries sectionType from warning into ResolutionItem", () => {
    const warningsWithType: ImportWarning[] = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Wrist CARs was imported without a catalog match.",
        rawName: "Wrist CARs",
        suggestions: [],
        sectionType: "warmup",
      },
    ];
    const items = extractUnresolvedExercises(warningsWithType);
    expect(items[0].sectionType).toBe("warmup");
  });

  it("defaults sectionType to 'strength' when warning has no sectionType", () => {
    const warningsWithoutType: ImportWarning[] = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Old Exercise was imported without a catalog match.",
        rawName: "Old Exercise",
        suggestions: [],
      },
    ];
    const items = extractUnresolvedExercises(warningsWithoutType);
    expect(items[0].sectionType).toBe("strength");
  });
});

// ─── Phase 9: override resolution + resolved-warning removal ───────────────

function makeExercise(id: string, name: string, extra: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    id,
    name,
    canonicalExerciseId: undefined,
    tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
    ...extra,
  };
}

function makeSingleExerciseDay(
  dayId: string,
  dayNumber: number,
  weekNumber: number | undefined,
  exercise: ProgramExercise,
): ProgramDay {
  return {
    id: dayId,
    dayNumber,
    weekNumber,
    title: `Day ${dayNumber}`,
    sections: [
      {
        id: `${dayId}-s`,
        type: "strength",
        name: "Strength",
        groups: [
          {
            id: `${dayId}-g`,
            type: "single",
            exercises: [exercise],
          },
        ],
      },
    ],
  };
}

const BASE_WARNING_PATH = "days.3.sections.0.groups.0.exercises.0";
const OVERRIDE_WARNING_PATH = "overrides.0.days.3.sections.0.groups.0.exercises.0";
const STRUCTURAL_WARNING_PATH = "days.1.sections.0";

function buildOverrideProgram(): ProgramDocument {
  const baseDay3 = makeSingleExerciseDay(
    "d-base-3",
    3,
    1,
    makeExercise("e-base3", "Moon Lunge"),
  );
  const overrideDay3 = makeSingleExerciseDay(
    "d-override-3",
    3,
    undefined,
    makeExercise("e-override3", "Moon Lunge", { countsTowardVolume: true }),
  );

  return {
    id: "p1",
    title: "Override Program",
    source: "import",
    active: true,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
    days: [baseDay3],
    overrides: [
      {
        id: "ov-1",
        scope: "week",
        programId: "p1",
        weekNumber: 4,
        replacement: [overrideDay3],
        createdAt: "2026-07-13T00:00:00Z",
      },
    ],
    import: {
      rawJson: {},
      warnings: [
        {
          path: BASE_WARNING_PATH,
          message: "Moon Lunge was imported without a catalog match.",
          rawName: "Moon Lunge",
        },
        {
          path: OVERRIDE_WARNING_PATH,
          message: "Moon Lunge was imported without a catalog match.",
          rawName: "Moon Lunge",
        },
        {
          path: STRUCTURAL_WARNING_PATH,
          message: "Unknown section type: power_endurance.",
        },
      ],
    },
  };
}

function overrideExercise(program: ProgramDocument): ProgramExercise {
  const replacement = program.overrides[0].replacement;
  const days = Array.isArray(replacement) ? replacement : [replacement];
  return days[0].sections[0].groups[0].exercises[0];
}

function baseDay3Exercise(program: ProgramDocument): ProgramExercise {
  return program.days.find((d) => d.dayNumber === 3)!.sections[0].groups[0].exercises[0];
}

describe("applyResolutions: override exercise resolution", () => {
  it("patches the actual nested replacement exercise (visible on program.overrides[0].replacement)", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(overrideExercise(patched).canonicalExerciseId).toBe("moon-lunge");
  });

  it("leaves the base Day 3 exercise unaffected when only the override path is resolved", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(baseDay3Exercise(patched).canonicalExerciseId).toBeUndefined();
  });

  it("preserves the override exercise's slot id after patching", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(overrideExercise(patched).id).toBe("e-override3");
  });

  it("preserves countsTowardVolume on the override exercise after patching", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(overrideExercise(patched).countsTowardVolume).toBe(true);
  });

  it("preserves an array-shaped replacement as an array after patching", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(Array.isArray(patched.overrides[0].replacement)).toBe(true);
  });

  it("preserves a single-shaped (non-array) replacement after patching", () => {
    const program = buildOverrideProgram();
    const currentReplacement = program.overrides[0].replacement;
    const singleDay = Array.isArray(currentReplacement) ? currentReplacement[0] : currentReplacement;
    program.overrides[0].replacement = singleDay;

    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(Array.isArray(patched.overrides[0].replacement)).toBe(false);
    const day = patched.overrides[0].replacement as ProgramDay;
    expect(day.sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("moon-lunge");
  });

  it("makes the canonical id available through getRenderableDays for cross-week history matching", () => {
    const program = buildOverrideProgram();
    const week4Day3 = makeSingleExerciseDay(
      "d-week4-3",
      3,
      4,
      makeExercise("e-week4-3-slot", "Moon Lunge"),
    );
    program.days.push(week4Day3);

    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    const rendered = getRenderableDays(patched);
    const renderedWeek4Day3 = rendered.find((d) => d.weekNumber === 4 && d.dayNumber === 3);
    expect(renderedWeek4Day3?.sections[0].groups[0].exercises[0].canonicalExerciseId).toBe(
      "moon-lunge",
    );
  });
});

describe("applyResolutions: resolved-warning removal", () => {
  it("removes the base-day warning once its exercise is successfully resolved", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: BASE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === BASE_WARNING_PATH)).toBe(false);
  });

  it("removes the override warning once its exercise is successfully resolved", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === OVERRIDE_WARNING_PATH)).toBe(false);
  });

  it("leaves a warning in place when its resolution path does not match any exercise (failed resolution)", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: "overrides.0.days.99.sections.0.groups.0.exercises.0", canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === OVERRIDE_WARNING_PATH)).toBe(true);
  });

  it("keeps unrelated structural warnings untouched", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
      { path: BASE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === STRUCTURAL_WARNING_PATH)).toBe(true);
  });

  it("resolving only the override path does not remove the base-day warning at the colliding day number", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: OVERRIDE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === BASE_WARNING_PATH)).toBe(true);
  });

  it("resolving only the base path does not remove the override warning at the colliding day number", () => {
    const program = buildOverrideProgram();
    const patched = applyResolutions(program, [
      { path: BASE_WARNING_PATH, canonicalId: "moon-lunge" },
    ]);
    expect(patched.import!.warnings.some((w) => w.path === OVERRIDE_WARNING_PATH)).toBe(true);
  });
});

describe("variant-aware resolution (Stage 5)", () => {
  const buildVariantProgram = (opts: {
    baseName: string;
    variant: Record<string, unknown>;
    weeks: number;
  }) =>
    normalizePayload({
      title: "Variant Res",
      weeks: opts.weeks,
      days: [
        {
          day: 1,
          title: "Day 1",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [
                {
                  type: "single",
                  exercises: [{ name: opts.baseName, sets: 3, reps: "5", variants: [opts.variant] }],
                },
              ],
            },
          ],
        },
      ],
    });

  const slotEx = (program: ProgramDocument, week: number) =>
    program.days.find((d) => d.weekNumber === week)!.sections[0].groups[0].exercises[0];

  it("extractUnresolvedExercises surfaces a variant path item", () => {
    const { warnings } = buildVariantProgram({
      baseName: "Squat",
      variant: { weeks: [2], name: "Totally Fake Movement XYZ" },
      weeks: 2,
    });
    const items = extractUnresolvedExercises(warnings);
    const item = items.find((i) => i.path.endsWith(".exercises.0.variants.0"))!;
    expect(item).toBeDefined();
    expect(item.rawName).toBe("Totally Fake Movement XYZ");
    expect(item.sectionType).toBe("strength");
  });

  it("a variants.{v} resolution patches every week-clone carrying that variant", () => {
    const { program, warnings } = buildVariantProgram({
      baseName: "Squat", // matched → base weeks already resolved
      variant: { weeks: [2, 4], name: "Totally Fake Movement XYZ" },
      weeks: 4,
    });
    const variantWarning = warnings.find((w) => w.path.endsWith(".variants.0"))!;
    const patched = applyResolutions(program, [
      { path: variantWarning.path, canonicalId: "fake_canonical" },
    ]);
    expect(slotEx(patched, 2).canonicalExerciseId).toBe("fake_canonical");
    expect(slotEx(patched, 4).canonicalExerciseId).toBe("fake_canonical");
    // base weeks (Squat) keep their own match, not the variant resolution
    expect(slotEx(patched, 1).canonicalExerciseId).not.toBe("fake_canonical");
    expect(slotEx(patched, 3).canonicalExerciseId).not.toBe("fake_canonical");
    // variant warning removed
    expect(patched.import?.warnings.some((w) => w.path === variantWarning.path)).toBe(false);
  });

  it("a base resolution does not patch the variant-week exercise in the same slot", () => {
    const { program, warnings } = buildVariantProgram({
      baseName: "Barbell Row", // unmatched → base has a warning
      variant: { weeks: [2], name: "Totally Fake Movement XYZ" },
      weeks: 2,
    });
    const baseWarning = warnings.find((w) => w.rawName === "Barbell Row")!;
    const variantWarning = warnings.find((w) => w.rawName === "Totally Fake Movement XYZ")!;

    // Only the base resolution
    const basePatched = applyResolutions(program, [
      { path: baseWarning.path, canonicalId: "base_canonical" },
    ]);
    expect(slotEx(basePatched, 1).canonicalExerciseId).toBe("base_canonical");
    expect(slotEx(basePatched, 2).canonicalExerciseId).toBeUndefined();

    // Only the variant resolution
    const variantPatched = applyResolutions(program, [
      { path: variantWarning.path, canonicalId: "variant_canonical" },
    ]);
    expect(slotEx(variantPatched, 2).canonicalExerciseId).toBe("variant_canonical");
    expect(slotEx(variantPatched, 1).canonicalExerciseId).toBeUndefined();
  });

  it("ambiguous base day number short-circuits resolution for variant slots too", () => {
    const { program, warnings } = normalizePayload({
      title: "Ambiguous",
      weeks: 2,
      days: [
        {
          day: 1,
          title: "Day 1a",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [
                {
                  type: "single",
                  exercises: [
                    { name: "Barbell Row", variants: [{ weeks: [2], name: "Totally Fake Movement XYZ" }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          day: 1,
          title: "Day 1b",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [{ type: "single", exercises: [{ name: "Barbell Row" }] }],
            },
          ],
        },
      ],
    });
    const anyWarning = warnings.find((w) => w.rawName !== undefined)!;
    const patched = applyResolutions(program, [
      { path: anyWarning.path, canonicalId: "should_not_apply" },
    ]);
    for (const day of patched.days) {
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const exercise of group.exercises) {
            expect(exercise.canonicalExerciseId).toBeUndefined();
          }
        }
      }
    }
  });
});

describe("fixture: variants-multiweek resolution (Stage 7)", () => {
  it("unmatched variant surfaces a resolution item and applyResolutions patches all its week-clones", () => {
    const { program, warnings } = normalizePayload(variantsFixture);

    const items = extractUnresolvedExercises(warnings);
    const rdlVariant = items.find((i) => i.rawName === "Deficit Romanian deadlift")!;
    expect(rdlVariant).toBeDefined();
    expect(rdlVariant.path).toMatch(/\.variants\.\d+$/);

    const patched = applyResolutions(program, [
      { path: rdlVariant.path, canonicalId: "deficit_rdl_canonical" },
    ]);

    // The Deficit RDL variant is active only on week 3 (day 1, section 1, ex 1)
    const week3Day1 = patched.days.find((d) => d.weekNumber === 3 && d.dayNumber === 1)!;
    const rdl = week3Day1.sections[1].groups[0].exercises[1];
    expect(rdl.name).toBe("Deficit Romanian deadlift");
    expect(rdl.canonicalExerciseId).toBe("deficit_rdl_canonical");

    // The base-week RDL clones keep their own (matched) canonical id, not the variant's
    const week1Day1 = patched.days.find((d) => d.weekNumber === 1 && d.dayNumber === 1)!;
    expect(week1Day1.sections[1].groups[0].exercises[1].canonicalExerciseId).not.toBe(
      "deficit_rdl_canonical",
    );

    // Variant warning removed
    expect(patched.import?.warnings.some((w) => w.path === rdlVariant.path)).toBe(false);
  });
});

describe("variant leak scan (Stage 8)", () => {
  const hasVariantKey = (root: unknown): boolean => {
    let found = false;
    const walk = (obj: unknown) => {
      if (found) return;
      if (Array.isArray(obj)) return obj.forEach(walk);
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          if (k === "variants" || k === "__variants") {
            found = true;
            return;
          }
          walk((obj as Record<string, unknown>)[k]);
        }
      }
    };
    walk(root);
    return found;
  };

  const inlinePayload = {
    title: "Leak Scan Inline",
    weeks: 4,
    days: [
      {
        day: 1,
        title: "Day 1",
        sections: [
          {
            name: "Main",
            type: "strength",
            groups: [
              {
                type: "single",
                exercises: [
                  {
                    name: "Barbell Row",
                    sets: 3,
                    reps: "5",
                    variants: [
                      { weeks: [2], name: "Totally Fake Movement XYZ" },
                      { weeks: [3, 4], name: "Front Squat", load: "60%" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("no variants/__variants key in program.days (inline + fixture)", () => {
    const inline = normalizePayload(inlinePayload).program;
    const fixture = normalizePayload(variantsFixture).program;
    expect(hasVariantKey(inline.days)).toBe(false);
    expect(hasVariantKey(fixture.days)).toBe(false);
  });

  it("no leak after applyResolutions (whole program minus import.rawJson)", () => {
    for (const payload of [inlinePayload, variantsFixture]) {
      const { program, warnings } = normalizePayload(payload);
      const items = extractUnresolvedExercises(warnings);
      const patched = applyResolutions(
        program,
        items.map((i) => ({ path: i.path, canonicalId: "some_canonical" })),
      );
      // rawJson legally contains `variants` (untouched raw input) — exempt it.
      const { import: importSection, ...programSansImport } = patched;
      const importMinusRaw = importSection
        ? { warnings: importSection.warnings }
        : undefined;
      expect(hasVariantKey({ ...programSansImport, import: importMinusRaw })).toBe(false);
    }
  });
});
