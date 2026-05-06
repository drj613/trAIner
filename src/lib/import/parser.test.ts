import example from "@/test/fixtures/example-structure.json";
import { normalizePayload, parseProgramJson } from "./parser";

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
