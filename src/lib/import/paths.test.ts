import { baseExercisePath, variantExercisePath } from "./paths";

describe("variantExercisePath", () => {
  test("appends .variants.{v} to the base path for a template-less day", () => {
    expect(variantExercisePath(4, undefined, 2, 0, 0, 0)).toBe(
      "days.4.sections.2.groups.0.exercises.0.variants.0",
    );
  });

  test("preserves the @w templateWeek segment", () => {
    expect(variantExercisePath(1, 3, 0, 0, 0, 1)).toBe(
      "days.1@w3.sections.0.groups.0.exercises.0.variants.1",
    );
  });

  test("is a strict prefix-extension of baseExercisePath", () => {
    const tuples: [number, number | undefined, number, number, number, number][] = [
      [4, undefined, 2, 0, 0, 0],
      [1, 3, 0, 1, 2, 5],
    ];
    for (const [d, tw, s, g, e, v] of tuples) {
      expect(variantExercisePath(d, tw, s, g, e, v)).toBe(
        `${baseExercisePath(d, tw, s, g, e)}.variants.${v}`,
      );
    }
  });
});
