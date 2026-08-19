import {
  extractUnresolvedExercises,
  applyResolutions,
  buildInitialResolutions,
  groupResolutionOccurrences,
  rememberableTarget,
  rememberedAliasInputs,
  rememberedAliasConflicts,
  storedOccurrenceCounts,
  applyResolutionsWithStats,
  dedupeAliasResolutions,
  CUSTOM_ID,
} from "./resolution";
import type { ResolutionGroup } from "./resolution";
import {
  collectNamed,
  makeEightBackSquatReview,
  makeImportMatchContext,
  resolutionsForGroup,
} from "./resolution.testFixtures";
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
  it("does not finalize a fuzzy suggestion, however similar", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Bench Press",
        sectionType: "strength",
        suggestions: [
          { exerciseId: "barbell-bench-press", name: "Barbell Bench Press", score: 0.99 },
          { exerciseId: "dumbbell-bench-press", name: "Dumbbell Bench Press", score: 0.50 },
        ],
      },
    ];
    // Fuzzy similarity is suggestion-only: a near-identical name must still be
    // the user's choice, not the machine's.
    expect(buildInitialResolutions(items)).toEqual({});
  });

  it("does not auto-select a candidate for an underspecified name", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Back Squat",
        sectionType: "strength",
        suggestions: [
          { exerciseId: "barbell-back-squat", name: "Back Squat", score: 1 },
          { exerciseId: "barbell-high-bar-squat", name: "High Bar Back Squat", score: 0.7 },
        ],
      },
    ];
    // An exact-scoring candidate is exactly the case the old threshold got
    // wrong: `Back Squat` scores 1.0 against the generic version, which would
    // have silently finalized the choice the user is being asked to make.
    expect(buildInitialResolutions(items)).toEqual({});
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
    const payload = structuredClone(variantsFixture);
    const unmatchedName = "Totally Fake Deficit Romanian Deadlift";
    const rdlExercise = payload.days[0].sections[1].groups[0].exercises.find(
      (exercise) => exercise.name === "Romanian deadlift",
    );
    if (!rdlExercise || !("variants" in rdlExercise)) throw new Error("RDL variant fixture is missing");
    rdlExercise.variants[0].name = unmatchedName;
    const { program, warnings } = normalizePayload(payload);

    const items = extractUnresolvedExercises(warnings);
    const rdlVariant = items.find((i) => i.rawName === unmatchedName)!;
    expect(rdlVariant).toBeDefined();
    expect(rdlVariant.path).toMatch(/\.variants\.\d+$/);

    const patched = applyResolutions(program, [
      { path: rdlVariant.path, canonicalId: "deficit_rdl_canonical" },
    ]);

    // The unmatched RDL variant is active only on week 3 (day 1, section 1, ex 1)
    const week3Day1 = patched.days.find((d) => d.weekNumber === 3 && d.dayNumber === 1)!;
    const rdl = week3Day1.sections[1].groups[0].exercises[1];
    expect(rdl.name).toBe(unmatchedName);
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

describe("groupResolutionOccurrences", () => {
  const { review, expectedEightPaths } = makeEightBackSquatReview();
  const program = review.program;
  const group = groupResolutionOccurrences(review.warnings)[0];

  it("groups eight repeated back squats", () => {
    const groups = groupResolutionOccurrences(review.warnings);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      normalizedRawName: "back squat",
      kind: "underspecified",
      occurrenceCount: 8,
      remember: false,
    });
    expect(groups[0].occurrences.map((o) => o.path)).toEqual(expectedEightPaths);
  });

  it("fans one choice out without crossing name guards", () => {
    const result = applyResolutions(program, resolutionsForGroup(group, "barbell-high-bar-squat"));
    expect(collectNamed(result, "Back Squat").map((e) => e.canonicalExerciseId)).toEqual(
      Array(8).fill("barbell-high-bar-squat"),
    );
    expect(
      collectNamed(result, "Front Squat").every((e) => e.canonicalExerciseId !== "barbell-high-bar-squat"),
    ).toBe(true);
  });
});

describe("groupResolutionOccurrences: what may and may not be grouped", () => {
  it("does not count the unsupported nested override variant, and leaves its structural warning in place", () => {
    const { review } = makeEightBackSquatReview();
    const nestedVariantWarning = review.warnings.find((w) =>
      w.message.includes("inside an override day are not supported"),
    );

    // The fixture deliberately nests a NINTH raw `Back Squat` inside an
    // override replacement variant. It is unsupported and ignored, so it is
    // neither counted nor promised as a fan-out target...
    expect(nestedVariantWarning).toBeDefined();
    expect(groupResolutionOccurrences(review.warnings)[0].occurrenceCount).toBe(8);
    expect(
      groupResolutionOccurrences(review.warnings)[0].occurrences.some((o) => o.path.includes(".variants.")),
    ).toBe(true);
    expect(
      groupResolutionOccurrences(review.warnings)[0].occurrences.some(
        (o) => o.path.startsWith("overrides.") && o.path.includes(".variants."),
      ),
    ).toBe(false);
    // ...while the structural warning itself survives untouched.
    expect(nestedVariantWarning!.path).toBe("overrides.0.days.1.sections.0.groups.1.exercises.0");
    expect(nestedVariantWarning!.rawName).toBeUndefined();
    expect(nestedVariantWarning!.resolutionKind).toBeUndefined();
  });

  it("keeps a saved alias ahead of the reviewed underspecified rule, so Remember suppresses the choice", () => {
    const remembered = makeEightBackSquatReview({
      aliases: [{
        id: "alias-1",
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "barbell-low-bar-squat",
        provenance: "remembered" as const,
        createdAt: "2026-08-18T00:00:00.000Z",
      }],
    });

    // Same fixture, same eight occurrences — the only difference is the saved
    // alias, so the group must disappear entirely.
    expect(groupResolutionOccurrences(makeEightBackSquatReview().review.warnings)).toHaveLength(1);
    expect(groupResolutionOccurrences(remembered.review.warnings)).toHaveLength(0);
    expect(
      collectNamed(remembered.review.program, "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-low-bar-squat"));
  });

  it("supports resolving occurrences separately when the same text means different exercises", () => {
    const { review, expectedEightPaths } = makeEightBackSquatReview();
    const group = groupResolutionOccurrences(review.warnings)[0];
    const perOccurrence = group.occurrences.map((occurrence, index) => ({
      path: occurrence.path,
      canonicalId: index === 0 ? "barbell-low-bar-squat" : "barbell-high-bar-squat",
    }));

    const result = applyResolutions(review.program, perOccurrence);

    // The first path is a base-day slot, so exactly one stored exercise gets
    // the low-bar id and the other seven keep the high-bar id — grouping never
    // forced the eight occurrences into one identity.
    expect(perOccurrence[0].path).toBe(expectedEightPaths[0]);
    const ids = collectNamed(result, "Back Squat").map((e) => e.canonicalExerciseId);
    expect(ids.filter((id) => id === "barbell-low-bar-squat")).toHaveLength(1);
    expect(ids.filter((id) => id === "barbell-high-bar-squat")).toHaveLength(7);
  });

  it("keeps structural day-number ambiguity blocking: the group exists but nothing is patched", () => {
    const ambiguous = normalizePayload(
      {
        program_name: "Ambiguous days",
        days: [
          { day: 1, title: "A", sections: [{ type: "strength", groups: [{ exercises: [{ name: "Back Squat" }] }] }] },
          { day: 1, title: "B", sections: [{ type: "strength", groups: [{ exercises: [{ name: "Back Squat" }] }] }] },
        ],
      },
      undefined,
      [],
      [],
      makeImportMatchContext(),
    );
    const group = groupResolutionOccurrences(ambiguous.warnings)[0];

    // Both occurrences group (one decision is still presentable)...
    expect(group.occurrenceCount).toBe(2);
    expect(group.occurrences.map((o) => o.path)).toEqual([
      "days.1.sections.0.groups.0.exercises.0",
      "days.1.sections.0.groups.0.exercises.0",
    ]);

    // ...but the duplicate day number makes those paths ambiguous, so
    // applyResolutions refuses to patch and both warnings survive. Grouping
    // cannot bypass the structural safeguard.
    const result = applyResolutions(ambiguous.program, resolutionsForGroup(group, "barbell-high-bar-squat"));
    expect(collectNamed(result, "Back Squat").map((e) => e.canonicalExerciseId)).toEqual([
      undefined,
      undefined,
    ]);
    expect(result.import?.warnings.filter((w) => w.rawName === "Back Squat")).toHaveLength(2);
  });

  it("does not let a fan-out cross onto a differently-named unmatched exercise in the same slot", () => {
    const review = normalizePayload(
      {
        program_name: "Name guard",
        weeks: 2,
        days: [{
          day: 1,
          title: "A",
          sections: [{
            type: "strength",
            groups: [{
              // Both names are unresolved, so both slots carry a warning and
              // the name guard is the ONLY thing keeping the back-squat
              // fan-out off the week-2 clone.
              exercises: [{ name: "Back Squat", variants: [{ weeks: [2], name: "Jefferson Curl" }] }],
            }],
          }],
        }],
      },
      undefined,
      [],
      [],
      makeImportMatchContext(),
    );
    const backSquatGroup = groupResolutionOccurrences(review.warnings).find(
      (g) => g.normalizedRawName === "back squat",
    )!;

    const result = applyResolutions(review.program, resolutionsForGroup(backSquatGroup, "barbell-high-bar-squat"));

    expect(collectNamed(result, "Back Squat").map((e) => e.canonicalExerciseId)).toEqual([
      "barbell-high-bar-squat",
    ]);
    expect(collectNamed(result, "Jefferson Curl").map((e) => e.canonicalExerciseId)).toEqual([undefined]);
  });

  it("separates an underspecified name from an unmatched name with the same normalized text", () => {
    const groups = groupResolutionOccurrences([
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Back Squat needs a specific version chosen.",
        rawName: "Back Squat",
        resolutionKind: "underspecified",
        suggestions: [{ exerciseId: "barbell-high-bar-squat", name: "High Bar Back Squat", score: 0.8 }],
      },
      {
        path: "days.2.sections.0.groups.0.exercises.0",
        message: "back  squat was imported without a catalog match.",
        rawName: "back  squat",
        resolutionKind: "unmatched",
        suggestions: [],
      },
    ]);

    expect(groups.map((g) => g.groupKey)).toEqual([
      "underspecified:back squat",
      "unmatched:back squat",
    ]);
    expect(groups.map((g) => g.occurrenceCount)).toEqual([1, 1]);
  });

  it("treats a warning with no resolutionKind as unmatched so old programs still group", () => {
    const groups = groupResolutionOccurrences([
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Landmine Press was imported without a catalog match.",
        suggestions: [{ exerciseId: "landmine_press", name: "Landmine Press", score: 0.9 }],
      },
      {
        path: "days.2.sections.0.groups.0.exercises.0",
        message: "Landmine press was imported without a catalog match.",
        rawName: "Landmine press",
        suggestions: [],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      groupKey: "unmatched:landmine press",
      kind: "unmatched",
      occurrenceCount: 2,
    });
    // The legacy warning's name is recovered from its message.
    expect(groups[0].occurrences.map((o) => o.rawName)).toEqual(["Landmine Press", "Landmine press"]);
    expect(groups[0].occurrences[0].candidates).toEqual([
      { exerciseId: "landmine_press", name: "Landmine Press", score: 0.9 },
    ]);
  });

  it("excludes structural warnings that carry no exercise name", () => {
    expect(
      groupResolutionOccurrences([
        { path: "days.1", message: "Day 1 is declared 2 times." },
        { path: "days.1.sections.0", message: "Unknown section type: power_endurance." },
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Remembered aliases: a grouped or occurrence-level choice is LOCAL to this
// import unless the user explicitly marked the group. These tests pin the pure
// rule; ImportClient.remember.test.tsx pins it through the real UI.
// ---------------------------------------------------------------------------

function makeGroup(
  rawNames: string[],
  options: { kind?: ResolutionGroup["kind"]; remember?: boolean; pathPrefix?: string } = {},
): ResolutionGroup {
  const kind = options.kind ?? "underspecified";
  const prefix = options.pathPrefix ?? "days.1";
  const normalizedRawName = rawNames[0].trim().toLowerCase().replace(/\s+/g, " ");
  return {
    groupKey: `${kind}:${normalizedRawName}`,
    normalizedRawName,
    kind,
    occurrences: rawNames.map((rawName, index) => ({
      path: `${prefix}.sections.0.groups.0.exercises.${index}`,
      rawName,
      kind,
      candidates: [],
    })),
    occurrenceCount: rawNames.length,
    remember: options.remember ?? false,
  };
}

function resolveAll(group: ResolutionGroup, ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  group.occurrences.forEach((occurrence, index) => {
    const id = ids[index];
    if (id !== undefined) out[occurrence.path] = id;
  });
  return out;
}

describe("rememberableTarget", () => {
  it("returns the single concrete id every occurrence agreed on", () => {
    const group = makeGroup(["Back Squat", "back  squat"]);
    const resolutions = resolveAll(group, ["barbell-low-bar-squat", "barbell-low-bar-squat"]);
    expect(rememberableTarget(group, resolutions)).toBe("barbell-low-bar-squat");
  });

  it("returns undefined when occurrences resolved to different ids", () => {
    const group = makeGroup(["Back Squat", "Back Squat"]);
    const resolutions = resolveAll(group, ["barbell-low-bar-squat", "barbell-high-bar-squat"]);
    expect(rememberableTarget(group, resolutions)).toBeUndefined();
  });

  it("returns undefined when the agreed choice is 'keep as custom'", () => {
    const group = makeGroup(["Back Squat", "Back Squat"]);
    expect(rememberableTarget(group, resolveAll(group, [CUSTOM_ID, CUSTOM_ID]))).toBeUndefined();
  });

  it("returns undefined while an occurrence is still undecided", () => {
    const group = makeGroup(["Back Squat", "Back Squat"]);
    expect(rememberableTarget(group, resolveAll(group, ["barbell-low-bar-squat"]))).toBeUndefined();
  });
});

describe("rememberedAliasInputs", () => {
  it("returns nothing for a fully resolved group nobody asked to remember", () => {
    const group = makeGroup(["Back Squat", "Back Squat"]);
    const resolutions = resolveAll(group, ["barbell-low-bar-squat", "barbell-low-bar-squat"]);
    // The completion canary: the same group WITH remember does produce an
    // input, so the empty result above cannot be an unrelated bail-out.
    expect(rememberedAliasInputs([{ ...group, remember: true }], resolutions)).toHaveLength(1);
    expect(rememberedAliasInputs([group], resolutions)).toEqual([]);
  });

  it("emits one input per marked group, using the first occurrence's display text", () => {
    const group = makeGroup(["Back Squat", "back  squat", "BACK SQUAT"], { remember: true });
    const resolutions = resolveAll(group, [
      "barbell-low-bar-squat",
      "barbell-low-bar-squat",
      "barbell-low-bar-squat",
    ]);
    expect(rememberedAliasInputs([group], resolutions)).toEqual([
      { alias: "Back Squat", canonicalExerciseId: "barbell-low-bar-squat", provenance: "remembered" },
    ]);
  });

  it("drops a marked group whose occurrences were resolved separately to different ids", () => {
    const group = makeGroup(["Press", "Press"], { remember: true });
    const resolutions = resolveAll(group, ["bench-press", "overhead-press"]);
    expect(rememberedAliasInputs([group], resolutions)).toEqual([]);
  });

  it("drops a marked group kept as custom, and one still undecided", () => {
    const custom = makeGroup(["Sled Drag"], { remember: true });
    const undecided = makeGroup(["Jefferson Curl"], { remember: true, pathPrefix: "days.2" });
    const resolutions = { ...resolveAll(custom, [CUSTOM_ID]) };
    expect(rememberedAliasInputs([custom, undecided], resolutions)).toEqual([]);
  });

  it("drops both marked groups when one normalized token disagrees across kinds", () => {
    const underspecified = makeGroup(["Press", "Press"], { remember: true });
    const unmatched = makeGroup(["press"], {
      kind: "unmatched",
      remember: true,
      pathPrefix: "days.2",
    });
    const squat = makeGroup(["Back Squat"], { remember: true, pathPrefix: "days.3" });
    const resolutions = {
      ...resolveAll(underspecified, ["bench-press", "bench-press"]),
      ...resolveAll(unmatched, ["overhead-press"]),
      ...resolveAll(squat, ["barbell-low-bar-squat"]),
    };
    expect(rememberedAliasInputs([underspecified, unmatched, squat], resolutions)).toEqual([
      { alias: "Back Squat", canonicalExerciseId: "barbell-low-bar-squat", provenance: "remembered" },
    ]);
  });
});

describe("rememberedAliasConflicts", () => {
  const input = {
    alias: "Back Squat",
    canonicalExerciseId: "barbell-low-bar-squat",
    provenance: "remembered" as const,
  };

  it("reports an occupied token pointing at a different exercise", () => {
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "back squat", canonicalExerciseId: "barbell-high-bar-squat" },
      ]),
    ).toEqual([{ input, existingCanonicalExerciseId: "barbell-high-bar-squat" }]);
  });

  it("reports nothing when the token already points at the same exercise", () => {
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "back squat", canonicalExerciseId: "barbell-low-bar-squat" },
      ]),
    ).toEqual([]);
  });

  it("reports nothing when the token is free", () => {
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "front squat", canonicalExerciseId: "barbell-front-squat" },
      ]),
    ).toEqual([]);
  });

  it("compares normalized tokens, not display text", () => {
    // The unique index keys on the normalized token, so a stored row whose
    // display text differs in case/spacing still occupies "back squat".
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "back  SQUAT ", canonicalExerciseId: "barbell-high-bar-squat" },
      ]),
    ).toEqual([{ input, existingCanonicalExerciseId: "barbell-high-bar-squat" }]);
  });
});


// ---------------------------------------------------------------------------
// The headline number the user reads. It must be a promise about THEIR
// routine — how many stored exercises this one decision will change — not a
// count of our internal warning list. A base-day path expands into one stored
// exercise per week-clone, so the two diverge as soon as `weeks > 1`.
// ---------------------------------------------------------------------------

describe("storedOccurrenceCounts", () => {
  function reviewFor(payload: Record<string, unknown>) {
    return normalizePayload(payload, undefined, [], [], makeImportMatchContext());
  }

  const fourWeekPayload = {
    program_name: "Four weeks, one squat",
    weeks: 4,
    days: [
      {
        day: 1,
        title: "Lower",
        sections: [
          {
            name: "Main",
            type: "strength",
            groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 5, reps: "5" }] }],
          },
        ],
      },
    ],
  };

  it("counts every week-clone one base-day path expands into", () => {
    const review = reviewFor(fourWeekPayload);
    const groups = groupResolutionOccurrences(review.warnings);
    // One warning, one occurrence path — but FOUR stored exercises.
    expect(review.warnings).toHaveLength(1);
    expect(groups[0].occurrenceCount).toBe(1);
    expect(collectNamed(review.program, "Back Squat")).toHaveLength(4);
    expect(storedOccurrenceCounts(review.program, groups)).toEqual({
      [groups[0].groupKey]: 4,
    });
  });

  it("agrees with what one grouped choice actually patches", () => {
    const review = reviewFor(fourWeekPayload);
    const groups = groupResolutionOccurrences(review.warnings);
    const patched = applyResolutions(review.program, resolutionsForGroup(groups[0], "probe"));
    const reallyPatched = collectNamed(patched, "Back Squat").filter(
      (e) => e.canonicalExerciseId === "probe",
    ).length;
    expect(storedOccurrenceCounts(review.program, groups)[groups[0].groupKey]).toBe(
      reallyPatched,
    );
    expect(reallyPatched).toBe(4);
  });

  it("counts the worked example's eight fan-out targets", () => {
    const { review, expectedEightPaths } = makeEightBackSquatReview();
    const groups = groupResolutionOccurrences(review.warnings);
    // Here — and ONLY here, by fixture construction — paths and stored
    // exercises both come to 8, because each base slot is a Back Squat in
    // exactly one of the two weeks.
    expect(expectedEightPaths).toHaveLength(8);
    expect(storedOccurrenceCounts(review.program, groups)).toEqual({
      [groups[0].groupKey]: 8,
    });
  });

  it("does not resurrect an override-nested variant under week expansion", () => {
    const { review } = makeEightBackSquatReview();
    const groups = groupResolutionOccurrences(review.warnings);
    // The fixture's ninth raw `Back Squat` sits inside an override-replacement
    // variant: unsupported, structurally warned about, and never a fan-out
    // target. Week expansion must not turn it into one.
    expect(
      review.warnings.some((w) =>
        w.message.includes("inside an override day are not supported"),
      ),
    ).toBe(true);
    expect(storedOccurrenceCounts(review.program, groups)[groups[0].groupKey]).toBe(8);
  });

  it("counts zero for a structurally ambiguous day nothing can be patched in", () => {
    const ambiguous = reviewFor({
      program_name: "Two day threes",
      days: [
        {
          day: 3,
          title: "A",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 3, reps: "5" }] }],
            },
          ],
        },
        {
          day: 3,
          title: "B",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 3, reps: "5" }] }],
            },
          ],
        },
      ],
    });
    const groups = groupResolutionOccurrences(ambiguous.warnings);
    expect(groups[0].occurrenceCount).toBeGreaterThan(0);
    // applyResolutions refuses to patch a duplicated day number, so promising
    // the user a count here would be a lie.
    expect(storedOccurrenceCounts(ambiguous.program, groups)[groups[0].groupKey]).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// Fix round 1
// ---------------------------------------------------------------------------

describe("applyResolutionsWithStats", () => {
  const fourWeekPayload = {
    program_name: "Four weeks, one squat",
    weeks: 4,
    days: [
      {
        day: 1,
        title: "Lower",
        sections: [
          {
            name: "Main",
            type: "strength",
            groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 5, reps: "5" }] }],
          },
        ],
      },
    ],
  };

  it("reports how many stored exercises each path patched", () => {
    const review = normalizePayload(
      fourWeekPayload,
      undefined,
      [],
      [],
      makeImportMatchContext(),
    );
    const path = "days.1.sections.0.groups.0.exercises.0";
    const { program, patchedByPath } = applyResolutionsWithStats(review.program, [
      { path, canonicalId: "barbell-high-bar-squat" },
    ]);
    // One path, four week-clones patched.
    expect(patchedByPath.get(path)).toBe(4);
    expect(
      collectNamed(program, "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(4).fill("barbell-high-bar-squat"));
  });

  it("reports nothing for a path that patched nothing", () => {
    const review = normalizePayload(
      fourWeekPayload,
      undefined,
      [],
      [],
      makeImportMatchContext(),
    );
    const { patchedByPath } = applyResolutionsWithStats(review.program, [
      { path: "days.9.sections.0.groups.0.exercises.0", canonicalId: "barbell-high-bar-squat" },
    ]);
    expect(patchedByPath.get("days.9.sections.0.groups.0.exercises.0")).toBeUndefined();
  });

  it("is what applyResolutions returns", () => {
    const { review } = makeEightBackSquatReview();
    const groups = groupResolutionOccurrences(review.warnings);
    const resolutions = resolutionsForGroup(groups[0], "barbell-low-bar-squat");
    expect(applyResolutionsWithStats(review.program, resolutions).program).toEqual(
      applyResolutions(review.program, resolutions),
    );
  });
});

describe("dedupeAliasResolutions skips answers that are not a catalogue identity", () => {
  const item = (path: string, rawName: string) => ({ path, rawName });

  it("skips an occurrence kept as custom instead of remembering it", () => {
    const out = dedupeAliasResolutions([item("a", "Sled Drag")], { a: CUSTOM_ID });
    expect(out).toEqual([]);
  });

  it("skips an undecided occurrence instead of remembering an empty target", () => {
    const out = dedupeAliasResolutions([item("a", "Sled Drag")], {});
    expect(out).toEqual([]);
  });

  it("still remembers the concrete answers alongside a skipped one", () => {
    const out = dedupeAliasResolutions(
      [item("a", "Sled Drag"), item("b", "Back Squat")],
      { a: CUSTOM_ID, b: "barbell-low-bar-squat" },
    );
    expect(out).toEqual([
      { alias: "Back Squat", canonicalExerciseId: "barbell-low-bar-squat", provenance: "remembered" },
    ]);
  });
});

describe("rememberedAliasConflicts token rules", () => {
  const input = {
    alias: "Back Squat",
    canonicalExerciseId: "barbell-low-bar-squat",
    provenance: "remembered" as const,
  };

  it("treats a stored token that only matches after normalizing as occupied", () => {
    // `aliasRepo.saveMany` keys its conflict map on the stored `normalizedAlias`
    // verbatim, so it would let this write through — but the runtime resolver
    // re-normalizes stored tokens (identity.ts), so writing "back squat" would
    // leave TWO rows matching the same name and the resolver would stop
    // resolving it at all. Withholding is the safe answer.
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "back  SQUAT ", canonicalExerciseId: "barbell-high-bar-squat" },
      ]),
    ).toEqual([{ input, existingCanonicalExerciseId: "barbell-high-bar-squat" }]);
  });

  it("treats the verbatim stored token as occupied even if it does not renormalize", () => {
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "back squat", canonicalExerciseId: "barbell-high-bar-squat" },
      ]),
    ).toEqual([{ input, existingCanonicalExerciseId: "barbell-high-bar-squat" }]);
  });

  it("still reports nothing when a differently named row is stored", () => {
    expect(
      rememberedAliasConflicts([input], [
        { normalizedAlias: "front  SQUAT ", canonicalExerciseId: "barbell-front-squat" },
      ]),
    ).toEqual([]);
  });
});
