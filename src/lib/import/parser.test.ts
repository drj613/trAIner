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

describe("progression field parsing", () => {
  const withProgression = (progression: unknown) =>
    JSON.stringify({
      title: "Test",
      progression,
      days: [minimalDay(1, "Day 1")],
    });

  it("survives valid progression entries", () => {
    const review = parseProgramJson(
      withProgression([
        { applies: "Primary compounds", rule: "Add 2.5-5% load when top set hits RPE8 for all reps." },
        { applies: "Hypertrophy accessories", rule: "Double progression: add reps, then +5-10% load and reset." },
      ])
    );
    expect(review.program.progression).toEqual([
      { applies: "Primary compounds", rule: "Add 2.5-5% load when top set hits RPE8 for all reps." },
      { applies: "Hypertrophy accessories", rule: "Double progression: add reps, then +5-10% load and reset." },
    ]);
  });

  it("drops an entry missing applies", () => {
    const review = parseProgramJson(
      withProgression([{ rule: "Add load weekly." }, { applies: "Compounds", rule: "Add 5% load monthly." }])
    );
    expect(review.program.progression).toEqual([{ applies: "Compounds", rule: "Add 5% load monthly." }]);
  });

  it("drops an entry missing rule", () => {
    const review = parseProgramJson(
      withProgression([{ applies: "Compounds" }, { applies: "Accessories", rule: "Add 1 rep/week." }])
    );
    expect(review.program.progression).toEqual([{ applies: "Accessories", rule: "Add 1 rep/week." }]);
  });

  it("drops an entry with non-string applies/rule", () => {
    const review = parseProgramJson(
      withProgression([
        { applies: 5, rule: "Add load." },
        { applies: "Compounds", rule: null },
        { applies: "Accessories", rule: "Add 1 rep/week." },
      ])
    );
    expect(review.program.progression).toEqual([{ applies: "Accessories", rule: "Add 1 rep/week." }]);
  });

  it("trims whitespace on applies and rule", () => {
    const review = parseProgramJson(
      withProgression([{ applies: "  Compounds  ", rule: "  Add load.  " }])
    );
    expect(review.program.progression).toEqual([{ applies: "Compounds", rule: "Add load." }]);
  });

  it("is undefined when the resulting array would be empty", () => {
    const review = parseProgramJson(withProgression([{ applies: "", rule: "" }, { rule: "x" }]));
    expect(review.program.progression).toBeUndefined();
  });

  it("is undefined for an empty array", () => {
    const review = parseProgramJson(withProgression([]));
    expect(review.program.progression).toBeUndefined();
  });

  it("is undefined when the field is absent", () => {
    const review = parseProgramJson(JSON.stringify({ title: "Test", days: [minimalDay(1, "Day 1")] }));
    expect(review.program.progression).toBeUndefined();
  });

  it("is undefined (no throw) when progression is not an array", () => {
    const review = parseProgramJson(withProgression("not an array"));
    expect(review.program.progression).toBeUndefined();
  });

  it("is undefined (no throw) when progression is an object, not an array", () => {
    const review = parseProgramJson(withProgression({ applies: "x", rule: "y" }));
    expect(review.program.progression).toBeUndefined();
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

  it("coerces a stringified integer weeks value (\"4\") and expands accordingly", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "4-Week Block", weeks: "4", days: [minimalDay(1, "Push")] })
    );
    expect(review.program.lengthWeeks).toBe(4);
    expect(review.program.days).toHaveLength(4);
  });

  it("still accepts a numeric weeks value", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "4-Week Block", weeks: 4, days: [minimalDay(1, "Push")] })
    );
    expect(review.program.lengthWeeks).toBe(4);
    expect(review.program.days).toHaveLength(4);
  });

  it("treats a non-numeric weeks string as absent (no throw, single-week)", () => {
    const review = parseProgramJson(
      JSON.stringify({ title: "One Week", weeks: "abc", days: [minimalDay(1, "Push")] })
    );
    expect(review.program.lengthWeeks).toBeUndefined();
    expect(review.program.days).toHaveLength(1);
  });

  it("treats weeks: 0 and weeks: \"0\" as absent (no throw, single-week)", () => {
    const numeric = parseProgramJson(
      JSON.stringify({ title: "One Week", weeks: 0, days: [minimalDay(1, "Push")] })
    );
    expect(numeric.program.lengthWeeks).toBeUndefined();
    expect(numeric.program.days).toHaveLength(1);

    const stringified = parseProgramJson(
      JSON.stringify({ title: "One Week", weeks: "0", days: [minimalDay(1, "Push")] })
    );
    expect(stringified.program.lengthWeeks).toBeUndefined();
    expect(stringified.program.days).toHaveLength(1);
  });

  it("treats weeks: -1 and weeks: \"-1\" as absent (no throw, single-week)", () => {
    const numeric = parseProgramJson(
      JSON.stringify({ title: "One Week", weeks: -1, days: [minimalDay(1, "Push")] })
    );
    expect(numeric.program.lengthWeeks).toBeUndefined();
    expect(numeric.program.days).toHaveLength(1);

    const stringified = parseProgramJson(
      JSON.stringify({ title: "One Week", weeks: "-1", days: [minimalDay(1, "Push")] })
    );
    expect(stringified.program.lengthWeeks).toBeUndefined();
    expect(stringified.program.days).toHaveLength(1);
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

  it("propagates an unmatched-exercise warning from inside an override replacement", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          {
            scope: "week",
            weekNumber: 4,
            days: [
              {
                day: 1,
                title: "Push Light",
                sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }],
              },
            ],
          },
        ],
      })
    );

    const overrideWarning = review.warnings.find((w) => w.rawName === "Moon Lunge");
    expect(overrideWarning).toBeDefined();
    expect(overrideWarning?.path).toBe("overrides.0.days.1.sections.0.groups.0.exercises.0");
  });

  it("uses the declared day number (not array position) in a partial override's warning path", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push"), minimalDay(2, "Pull"), minimalDay(3, "Legs")],
        overrides: [
          {
            scope: "week",
            weekNumber: 4,
            days: [
              {
                day: 3,
                title: "Legs Light",
                sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }],
              },
            ],
          },
        ],
      })
    );

    const overrideWarning = review.warnings.find((w) => w.rawName === "Moon Lunge");
    expect(overrideWarning?.path).toBe("overrides.0.days.3.sections.0.groups.0.exercises.0");
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

describe("override diagnostics (warning-only, never reject/delete/mutate)", () => {
  it("does not flag an out-of-range week warning for a valid override on an expanded week (effective weeks come from expanded days, not the raw base template)", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 4, days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    const outOfRange = review.warnings.filter((w) => /does not match any week/.test(w.message));
    expect(outOfRange).toHaveLength(0);
  });

  it("warns when a week override is missing weekNumber", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    expect(review.warnings.some((w) => w.message === "A week override is missing `weekNumber` and cannot be applied.")).toBe(true);
  });

  it("warns when a week override has no replacement days", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "5-Week Block",
        weeks: 5,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 5, days: [] },
        ],
      })
    );
    const messages = review.warnings.map((w) => w.message);
    expect(messages).toContain("Week 5 override contains no replacement days. The base weekly template will be used unchanged.");
    expect(messages).not.toContain("Week 5 override does not match any week represented by this routine and will not be applied.");
  });

  it("warns when a week override's weekNumber doesn't match any week produced by this routine", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 9, days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    expect(review.warnings.some((w) => w.message === "Week 9 override does not match any week represented by this routine and will not be applied.")).toBe(true);
  });

  it("warns when an override replacement day references a day number absent from the base weekly template", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "6-Week Block",
        weeks: 6,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 6, days: [minimalDay(5, "Ghost Day")] },
        ],
      })
    );
    const messages = review.warnings.map((w) => w.message);
    expect(messages).toContain("Week 6 override references Day 5, which does not exist in the base weekly template. That replacement will not be applied.");
    expect(messages).not.toContain("Week 6 override does not match any week represented by this routine and will not be applied.");
  });

  it("warns with neutral wording when an override replacement day is empty or rest (sections: [])", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push"), minimalDay(2, "Pull")],
        overrides: [
          { scope: "week", weekNumber: 4, days: [{ day: 2, title: "Rest", sections: [] }] },
        ],
      })
    );
    expect(review.warnings.some((w) => w.message === "Week 4, Day 2 replaces the base workout with an empty or rest day. Confirm that this is intentional.")).toBe(true);
  });

  it("warns when an imported day-scope override has no matching internal dayId", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "day", days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    expect(review.warnings.some((w) => w.message === "Imported day-scope overrides cannot be applied without a matching internal routine day. Use a week override with replacement day objects instead.")).toBe(true);
  });

  it("preserves the diagnosed override unchanged — warning-only, never rejected/deleted/mutated", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "4-Week Block",
        weeks: 4,
        days: [minimalDay(1, "Push")],
        overrides: [
          { scope: "week", weekNumber: 9, days: [minimalDay(1, "Push Light")] },
        ],
      })
    );
    expect(review.program.overrides).toHaveLength(1);
    expect(review.program.overrides[0].weekNumber).toBe(9);
    const replacement = review.program.overrides[0].replacement;
    const rDays = Array.isArray(replacement) ? replacement : [replacement];
    expect(rDays[0].title).toBe("Push Light");
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
