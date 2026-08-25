// Verifies the reviewed disambiguation rules that actually ship in
// `importDisambiguations.generated.json`. These tests intentionally use the
// real generated artifacts (no fixtures) so an empty or broken manifest fails
// loudly instead of leaving the import-choice flow as dead code.
import { matchExercise } from "./match";
import { prepareImportName } from "./identity";
import { disambiguationsByNormalizedName, disambiguationRules } from "./registries";
import { normalizeExerciseName } from "./normalize";
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

// Every shipped rule pinned in full: token -> movement family + exact ordered
// candidate list. `toContain`-style spot checks let truncation and wrong-family
// mutations survive, so each rule is asserted with `toEqual`.
// `squat--kettlebell` ("Kettlebell Squat") is assigned to the squat family with
// the `kettlebell` modifier, so it belongs here on exactly the footing
// `dumbbell-squat` and `bodyweight-squat` already stand on. Appended last so the
// generic barbell option keeps the leading position.
const squatCandidates = [
  "barbell-squat",
  "squat--barbell--front-rack",
  "bodyweight-squat",
  "dumbbell-squat",
  "squat--kettlebell",
];
const backSquatCandidates = ["barbell-squat", "barbell-high-bar-squat", "barbell-low-bar-squat"];
const lateralRaiseCandidates = [
  "lateral-raise-dumbbell",
  "cable-lateral-raise",
  "lateral-raise-machine",
  "lateral-raise-with-bands",
];
const splitSquatCandidates = ["lunge-split-squat--bodyweight", "bulgarian-split-squat", "dumbbell-split-squat"];

test.each([
  { token: "Barbell Back Squat", movementId: "squat", candidates: backSquatCandidates },
  { token: "Squat", movementId: "squat", candidates: squatCandidates },
  { token: "Squats", movementId: "squat", candidates: squatCandidates },
  {
    token: "Row",
    movementId: "row",
    candidates: ["bent-over-barbell-row", "row--cable", "row--dumbbell", "row--machine"],
  },
  { token: "Lateral Raise", movementId: "raise-fly", candidates: lateralRaiseCandidates },
  { token: "Lateral Raises", movementId: "raise-fly", candidates: lateralRaiseCandidates },
  {
    token: "Shoulder Press",
    movementId: "overhead-landmine-press",
    candidates: ["overhead-press", "dumbbell-shoulder-press", "cable-shoulder-press", "shoulder-press-with-bands"],
  },
  { token: "Split Squat", movementId: "lunge-split-squat", candidates: splitSquatCandidates },
  { token: "Split Squats", movementId: "lunge-split-squat", candidates: splitSquatCandidates },
])("$token returns the curated $movementId choice instead of a silent match", ({ token, movementId, candidates }) => {
  const result = expectUnderspecified(token);
  expect(result.movementId).toBe(movementId);
  expect(result.candidates.map((candidate) => candidate.exerciseId)).toEqual(candidates);
});

test("every shipped underspecified rule offers a real choice", () => {
  for (const rule of disambiguationRules) {
    if (rule.kind !== "underspecified-name") continue;
    expect(rule.candidateExerciseIds.length).toBeGreaterThanOrEqual(2);
  }
});

// Known final-review item: these candidates carry `movementId: null` in the
// shipped catalogue, so choosing them yields `groupKey: "exercise:<id>"` and no
// family nesting or family history. The defect is upstream assignment
// coverage, not the choice lists (the assigned equivalents have unusable
// generated names). This pins the current loss so a fix — or a regression —
// is visible in the suite. It is a CHARACTERIZATION test: when `assignments.json`
// gains coverage this expectation shrinks, and editing it downward is SUCCESS,
// not a regression. Never resolve a failure here by editing the candidate lists.
test("family-less candidates are exactly the known assignment-coverage gaps", () => {
  const byId = new Map(exerciseCatalog.map((item) => [item.id, item]));
  const familyless: Record<string, string[]> = {};
  for (const rule of disambiguationRules) {
    if (rule.kind !== "underspecified-name") continue;
    const gaps = rule.candidateExerciseIds.filter((id) => byId.get(id)?.movementId == null);
    if (gaps.length > 0) familyless[rule.id] = gaps;
  }
  expect(familyless).toEqual({
    "lateral-raise-choice": ["lateral-raise-with-bands"],
    "lateral-raises-choice": ["lateral-raise-with-bands"],
    "shoulder-press-choice": ["dumbbell-shoulder-press", "cable-shoulder-press", "shoulder-press-with-bands"],
    "split-squat-choice": ["bulgarian-split-squat", "dumbbell-split-squat"],
    "split-squats-choice": ["bulgarian-split-squat", "dumbbell-split-squat"],
  });
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

// Each duration is its OWN manifest record, so one row per shipped record.
// Asserted through a real import name rather than by reading the manifest back:
// a manifest-restating test passes whatever the manifest says, including a
// record that ships and never fires. Deleting any single duration record leaves
// its wording unstripped and unmatched, which is what these rows detect.
// (The 2-second row replaces the former single-duration test; its assertions
// are identical, so nothing is lost by folding it into the table.)
test.each([1, 2, 3, 5])(
  "%i-second pause wording canonicalizes to the coarse paused identity",
  (seconds) => {
    const name = `${seconds}-second paused barbell back rack squat`;
    const prepared = prepareImportName(name, disambiguationsByNormalizedName);
    expect(prepared.normalizedName).toBe("paused barbell back rack squat");
    expect(prepared.nonIdentityAnnotations).toEqual([`${seconds}-second pause`]);
    expect(matchExercise(name)).toMatchObject({
      kind: "matched",
      item: { id: "squat--barbell--back-rack--paused" },
    });
  },
);

// The four pain-free wordings are four separate records. The longer "to (a) …"
// forms exist so the leading preposition is consumed too; without them the
// shorter rule fires and leaves a dangling fragment ("back squat to a"), which
// is why each row pins the surviving token exactly instead of only asserting
// that something was stripped. Every row then reaches the real back-squat
// choice, so a deleted record turns an underspecified import into an unmatched
// one and fails here.
test.each([
  { ruleId: "phrase-pain-free", name: "Pain-free back squat", annotation: "pain-free" },
  { ruleId: "phrase-pain-free-depth", name: "Pain-free depth back squat", annotation: "pain-free depth" },
  { ruleId: "phrase-pain-free-depth-to", name: "Back squat to pain-free depth", annotation: "pain-free depth" },
  { ruleId: "phrase-pain-free-depth-to-a", name: "Back squat to a pain-free depth", annotation: "pain-free depth" },
])("$ruleId strips \"$name\" to the bare back squat token", ({ name, annotation }) => {
  const prepared = prepareImportName(name, disambiguationsByNormalizedName);
  expect(prepared.normalizedName).toBe("back squat");
  expect(prepared.nonIdentityAnnotations).toEqual([annotation]);

  const result = expectUnderspecified(name);
  expect(result.movementId).toBe("squat");
  expect(result.nonIdentityAnnotations).toEqual([annotation]);
  expect(result.candidates.map((candidate) => candidate.exerciseId)).toEqual(backSquatCandidates);
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

// The property everything downstream of the re-keying rests on:
// `prepareImportName(x).normalizedName` is *already normalized* and is a *fixed
// point* — preparing it a second time returns it unchanged.
//
// Four separate places rely on it, and none of them can see it break:
//   - `resolveName`'s override match compares
//     `normalizeExerciseName(override.targetValue)` with a prepared name;
//   - the correction sheet's `governingAliases` compares
//     `normalizeExerciseName(alias.normalizedAlias)` with a prepared name;
//   - `aliasLookupToken` runs `normalizeExerciseName` over a stored token that a
//     writer produced with `prepareImportName`, and must not change it;
//   - the post-write `aliasRepo.find(target.value)` was dropped as redundant
//     only because a prepared name prepares to itself.
//
// A curation record whose output still contained a strippable phrase, or whose
// annotation reintroduced punctuation, would break all four silently: a saved
// correction would be written to one key and looked up under another, which is
// precisely the class of defect this catalogue work exists to remove. The
// compiler rejects an unnormalized `normalizedName` at build time; this is the
// runtime complement, and it is the *prepared output* it pins, not the manifest
// tokens.
//
// Run against the real shipped artifact, over the whole catalogue and over
// every rule token applied to every catalogue name — the shape an annotated
// name actually takes when a user types one.
describe("the shipped rules produce a stable prepared name", () => {
  const prepared = (name: string) => prepareImportName(name, disambiguationsByNormalizedName).normalizedName;

  const ruleTokens = disambiguationRules.map((rule) =>
    rule.kind === "underspecified-name" ? rule.normalizedName : rule.normalizedPhrase,
  );

  function expectStable(inputs: Iterable<string>, label: string) {
    const unnormalized: string[] = [];
    const unstable: string[] = [];
    for (const input of inputs) {
      const once = prepared(input);
      if (normalizeExerciseName(once) !== once) unnormalized.push(input);
      if (prepared(once) !== once) unstable.push(input);
    }
    expect({ label, unnormalized, unstable }).toEqual({ label, unnormalized: [], unstable: [] });
  }

  it("over every catalogue name and alias", () => {
    const names = exerciseCatalog.flatMap((item) => [item.name, ...item.aliases]);
    // Guards against an empty or broken artifact making this vacuous.
    expect(names.length).toBeGreaterThan(1000);
    expectStable(names, "catalogue");
  });

  it("over every shipped rule token", () => {
    expect(ruleTokens.length).toBeGreaterThan(0);
    expectStable(ruleTokens, "rule tokens");
  });

  // The composite case: a rule token in front of a real name is what a
  // phrase-stripping rule is *for*, and it is the only shape whose prepared
  // output differs from plain normalization.
  it("over every rule token applied to every catalogue name", () => {
    const composites: string[] = [];
    for (const token of ruleTokens) {
      for (const item of exerciseCatalog) composites.push(`${token} ${item.name}`);
    }
    expect(composites.length).toBeGreaterThan(10_000);
    expectStable(composites, "composites");
  });

  // A phrase in the *middle* or at the *end* of a name, which is how users
  // actually write them ("Back squat to a pain-free depth"). This is the shape
  // that can break the property, and a prefix-only corpus cannot see it: the
  // rules run once, longest phrase first, so a strip that JOINS the text either
  // side of it can hand a later pass a longer phrase the first pass had no way
  // to match. Removing this case leaves the whole property untested against the
  // one failure mode it has.
  const phraseTokens = disambiguationRules
    .filter((rule) => rule.kind === "non-identity-phrase")
    .map((rule) => rule.normalizedPhrase);

  it("over every phrase token embedded in and appended to every catalogue name", () => {
    expect(phraseTokens.length).toBeGreaterThan(0);
    const embedded: string[] = [];
    for (const token of phraseTokens) {
      for (const item of exerciseCatalog) {
        const words = item.name.split(" ");
        embedded.push(`${item.name} ${token}`);
        if (words.length > 1) embedded.push([words[0], token, ...words.slice(1)].join(" "));
      }
    }
    expect(embedded.length).toBeGreaterThan(10_000);
    expectStable(embedded, "embedded");
  });

  // Punctuation, casing and whitespace are where a normalization pass and a
  // preparation pass are most likely to disagree. Deterministic rather than
  // random, so a failure is reproducible.
  it("over punctuation-heavy variants of the rule tokens", () => {
    const decorations = ["  ", "-", "'", "\u2019", "/", ".", "(", ")", "#", "\t", "%", "2"];
    const variants: string[] = [];
    for (const token of ruleTokens) {
      for (const decoration of decorations) {
        variants.push(`${decoration}${token}${decoration}`);
        variants.push(`${token}${decoration}Squat`);
        variants.push(`${token.toUpperCase()}${decoration} Back Squat`);
      }
    }
    expectStable(variants, "decorated");
  });
});
