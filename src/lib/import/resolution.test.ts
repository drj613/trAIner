import { extractUnresolvedExercises, applyResolutions } from "./resolution";
import type { ImportWarning, ProgramDocument } from "@/lib/programs/types";

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
