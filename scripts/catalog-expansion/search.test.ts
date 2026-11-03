/** @jest-environment node */
import { searchCatalogue, searchTerms, type SearchExercise } from "./search";

const rows: SearchExercise[] = [
  { id: "bench-db", name: "Dumbbell Bench Press", aliases: ["DB Bench"], equipment: ["dumbbell"] },
  { id: "incline", name: "Incline Dumbbell Press", aliases: [], equipment: ["dumbbell"] },
  { id: "decline", name: "Decline Dumbbell Press", aliases: [], equipment: ["dumbbell"] },
  { id: "rdl", name: "Romanian Deadlift", aliases: [], equipment: [] },
  { id: "triceps", name: "Lying Triceps Extension", aliases: [], equipment: [] },
  { id: "abduction", name: "Cable Hip Abduction", aliases: [], equipment: ["cable"] },
  { id: "adduction", name: "Cable Hip Adduction", aliases: [], equipment: ["cable"] },
  { id: "arm", name: "Single Arm Cable Row", aliases: [], equipment: ["cable"] },
];

test.each([
  ["db bench", "bench-db"],
  ["dumbbell incline presses", "incline"],
  ["Romainian deadlift", "rdl"],
  ["skull crusher", "triceps"],
  ["one-arm cable row", "arm"],
])("retrieves %s without reading source rows", (query, expected) => {
  expect(searchCatalogue(rows, [query])[0].hits.map((hit) => hit.id)).toContain(expected);
});

test("keeps similar but opposing movements and explains potential conflicts", () => {
  const result = searchCatalogue(rows, ["cable hip adduction"])[0];
  expect(result.hits[0].id).toBe("adduction");
  expect(result.hits.find((hit) => hit.id === "abduction")?.conflicts).toContain("abduction/adduction");
});

test("does not infer equipment when retrieving a broad label", () => {
  const result = searchCatalogue(rows, ["bench press"])[0];
  expect(result.hits[0].id).toBe("bench-db");
  expect(result.hits[0].match).toBe("similar");
  expect(result.warnings).toContain("Search results are candidates, not identity or novelty decisions.");
});

test("preserves every colliding alias and exposes truncation", () => {
  const result = searchCatalogue([...rows, { ...rows[0], id: "other" }], ["db bench"], 1)[0];
  expect(result.totalCandidates).toBeGreaterThan(1);
  expect(result.hasMore).toBe(true);
  expect(result.hits).toHaveLength(1);
});

test("pending proposals participate and change the corpus fingerprint", () => {
  const before = searchCatalogue(rows, ["new movement"])[0];
  const after = searchCatalogue([...rows, { id: "proposal:1", name: "New Movement", aliases: [], equipment: [] }], ["new movement"])[0];
  expect(after.hits[0].id).toBe("proposal:1");
  expect(after.corpusHash).not.toBe(before.corpusHash);
});

test("empty search never certifies a novel exercise", () => {
  const result = searchCatalogue(rows, ["unrelated zzzzz"])[0];
  expect(result.hits).toEqual([]);
  expect(result.warnings).toContain("Search results are candidates, not identity or novelty decisions.");
});

test("bounds batches and page sizes", () => {
  expect(() => searchCatalogue(rows, Array(21).fill("squat"))).toThrow("20");
  expect(() => searchCatalogue(rows, [" "])).toThrow("query");
  expect(() => searchCatalogue(rows, ["squat"], 101)).toThrow("limit");
});

test("rare anatomical terms outrank common equipment and action words", () => {
  const corpus: SearchExercise[] = [
    { id: "fingers", name: "Elastic Band Finger Spread", aliases: [], equipment: ["band"] },
    ...["", "Standing ", "Seated ", "Overhead ", "Kneeling "].map((prefix, index) => ({
      id: `triceps-${index}`, name: `${prefix}Band Triceps Extension`, aliases: [], equipment: ["band"],
    })),
  ];
  expect(searchCatalogue(corpus, ["finger extension band"])[0].hits[0].id).toBe("fingers");
});

test.each([
  ["Banded Tricep Pressdown", "Band Triceps Pushdown"],
  ["Swiss Ball Plank", "Stability Ball Plank"],
  ["Physioball Plank", "Exercise Ball Plank"],
  ["Med Ball Throws", "Medicine Ball Throw"],
  ["Gymnastic Rings Fly", "Ring Fly"],
])("folds common routine vocabulary %s for duplicate review", (a, b) => {
  expect(searchTerms(a)).toEqual(searchTerms(b));
});
