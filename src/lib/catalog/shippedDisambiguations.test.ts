// Verifies the reviewed disambiguation rules that actually ship in
// `importDisambiguations.generated.json`. These tests intentionally use the
// real generated artifacts (no fixtures) so an empty or broken manifest fails
// loudly instead of leaving the import-choice flow as dead code.
import { matchExercise } from "./match";
import { prepareImportName } from "./identity";
import { disambiguationsByNormalizedName, disambiguationRules } from "./registries";
import { exerciseCatalog } from "./exercises";
import type { AliasDocument } from "@/lib/programs/types";

const catalogIds = new Set(exerciseCatalog.map((item) => item.id));

function expectUnderspecified(name: string) {
  const result = matchExercise(name);
  if (result.kind !== "underspecified") {
    throw new Error(`expected "${name}" to be underspecified, got ${result.kind}`);
  }
  return result;
}

test("ships at least the reviewed rule families", () => {
  expect(disambiguationRules.length).toBeGreaterThan(0);
  expect(disambiguationRules.some((rule) => rule.kind === "underspecified-name")).toBe(true);
  expect(disambiguationRules.some((rule) => rule.kind === "non-identity-phrase")).toBe(true);
});

test("every shipped rule references only real catalogue ids", () => {
  for (const rule of disambiguationRules) {
    if (rule.kind !== "underspecified-name") continue;
    for (const exerciseId of rule.candidateExerciseIds) {
      expect(catalogIds.has(exerciseId)).toBe(true);
    }
  }
});

test("back squat returns the spec's canonical underspecified choice", () => {
  const result = expectUnderspecified("Back Squat");
  expect(result.movementId).toBe("squat");
  expect(result.candidates.map((candidate) => candidate.exerciseId)).toEqual([
    "barbell-squat",
    "barbell-high-bar-squat",
    "barbell-low-bar-squat",
  ]);
  expect([...result.matchedModifierIds].sort()).toEqual(["back-rack", "barbell"]);
});

test("exact concrete names bypass the underspecified choice", () => {
  const result = matchExercise("High Bar Back Squat");
  expect(result).toMatchObject({ kind: "matched", item: { id: "barbell-high-bar-squat" } });

  const lowBar = matchExercise("Low Bar Back Squat");
  expect(lowBar).toMatchObject({ kind: "matched", item: { id: "barbell-low-bar-squat" } });
});

test("a saved user alias outranks the reviewed back squat rule", () => {
  const alias: AliasDocument = {
    id: "alias-1",
    alias: "Back Squat",
    normalizedAlias: "back squat",
    canonicalExerciseId: "barbell-low-bar-squat",
    provenance: "remembered",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
  const result = matchExercise("back squat", [alias]);
  expect(result).toMatchObject({
    kind: "matched",
    via: "user-alias",
    item: { id: "barbell-low-bar-squat" },
  });
});

test("bare family names return curated choices instead of silent alias matches", () => {
  expect(expectUnderspecified("Squat").candidates.map((c) => c.exerciseId)).toEqual([
    "barbell-squat",
    "squat--barbell--front-rack",
    "bodyweight-squat",
    "dumbbell-squat",
  ]);
  expect(expectUnderspecified("Row").candidates.map((c) => c.exerciseId)).toEqual([
    "row",
    "bent-over-barbell-row",
    "row--cable",
    "row--dumbbell",
    "row--machine",
  ]);
  expect(expectUnderspecified("Lateral Raise").movementId).toBe("raise-fly");
  expect(expectUnderspecified("Lateral Raise").candidates.map((c) => c.exerciseId)).toContain(
    "lateral-raise-dumbbell",
  );
  expect(expectUnderspecified("Shoulder Press").movementId).toBe("overhead-landmine-press");
  expect(expectUnderspecified("Shoulder Press").candidates.map((c) => c.exerciseId)).toContain(
    "overhead-press",
  );
  expect(expectUnderspecified("Split Squat").candidates.map((c) => c.exerciseId)).toContain(
    "bulgarian-split-squat",
  );
});

test("conventional names without a rule keep resolving exactly", () => {
  expect(matchExercise("Bench Press")).toMatchObject({ kind: "matched", item: { id: "bench-press" } });
  expect(matchExercise("Pull Up")).toMatchObject({ kind: "matched", item: { id: "pull-up" } });
  expect(matchExercise("Front Squat")).toMatchObject({ kind: "matched", item: { id: "front-squat" } });
});

test("competition wording strips to the plain identity", () => {
  const prepared = prepareImportName("Competition Bench Press", disambiguationsByNormalizedName);
  expect(prepared.normalizedName).toBe("bench press");
  expect(prepared.nonIdentityAnnotations).toEqual(["competition standard"]);
  expect(matchExercise("Competition Bench Press")).toMatchObject({
    kind: "matched",
    item: { id: "bench-press" },
  });
});

test("pain-free depth wording strips and still reaches the underspecified rule", () => {
  const prepared = prepareImportName("Back squat to pain-free depth", disambiguationsByNormalizedName);
  expect(prepared.normalizedName).toBe("back squat");
  expect(prepared.nonIdentityAnnotations).toEqual(["pain-free depth"]);

  const result = expectUnderspecified("Back squat to pain-free depth");
  expect(result.nonIdentityAnnotations).toEqual(["pain-free depth"]);
});

test("numeric pause wording canonicalizes to the coarse paused identity", () => {
  const prepared = prepareImportName(
    "2-second paused barbell back rack squat",
    disambiguationsByNormalizedName,
  );
  expect(prepared.normalizedName).toBe("paused barbell back rack squat");
  expect(prepared.nonIdentityAnnotations).toEqual(["2-second pause"]);
  expect(matchExercise("2-second paused barbell back rack squat")).toMatchObject({
    kind: "matched",
    item: { id: "squat--barbell--back-rack--paused" },
  });
});

test("alternative prescriptions with 'or' stay unresolved", () => {
  const prepared = prepareImportName(
    "Assisted or bodyweight neutral-grip pull-up",
    disambiguationsByNormalizedName,
  );
  expect(prepared.hasAlternative).toBe(true);
  expect(prepared.nonIdentityAnnotations).toContain("alternative prescription");

  const result = matchExercise("Assisted or bodyweight neutral-grip pull-up");
  expect(result.kind).toBe("unmatched");
});
