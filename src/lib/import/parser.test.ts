import example from "@/test/fixtures/example-structure.json";
import { normalizePayload, parseProgramJson, ImportError } from "./parser";
import { applyResolutions } from "./resolution";
import { baseExercisePath } from "./paths";

const minimalDay = (day: number, title: string) => ({
  day,
  title,
  sections: [{ type: "strength", groups: [{ exercises: [{ name: "Squat" }] }] }],
});

describe("import parser", () => {
  it("imports the preserved example as a one-day program", () => {
    const review = normalizePayload(example);

    expect(review.program.days).toHaveLength(1);
    expect(review.program.import?.rawJson).toEqual(example);
    expect(review.program.days[0].sections.map((section) => section.type)).toEqual(
      expect.arrayContaining(["warmup", "strength", "metcon"])
    );
    expect(review.program.days[0].sections.some((section) => section.groups.some((group) => group.type === "circuit"))).toBe(true);
    expect(review.program.days[0].sections.some((section) => section.groups.some((group) => group.type === "superset"))).toBe(true);
  });

  it("keeps unknown exercises importable with warnings", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Mystery Day",
        sections: [
          {
            type: "strength",
            exercise_groups: [{ exercises: [{ name: "Moon Lunge", sets: 3, reps: "10" }] }]
          }
        ]
      })
    );

    expect(review.program.days[0].sections[0].groups[0].exercises[0].name).toBe("Moon Lunge");
    expect(review.warnings[0].message).toContain("Moon Lunge");
  });

  it("carries rawName on unmatched exercise warnings", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Test",
        sections: [
          {
            type: "strength",
            exercise_groups: [{ exercises: [{ name: "Moon Lunge", sets: 3, reps: "10" }] }]
          }
        ]
      })
    );

    expect(review.warnings[0].rawName).toBe("Moon Lunge");
  });

  it("trims whitespace from string fields (program title)", () => {
    const review = parseProgramJson(
      JSON.stringify({
        program_name: "  Padded Title  ",
        sections: [
          {
            type: "strength",
            exercise_groups: [{ exercises: [{ name: "Squat", sets: 3 }] }]
          }
        ]
      })
    );

    expect(review.program.title).toBe("Padded Title");
  });

  it("trims whitespace from exercise name", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Test",
        sections: [
          {
            type: "strength",
            exercise_groups: [{ exercises: [{ name: "  Squat  ", sets: 3 }] }]
          }
        ]
      })
    );

    expect(review.program.days[0].sections[0].groups[0].exercises[0].name).toBe("Squat");
  });

  it("trims whitespace from optional string fields (notes)", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Test",
        sections: [
          {
            type: "strength",
            exercise_groups: [{ exercises: [{ name: "Squat", notes: "  focus on depth  " }] }]
          }
        ]
      })
    );

    expect(review.program.days[0].sections[0].groups[0].exercises[0].notes).toBe("focus on depth");
  });

  it("defaults program.goal from the profile snapshot's primaryGoal", () => {
    const profile = {
      id: "local-profile" as const,
      name: "T", goals: [], equipment: [], constraints: [],
      trainingAge: "", defaultDaysPerWeek: 3, updatedAt: "",
      primaryGoal: "strength" as const,
    };
    const { program } = normalizePayload({ days: [minimalDay(1, "Day 1")] }, profile);
    expect(program.goal).toBe("strength");
  });

  it("leaves program.goal undefined without a primaryGoal", () => {
    const { program } = normalizePayload({ days: [minimalDay(1, "Day 1")] });
    expect(program.goal).toBeUndefined();
  });
});

describe("countsTowardVolume field preservation", () => {
  const withExercise = (exercise: Record<string, unknown>) =>
    JSON.stringify({
      title: "Test",
      sections: [
        {
          type: "strength",
          exercise_groups: [{ exercises: [{ name: "Squat", sets: 3, ...exercise }] }]
        }
      ]
    });

  it("survives an explicit countsTowardVolume:true", () => {
    const review = parseProgramJson(withExercise({ countsTowardVolume: true }));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(true);
  });

  it("survives an explicit countsTowardVolume:false", () => {
    const review = parseProgramJson(withExercise({ countsTowardVolume: false }));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(false);
  });

  it("survives an explicit counts_toward_volume:true (snake_case alias)", () => {
    const review = parseProgramJson(withExercise({ counts_toward_volume: true }));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(true);
  });

  it("survives an explicit counts_toward_volume:false (snake_case alias)", () => {
    const review = parseProgramJson(withExercise({ counts_toward_volume: false }));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(false);
  });

  it("rejects a string \"true\" value, leaving countsTowardVolume undefined", () => {
    const review = parseProgramJson(withExercise({ countsTowardVolume: "true" }));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBeUndefined();
  });

  it("leaves countsTowardVolume undefined when the field is missing", () => {
    const review = parseProgramJson(withExercise({}));
    expect(review.program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBeUndefined();
  });

  it("discards unknown fields on the exercise (sanity check for the literal rebuild)", () => {
    const review = parseProgramJson(withExercise({ someUnknownField: "whatever" }));
    const exercise = review.program.days[0].sections[0].groups[0].exercises[0] as Record<string, unknown>;
    expect(exercise.someUnknownField).toBeUndefined();
  });
});

describe("multi-week import", () => {
  it("sets lengthWeeks from the weeks field", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "6-Week Block", weeks: 6, days: [minimalDay(1, "Push")] })
    );
    expect(review.program.lengthWeeks).toBe(6);
  });

  it("expands base days across all weeks", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push"), minimalDay(2, "Pull")],
      })
    );
    expect(review.program.days).toHaveLength(8);
  });

  it("assigns correct weekNumber to each expanded day", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "2-Week Block",
        weeks: 2,
        days: [minimalDay(1, "Day A"), minimalDay(2, "Day B")],
      })
    );
    const weekNumbers = review.program.days.map((d) => d.weekNumber);
    expect(weekNumbers).toEqual([1, 1, 2, 2]);
  });

  it("preserves dayNumber on every expanded day", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "2-Week Block",
        weeks: 2,
        days: [minimalDay(1, "Day A"), minimalDay(2, "Day B")],
      })
    );
    const dayNumbers = review.program.days.map((d) => d.dayNumber);
    expect(dayNumbers).toEqual([1, 2, 1, 2]);
  });

  it("gives each expanded day a unique id", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "3-Week Block", weeks: 3, days: [minimalDay(1, "Day A")] })
    );
    const ids = review.program.days.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("does not expand when weeks is absent (single-week stays as-is)", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "One Week", days: [minimalDay(1, "Push"), minimalDay(2, "Pull")] })
    );
    expect(review.program.days).toHaveLength(2);
    expect(review.program.lengthWeeks).toBeUndefined();
  });

  it("parses week-scope overrides into ProgramOverride objects", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 4, reason: "Deload", days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    expect(review.program.overrides).toHaveLength(1);
    expect(review.program.overrides[0].scope).toBe("week");
    expect(review.program.overrides[0].weekNumber).toBe(4);
    expect(review.program.overrides[0].reason).toBe("Deload");
  });

  it("normalizes replacement days inside overrides", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 3, days: [minimalDay(1, "Deload Push")] },
        ],
      })
    );
    const replacement = review.program.overrides[0].replacement;
    const rDays = Array.isArray(replacement) ? replacement : [replacement];
    expect(rDays[0].title).toBe("Deload Push");
    expect(rDays[0].id).toBeTruthy();
  });

  it("does not produce duplicate warning paths when overrides share exercises with base days", () => {
    const unknownDay = (day: number, title: string) => ({
      day,
      title,
      sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }],
    });
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [unknownDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 4, reason: "Deload", days: [unknownDay(1, "Push Light")] },
        ],
      })
    );
    const paths = review.warnings.map((w) => w.path);
    expect(paths.length).toBe(new Set(paths).size);
  });

  it("defaults override scope to week when scope is absent", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [{ weekNumber: 2, days: [minimalDay(1, "Alt Push")] }],
      })
    );
    expect(review.program.overrides[0].scope).toBe("week");
  });
});

describe("parseProgramJson error messages", () => {
  it("throws an actionable message when no days are found", () => {
    expect(() => parseProgramJson(JSON.stringify({ title: "Test" }))).toThrow(
      /No workout days found/
    );
    expect(() => parseProgramJson(JSON.stringify({ title: "Test" }))).toThrow(
      /"days" array/
    );
  });

  it("throws a JSON parse error for invalid JSON", () => {
    expect(() => parseProgramJson("not json")).toThrow(/not valid JSON/);
  });

  it("strips ```json fenced output before parsing", () => {
    const fenced = "```json\n" + JSON.stringify({
      title: "Fenced Program",
      sections: [{ type: "strength", exercise_groups: [{ exercises: [{ name: "Squat" }] }] }],
    }) + "\n```";
    const review = parseProgramJson(fenced);
    expect(review.program.title).toBe("Fenced Program");
  });

  it("strips plain ``` fences without language tag", () => {
    const fenced = "```\n" + JSON.stringify({
      title: "Bare Fence",
      sections: [{ type: "strength", exercise_groups: [{ exercises: [{ name: "Squat" }] }] }],
    }) + "\n```";
    const review = parseProgramJson(fenced);
    expect(review.program.title).toBe("Bare Fence");
  });

  it("trims leading preamble text before the first JSON brace", () => {
    const wrapped = 'Here is your routine:\n\n' + JSON.stringify({
      title: "Preamble Test",
      sections: [{ type: "strength", exercise_groups: [{ exercises: [{ name: "Squat" }] }] }],
    });
    const review = parseProgramJson(wrapped);
    expect(review.program.title).toBe("Preamble Test");
  });
});

const DAY = '{"days":[{"title":"A","sections":[{"name":"Main","type":"strength","groups":[{"type":"single","exercises":[{"name":"Squat","sets":3,"reps":"5"}]}]}]}]}';

describe("parseProgramJson sanitizer integration", () => {
  it("imports JSON that has trailing prose after the closing brace", () => {
    const { program } = parseProgramJson(`${DAY}\n\nLet me know if you want tweaks!`);
    expect(program.days.length).toBe(1);
  });

  it("repairs smart quotes in pasted JSON", () => {
    const raw = DAY.replace('"title":"A"', "\u201Ctitle\u201D:\u201CA\u201D");
    const { program } = parseProgramJson(raw);
    expect(program.days[0].title).toBe("A");
  });

  it("throws ImportError with reason 'truncated' for cut-off JSON", () => {
    expect.assertions(2);
    try {
      parseProgramJson('{"days":[{"title":"A"');
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).reason).toBe("truncated");
    }
  });

  it("throws ImportError with reason 'no-days' when days are missing", () => {
    try {
      parseProgramJson('{"title":"Empty"}');
    } catch (e) {
      expect((e as ImportError).reason).toBe("no-days");
    }
  });
});

describe("canonical base-day warning paths (non-sequential day numbers)", () => {
  const unknownDay = (day: number, title: string) => ({
    day,
    title,
    sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }],
  });

  it("keys the warning path by the declared day number, not the array index", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Non-Sequential Days",
        days: [minimalDay(1, "Day 1"), unknownDay(3, "Day 3"), minimalDay(5, "Day 5")],
      })
    );

    expect(review.warnings).toHaveLength(1);
    expect(review.warnings[0].path).toBe(baseExercisePath(3, 0, 0, 0));
    expect(review.warnings[0].path).not.toBe(baseExercisePath(2, 0, 0, 0));
  });

  it("applies a resolution to declared Day 3 only, leaving Day 1 and Day 5 untouched", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Non-Sequential Days",
        days: [minimalDay(1, "Day 1"), unknownDay(3, "Day 3"), minimalDay(5, "Day 5")],
      })
    );

    const warningPath = review.warnings[0].path;
    const patched = applyResolutions(review.program, [
      { path: warningPath, canonicalId: "lunge-canonical" },
    ]);

    const day1 = patched.days.find((d) => d.dayNumber === 1)!;
    const day3 = patched.days.find((d) => d.dayNumber === 3)!;
    const day5 = patched.days.find((d) => d.dayNumber === 5)!;

    expect(day3.sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("lunge-canonical");
    // Day 1 and Day 5 (both "Squat", never touched by the resolution) are
    // structurally unchanged by patching Day 3.
    expect(day1).toEqual(review.program.days.find((d) => d.dayNumber === 1));
    expect(day5).toEqual(review.program.days.find((d) => d.dayNumber === 5));
  });
});

describe("duplicate base-day diagnostics", () => {
  it("flags a structural warning for real duplicate base day numbers", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Duplicate Base Days",
        days: [minimalDay(1, "Day 1"), minimalDay(3, "Day 3a"), minimalDay(3, "Day 3b")],
      })
    );

    const structural = review.warnings.filter((w) => w.rawName === undefined);
    expect(structural).toHaveLength(1);
    expect(structural[0].message).toMatch(/duplicate/i);
    expect(structural[0].message).toMatch(/3/);
  });

  it("does NOT flag a duplicate-day warning for legitimate weekly expansion", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
      })
    );

    expect(review.program.days).toHaveLength(4);
    const structural = review.warnings.filter((w) => /duplicate/i.test(w.message));
    expect(structural).toHaveLength(0);
  });

  it("does not apply an exercise resolution through an ambiguous duplicate-day path", () => {
    const unknownDay = (day: number, title: string) => ({
      day,
      title,
      sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }],
    });
    const review = parseProgramJson(
      JSON.stringify({
        title: "Duplicate Base Days With Unmatched Exercise",
        days: [unknownDay(3, "Day 3a"), unknownDay(3, "Day 3b")],
      })
    );

    const exerciseWarnings = review.warnings.filter((w) => w.rawName !== undefined);
    expect(exerciseWarnings.length).toBeGreaterThan(0);
    const ambiguousPath = exerciseWarnings[0].path;

    const patched = applyResolutions(review.program, [
      { path: ambiguousPath, canonicalId: "lunge-canonical" },
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
