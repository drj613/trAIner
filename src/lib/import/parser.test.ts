import example from "@/test/fixtures/example-structure.json";
import variantsFixture from "./__fixtures__/variants-multiweek.json";
import { normalizePayload, parseProgramJson, ImportError } from "./parser";
import { applyResolutions, extractUnresolvedExercises } from "./resolution";
import { baseExercisePath } from "./paths";
import { getRenderableDays } from "@/lib/programs/overrides";

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
    expect(review.warnings[0].path).toBe(baseExercisePath(3, undefined, 0, 0, 0));
    expect(review.warnings[0].path).not.toBe(baseExercisePath(2, undefined, 0, 0, 0));
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

// F2 regression: a flat week-tagged day list (no top-level `weeks`, so
// expandDays is a no-op) can carry two base days that share a dayNumber but
// declare DIFFERENT explicit weekNumbers. The ambiguity guard in
// resolution.ts correctly treats these as distinct (different `${week}:${day}`
// keys), but baseExercisePath ignored week entirely, so both emitted the
// SAME warning path and a resolution applied to one silently patched the
// other's (different) exercise too.
describe("explicit-week base days sharing a dayNumber (F2)", () => {
  const explicitWeekDay = (dayNumber: number, weekNumber: number, exerciseName: string) => ({
    day: dayNumber,
    weekNumber,
    title: `Week ${weekNumber} Day ${dayNumber}`,
    sections: [{ type: "strength", groups: [{ exercises: [{ name: exerciseName }] }] }],
  });

  it("gives distinct warning paths to two explicit-week days sharing a dayNumber", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Flat Week-Tagged Days",
        days: [explicitWeekDay(1, 1, "Moon Lunge"), explicitWeekDay(1, 2, "Moon Walk")],
      })
    );

    // Two exercise-resolution warnings (one per explicit-week day), plus the
    // separate structural "Day 1 declared twice" diagnostic (harmless and
    // expected — these two days DO share a literal dayNumber; that
    // diagnostic is keyed purely on dayNumber and is not part of this fix).
    const exerciseWarnings = review.warnings.filter((w) => w.rawName !== undefined);
    expect(exerciseWarnings).toHaveLength(2);
    const paths = exerciseWarnings.map((w) => w.path);
    expect(new Set(paths).size).toBe(2);
  });

  it("resolving the week-1 day's exercise does not patch the week-2 day's different exercise", () => {
    const review = parseProgramJson(
      JSON.stringify({
        title: "Flat Week-Tagged Days",
        days: [explicitWeekDay(1, 1, "Moon Lunge"), explicitWeekDay(1, 2, "Moon Walk")],
      })
    );

    const week1Warning = review.warnings.find((w) => w.rawName === "Moon Lunge")!;
    const week2Warning = review.warnings.find((w) => w.rawName === "Moon Walk")!;
    expect(week1Warning.path).not.toBe(week2Warning.path);

    const patched = applyResolutions(review.program, [
      { path: week1Warning.path, canonicalId: "lunge-canonical" },
    ]);

    const week1Day = patched.days.find((d) => d.weekNumber === 1)!;
    const week2Day = patched.days.find((d) => d.weekNumber === 2)!;

    expect(week1Day.sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("lunge-canonical");
    // The week-2 day's DIFFERENT exercise ("Moon Walk") must be left
    // untouched — it must never inherit week 1's resolution.
    expect(week2Day.sections[0].groups[0].exercises[0].canonicalExerciseId).toBeUndefined();
  });

  it("still applies a single base resolution to every mechanical week-clone (Case A must not regress)", () => {
    // Normal template: base days carry NO explicit weekNumber, and
    // top-level `weeks` fans them out via expandDays. All week-clones of
    // "day 1" must keep sharing one canonical resolution path.
    const review = parseProgramJson(
      JSON.stringify({
        title: "3-Week Block",
        weeks: 3,
        days: [minimalDay(1, "Push"), { day: 2, title: "Pull", sections: [{ type: "strength", groups: [{ exercises: [{ name: "Moon Lunge" }] }] }] }],
      })
    );

    expect(review.program.days).toHaveLength(6);
    expect(review.warnings).toHaveLength(1);

    const patched = applyResolutions(review.program, [
      { path: review.warnings[0].path, canonicalId: "lunge-canonical" },
    ]);

    const day2Clones = patched.days.filter((d) => d.dayNumber === 2);
    expect(day2Clones).toHaveLength(3);
    for (const clone of day2Clones) {
      expect(clone.sections[0].groups[0].exercises[0].canonicalExerciseId).toBe("lunge-canonical");
    }
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

// A base exercise carrying a `variants` array. Helper for the variant suites.
const variantDay = (exercise: Record<string, unknown>) => ({
  day: 1,
  title: "Day 1",
  sections: [{ name: "Main", type: "strength", groups: [{ type: "single", exercises: [exercise] }] }],
});

describe("variant parsing warnings (Stage 2)", () => {
  it("emits a variant warning on the variants.{v} path for an unmatched variant name", () => {
    const review = normalizePayload({
      title: "Variant Warn",
      days: [
        variantDay({
          name: "Squat",
          sets: 3,
          reps: "5",
          variants: [{ weeks: [2], name: "Totally Fake Movement XYZ" }],
        }),
      ],
    });

    const variantWarning = review.warnings.find((w) => w.path.endsWith(".exercises.0.variants.0"));
    expect(variantWarning).toBeDefined();
    expect(variantWarning!.rawName).toBe("Totally Fake Movement XYZ");
    expect(variantWarning!.message).toMatch(
      /^Totally Fake Movement XYZ was imported without a catalog match\.$/,
    );
    expect(variantWarning!.sectionType).toBe("strength");
  });

  it("does not emit a variant warning when the variant name resolves", () => {
    const review = normalizePayload({
      title: "Variant Resolves",
      days: [
        variantDay({
          name: "Squat",
          sets: 3,
          reps: "5",
          variants: [{ weeks: [2], name: "Front Squat" }],
        }),
      ],
    });

    expect(review.warnings.some((w) => w.path.includes(".variants."))).toBe(false);
  });

  it("does not emit a variant warning when the variant omits name", () => {
    const review = normalizePayload({
      title: "Variant No Name",
      days: [
        variantDay({
          name: "Squat",
          sets: 3,
          reps: "5",
          variants: [{ weeks: [2], load: "70%" }],
        }),
      ],
    });

    expect(review.warnings.some((w) => w.path.includes(".variants."))).toBe(false);
  });

  it("extractUnresolvedExercises surfaces the variant warning as a resolution item", () => {
    const review = normalizePayload({
      title: "Variant Unresolved",
      days: [
        variantDay({
          name: "Squat",
          sets: 3,
          reps: "5",
          variants: [{ weeks: [2], name: "Totally Fake Movement XYZ" }],
        }),
      ],
    });

    const items = extractUnresolvedExercises(review.warnings);
    const variantItem = items.find((i) => i.path.endsWith(".exercises.0.variants.0"));
    expect(variantItem).toBeDefined();
    expect(variantItem!.rawName).toBe("Totally Fake Movement XYZ");
  });
});

describe("variant expansion (Stage 3)", () => {
  // 4-week program, one base day, one section, one group with three base
  // exercises carrying variants, plus a sibling section with no variants.
  const buildReview = () =>
    normalizePayload({
      title: "Variant Expansion",
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
                      name: "Deadlift",
                      sets: 4,
                      reps: "5",
                      load: "80%",
                      variants: [
                        { weeks: [2], name: "Stiff-Leg Deadlift" },
                        { weeks: [3], name: "Deficit Deadlift", load: "70%" },
                      ],
                    },
                    {
                      name: "Bench Press",
                      sets: 3,
                      reps: "5",
                      variants: [{ weeks: [2, 4], name: "Front Squat" }],
                    },
                    {
                      name: "Overhead Press",
                      sets: 3,
                      reps: "8",
                      variants: [{ weeks: [2], load: "60%" }],
                    },
                  ],
                },
              ],
            },
            {
              name: "Accessory",
              type: "accessory",
              groups: [{ type: "single", exercises: [{ name: "Squat", sets: 3, reps: "10" }] }],
            },
          ],
        },
      ],
    });

  const dayForWeek = (review: ReturnType<typeof buildReview>, week: number) =>
    review.program.days.find((d) => d.weekNumber === week)!;
  const ex = (review: ReturnType<typeof buildReview>, week: number, exIndex: number) =>
    dayForWeek(review, week).sections[0].groups[0].exercises[exIndex];

  it("expands variant names per week", () => {
    const review = buildReview();
    const names = [1, 2, 3, 4].map((w) => ex(review, w, 0).name);
    expect(names).toEqual(["Deadlift", "Stiff-Leg Deadlift", "Deficit Deadlift", "Deadlift"]);
  });

  it("sparse inheritance keeps base fields, overrides only present ones", () => {
    const review = buildReview();
    const w2 = ex(review, 2, 0); // Stiff-Leg (only name)
    expect(w2.sets).toBe(4);
    expect(w2.reps).toBe("5");
    expect(w2.load).toBe("80%");
    const w3 = ex(review, 3, 0); // Deficit (name + load)
    expect(w3.sets).toBe(4);
    expect(w3.reps).toBe("5");
    expect(w3.load).toBe("70%");
  });

  it("swapped exercise gets a fresh id distinct from base and from other variant weeks", () => {
    const review = buildReview();
    const w1 = ex(review, 1, 0).id;
    const w2 = ex(review, 2, 0).id;
    const w3 = ex(review, 3, 0).id;
    expect(new Set([w1, w2, w3]).size).toBe(3);
    // [2,4] Front Squat: distinct id per week clone
    const fs2 = ex(review, 2, 1).id;
    const fs4 = ex(review, 4, 1).id;
    expect(fs2).not.toBe(fs4);
  });

  it("deep-clones only the swap path — mutating one week's swapped exercise does not affect others", () => {
    const review = buildReview();
    const w1Name = ex(review, 1, 0).name;
    const w3Name = ex(review, 3, 0).name;
    (ex(review, 2, 0) as { notes?: string }).notes = "MUTATED";
    expect(ex(review, 1, 0).name).toBe(w1Name);
    expect(ex(review, 3, 0).name).toBe(w3Name);
    expect((ex(review, 1, 0) as { notes?: string }).notes).not.toBe("MUTATED");
    // swapped section + group in w2 are fresh objects (not shared with w1)
    expect(dayForWeek(review, 2).sections[0]).not.toBe(dayForWeek(review, 1).sections[0]);
    expect(dayForWeek(review, 2).sections[0].groups[0]).not.toBe(
      dayForWeek(review, 1).sections[0].groups[0],
    );
  });

  it("structural sharing preserved for siblings not on the swap path", () => {
    const review = buildReview();
    // Section 1 (Accessory) has no variants — same reference across weeks.
    const s1w1 = dayForWeek(review, 1).sections[1];
    const s1w2 = dayForWeek(review, 2).sections[1];
    expect(s1w2).toBe(s1w1);
  });

  it("no variants/__variants key leaks into stored program.days", () => {
    const review = buildReview();
    const seen: string[] = [];
    const walk = (obj: unknown) => {
      if (Array.isArray(obj)) return obj.forEach(walk);
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          if (k === "variants" || k === "__variants") seen.push(k);
          walk((obj as Record<string, unknown>)[k]);
        }
      }
    };
    walk(review.program.days);
    expect(seen).toEqual([]);
  });

  it("canonicalExerciseId: named variant carries its own match; nameless inherits base", () => {
    const review = buildReview();
    // Front Squat variant (matched) carries its own canonicalExerciseId
    const fs2 = ex(review, 2, 1);
    expect(fs2.canonicalExerciseId).toBeDefined();
    // Overhead Press nameless variant inherits base canonicalExerciseId
    const baseOhp = ex(review, 1, 2).canonicalExerciseId;
    const w2Ohp = ex(review, 2, 2).canonicalExerciseId;
    expect(w2Ohp).toBe(baseOhp);
    expect(w2Ohp).toBeDefined();
  });
});

describe("variant diagnostics (Stage 4)", () => {
  const baseExercise = (variants: unknown) => ({
    name: "Deadlift",
    sets: 4,
    reps: "5",
    variants,
  });
  const build = (weeks: number | undefined, variants: unknown) =>
    normalizePayload({
      title: "Diag",
      ...(weeks !== undefined ? { weeks } : {}),
      days: [
        {
          day: 1,
          title: "Day 1",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [{ type: "single", exercises: [baseExercise(variants)] }],
            },
          ],
        },
      ],
    });

  it("variant week beyond program length is dropped with a warning", () => {
    const review = build(3, [{ weeks: [2, 5], name: "Stiff-Leg Deadlift" }]);
    // week 2 clone has the swap
    const w2 = review.program.days.find((d) => d.weekNumber === 2)!;
    expect(w2.sections[0].groups[0].exercises[0].name).toBe("Stiff-Leg Deadlift");
    // no week-5 clone exists
    expect(review.program.days.some((d) => d.weekNumber === 5)).toBe(false);
    const warning = review.warnings.find((w) => w.message.includes("exceeds the program length (3 weeks)"));
    expect(warning).toBeDefined();
    expect(warning!.path).toBe(baseExercisePath(1, undefined, 0, 0, 0));
  });

  it("variants on a single-week program are ignored with a warning", () => {
    const review = build(undefined, [{ weeks: [2], name: "Stiff-Leg Deadlift" }]);
    expect(review.program.days).toHaveLength(1);
    expect(review.program.days[0].sections[0].groups[0].exercises[0].name).toBe("Deadlift");
    const warning = review.warnings.find((w) => w.message.includes("ignored because the program is a single week"));
    expect(warning).toBeDefined();
  });

  it("duplicate week across two variants: later wins, with a warning", () => {
    const review = build(2, [
      { weeks: [2], name: "First" },
      { weeks: [2], name: "Second" },
    ]);
    const w2 = review.program.days.find((d) => d.weekNumber === 2)!;
    expect(w2.sections[0].groups[0].exercises[0].name).toBe("Second");
    const warning = review.warnings.find(
      (w) => w.message.includes("Multiple variants of") && w.message.includes('the last one ("Second")'),
    );
    expect(warning).toBeDefined();
  });
});

describe("fixture: variants-multiweek (Stage 7)", () => {
  const review = () => normalizePayload(variantsFixture);
  const day1 = (program: ReturnType<typeof review>["program"], week: number) =>
    program.days.find((d) => d.weekNumber === week && d.dayNumber === 1)!;
  const strengthEx = (program: ReturnType<typeof review>["program"], week: number, exIndex: number) =>
    // day 1 sections: [0]=Warmup, [1]=Main Strength
    day1(program, week).sections[1].groups[0].exercises[exIndex];

  it("variant names expand correctly across 4 weeks", () => {
    const { program } = review();
    // Squat slot (exercises[0]) alternates via a [2,4] variant
    const squatNames = [1, 2, 3, 4].map((w) => strengthEx(program, w, 0).name);
    expect(squatNames).toEqual(["Barbell Back Squat", "Front Squat", "Barbell Back Squat", "Front Squat"]);
    // RDL slot (exercises[1]) swaps only on week 3
    const rdlNames = [1, 2, 3, 4].map((w) => strengthEx(program, w, 1).name);
    expect(rdlNames).toEqual([
      "Romanian deadlift",
      "Romanian deadlift",
      "Deficit Romanian deadlift",
      "Romanian deadlift",
    ]);
  });

  it("sparse-override variant inherits sets/reps/tags, overrides load", () => {
    const { program } = review();
    const base = strengthEx(program, 1, 1);
    const w3 = strengthEx(program, 3, 1);
    expect(w3.sets).toBe(base.sets);
    expect(w3.reps).toBe(base.reps);
    expect(w3.tags).toEqual(base.tags);
    expect(w3.load).toBe("63 kg");
    expect(base.load).toBe("70 kg");
  });

  it("override wins over variant on the overlapping week", () => {
    const { program } = review();
    const rendered = getRenderableDays(program);
    const week3Day1 = rendered.find((d) => d.weekNumber === 3 && d.dayNumber === 1)!;
    const names = week3Day1.sections.flatMap((s) => s.groups.flatMap((g) => g.exercises.map((e) => e.name)));
    expect(names).toContain("Leg Press");
    expect(names).not.toContain("Deficit Romanian deadlift");
  });
});

describe("variants inside override replacement days (defect: overrides leak)", () => {
  const build = () =>
    normalizePayload({
      title: "Override Variant Leak",
      weeks: 4,
      days: [
        {
          day: 1,
          title: "Day 1",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [{ type: "single", exercises: [{ name: "Squat", sets: 3, reps: "5" }] }],
            },
          ],
        },
      ],
      overrides: [
        {
          scope: "week",
          weekNumber: 3,
          reason: "Deload",
          days: [
            {
              day: 1,
              title: "Deload Day 1",
              sections: [
                {
                  name: "Main",
                  type: "strength",
                  groups: [
                    {
                      type: "single",
                      exercises: [
                        {
                          name: "Squat",
                          sets: 2,
                          reps: "5",
                          // A variant inside an override day — out of scope,
                          // must not persist and must not orphan a warning.
                          variants: [{ weeks: [3], name: "Totally Fake Movement XYZ" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

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

  it("does not leak variants/__variants into the whole program (incl. overrides), minus rawJson", () => {
    const { program } = build();
    const { import: importSection, ...programSansImport } = program;
    const importMinusRaw = importSection ? { warnings: importSection.warnings } : undefined;
    expect(hasVariantKey({ ...programSansImport, import: importMinusRaw })).toBe(false);
  });

  it("does not surface an override-day variant as a resolution item", () => {
    const { warnings } = build();
    const items = extractUnresolvedExercises(warnings);
    expect(items.some((i) => i.path.includes("overrides.") && i.path.includes(".variants."))).toBe(false);
  });
});
