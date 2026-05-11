import example from "@/test/fixtures/example-structure.json";
import { normalizePayload, parseProgramJson } from "./parser";

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
