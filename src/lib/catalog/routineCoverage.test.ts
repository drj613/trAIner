import { matchExercise } from "./match";
import additions from "../../../scripts/catalog-normalization/additions.json";
import aliasAdditions from "../../../scripts/catalog-normalization/alias-additions.json";

test.each([
  ["push jerk", "push-jerk"],
  ["bird dog row", "bird-dog-row"],
  ["banded pushdown", "band-triceps-pushdown"],
  ["rolling tricep extension", "rolling-dumbbell-triceps-extension"],
])("matches routine exercise %s without creating a duplicate identity", (name, id) => {
  expect(matchExercise(name)).toMatchObject({ kind: "matched", item: { id } });
});

test("offers throw variants for the broad routine name Med ball throw", () => {
  expect(matchExercise("Med ball throw")).toMatchObject({
    kind: "underspecified",
    movementId: "medicine-ball-throw",
    candidates: expect.arrayContaining([
      expect.objectContaining({ exerciseId: "medicine-ball-chest-pass" }),
      expect.objectContaining({ exerciseId: "medicine-ball-scoop-throw" }),
      expect.objectContaining({ exerciseId: "rotational-throw-medicine-ball" }),
      expect.objectContaining({ exerciseId: "medicine-ball-catch-and-overhead-throw" }),
      expect.objectContaining({ exerciseId: "medicine-ball-supine-chest-throw" }),
    ]),
  });
});

test("every approved new name and alias resolves to its reviewed identity", () => {
  const labels = additions.records.flatMap(({ exercise }) =>
    [exercise.name, ...exercise.aliases].map((name) => ({ name, id: exercise.id })),
  );
  labels.push(...aliasAdditions.records.flatMap((record) =>
    record.aliases.map((name) => ({ name, id: record.exerciseId })),
  ));
  const failures = labels.flatMap(({ name, id }) => {
    const match = matchExercise(name);
    return match.kind === "matched" && match.item.id === id
      ? [] : [{ name, expected: id, actual: match.kind === "matched" ? match.item.id : match.kind }];
  });
  expect(failures).toEqual([]);
});
