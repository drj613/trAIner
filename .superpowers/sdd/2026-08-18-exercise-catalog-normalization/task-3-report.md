# Task 3 report — Tier-1 candidate proposal artifact

## Result

Created a versioned Luna-max proposal artifact with 161 non-Cartesian Tier-1
candidate records. Every required movement family is represented, no candidate
uses prescription-only details as an identity, and `variant-rules.json` remains
unchanged.

### Candidate counts

| Family | Count |
| --- | ---: |
| squat | 15 |
| bench-press | 13 |
| deadlift-hinge | 17 |
| row | 15 |
| pull-up-pulldown | 15 |
| overhead-landmine-press | 13 |
| lunge-split-squat | 12 |
| push-up | 10 |
| curl | 14 |
| triceps-extension-pushdown | 12 |
| raise-fly | 15 |
| loaded-carry | 10 |
| **Total** | **161** |

The proposals cover reviewed family anchors, common implement/support/grip/
laterality/attachment identities, and a deliberately small set of compatible
combined signatures. `paused` appears only as the coarse registered modifier;
numeric pause duration, tempo, load, RPE/RIR, distance, and other prescription
phrases are excluded. Approved aliases retain the identity markers of their
candidate signature; generic family aliases are not proposed.

## Validation and schema evidence

- `variant-candidates.schema.json` is a closed JSON Schema artifact with
  `schemaVersion: 1`, a 300-record maximum, closed candidate-record keys,
  enum/constant checks for `coverageTier` and `status`, non-empty strings,
  unique string arrays, and exhaustive nested `metadataOverrides`/`muscles`
  fields.
- `loadVariantCandidates()` now performs exhaustive field-level decoding:
  top-level and record unknown keys are rejected; required strings/arrays,
  duplicate array entries, optional metadata overrides, nested muscle fields,
  rationale length, candidate status, coverage tier, and the global cap are
  checked before records are returned.
- `validateVariantCandidates()` canonicalizes modifier closures against the
  reviewed registries, rejects unknown families/IDs, duplicate candidate IDs,
  duplicate canonical signatures, missing metadata bases, identity-erasing
  aliases, and missing required families.
- The candidate test additionally validates all 161 bases against the frozen
  3,072-entry snapshot and all signatures against the movement/modifier
  registries. A separate mechanical audit confirmed every implement modifier
  is compatible with the base equipment (or an explicit reviewed equipment
  override); every effective metadata record has populated equipment,
  movement-pattern, primary/secondary-muscle, and tag fields.

## RED / GREEN evidence

RED, before implementing the loader or creating the review artifact:

```text
$ bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate artifact"
FAIL ... candidate artifact covers Tier-1 and respects the cap
TypeError: validateModule.loadVariantCandidates is not a function
```

GREEN after the loader, schema, candidate records, registry checks, and test
were completed:

```text
$ bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate artifact"
PASS — 1 test

$ bun run test -- --runInBand scripts/catalog-normalization/compiler
PASS — 2 suites, 25 tests

$ bun run typecheck
exit 0

$ bun run lint
exit 0

$ bun run catalog:check
exit 0

$ git diff --check
exit 0
```

Artifact/schema predicates and family counts were also checked with `jq`; the
artifact has 161 records and every record has `status: "candidate"` and a
rationale of at least 20 characters.

## Files changed

- `scripts/catalog-normalization/reviews/variant-candidates.json`
- `scripts/catalog-normalization/reviews/variant-candidates.schema.json`
- `scripts/catalog-normalization/compiler/validate.ts`
- `scripts/catalog-normalization/compiler/types.ts`
- `scripts/catalog-normalization/compiler/normalize.ts`
- `scripts/catalog-normalization/compiler/compile.ts`
- `scripts/catalog-normalization/compiler/normalize.test.ts`
- `scripts/catalog-normalization/movements.json`
- `scripts/catalog-normalization/modifiers.json`
- `reports/catalog-normalization-report.json` (regenerated existing-stage input hashes)
- This report.

## Self-review

- Confirmed no change to `scripts/catalog-normalization/variant-rules.json`.
- Confirmed the artifact is below the cap, covers exactly the twelve Tier-1
  movement IDs, has unique IDs and canonical signatures, and parses as JSON.
- Confirmed all candidate metadata bases exist in the frozen snapshot and that
  implement metadata is compatible, using explicit overrides where the frozen
  source used a different equipment label.
- Confirmed modifier implication/exclusion, family allowlists, exclusive
  groups, canonical order, and family maxima are enforced by the existing
  registry validator and exercised by the candidate test.
- Confirmed aliases preserve identity markers and avoid generic family aliases.
- Confirmed no network or production catalogue output is used by this task.

## Concerns / handoff

- These are proposals only. Task 4 must independently adversarially review
  every record, reject or revise candidates, and translate only approved rules
  into `variant-rules.json`.
- Existing compiler stages intentionally do not consume candidate artifacts;
  candidate consumption and review gating remain Task 4 work.

## Review fix round 1 — RED / GREEN evidence

The review identified empty snapshot muscle fields, source-position-erasing
metadata bases, and missing Romanian/hinge/fly identities. Tests were written
before the fix and failed against the reviewed artifact and registries:

```text
$ bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t 'candidate validation rejects empty|required metadata|candidate bases preserve|combined families'
$ jest --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate validation rejects empty|required metadata|candidate bases preserve|combined families"
FAIL scripts/catalog-normalization/compiler/normalize.test.ts
  ✕ candidate validation rejects empty required metadata from a full snapshot
  ✕ candidate bases preserve implement and load-position identity
  ✕ combined families include canonical hinge and fly identities
Expected substring: "Candidate metadata base has empty required fields: suitcase-carry"
Received function did not throw
Expected: "dumbbell-squat"; Received: "dumbbell-goblet-squat"
Expected: true; Received: false
Tests: 3 failed, 15 skipped, 18 total
```

After changing candidate validation to consume full snapshot records,
replacing incompatible/empty metadata bases, and adding the minimal hinge,
Romanian, and fly registry vocabulary and candidates:

```text
$ bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t 'candidate validation rejects empty|required metadata|candidate bases preserve|combined families'
PASS — 3 tests

$ bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate artifact"
PASS — 1 test

$ bun run test -- --runInBand scripts/catalog-normalization/compiler
PASS — 2 suites, 28 tests

$ bun run typecheck
exit 0

$ bun run lint
exit 0

$ bun run catalog:check
exit 0

$ bun scripts/catalog-normalization/compiler/compile.ts --stage existing --check-only
exit 0

$ git diff --check
exit 0
```

The fix adds four fly candidates, three deadlift/hinge candidates, and
updates affected bases while keeping the artifact at 161/300 records. Barbell
carry records use populated farmer-carry metadata with an explicit equipment
override; single-arm kettlebell and dumbbell carries use the neutral farmer
base rather than waiter/suitcase positions. The exact dumbbell squat record is
used, and all candidate metadata is checked against full snapshot records for
required fields and implement compatibility. `variant-rules.json` remains
unchanged.
