# Task 5 — Runtime identity resolver report

## Delivered boundary

- Added `resolveExerciseIdentity(input, context)`: a pure resolver over explicit catalogue, registry, redirect, alias, custom-exercise, disambiguation, and override data.
- Added typed, module-load-validated movement, modifier, redirect, and disambiguation registries.
- Updated `matchExercise` to delegate all identity precedence to the resolver and return `matched`, `underspecified`, or `unmatched`.

## Resolver precedence and identity safety

The resolver applies the required ordering:

1. `catalog-reference` and `stored-exercise.canonicalExerciseId` use raw exact catalogue IDs, then redirects.
2. `custom-exercise.exerciseId` resolves only an exact user exercise.
3. Stored/import names use saved aliases, reviewed underspecified-name rules, unique canonical names, unique catalogue aliases, then unique custom names.
4. A normalized-name override classifies an unresolved name without assigning a concrete ID.
5. Remaining identities are standalone/unmatched.

`stored-exercise.slotId` appears only in the standalone `slot:<slotId>` group key; it never reaches direct catalogue or redirect lookup. Stored `performedName` is preserved separately from the current catalogue `displayLabel`/`currentVersionLabel`.

The mandated compatibility note is immediately above the only runtime redirect map lookup in `src/lib/catalog/identity.ts`:

```ts
// TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.
```

## Matcher behavior

- Saved aliases intentionally supersede reviewed underspecification.
- Reviewed underspecified names return candidates and modifier IDs without choosing a concrete exercise.
- Non-identity phrase rules strip prescriptions for matching; a numeric pause can resolve to the coarse `paused` identity.
- `reject-alternative` rules leave `or` prescriptions unresolved.
- Fuzzy similarity remains suggestions-only for unmatched results.

## TDD evidence

Initial required RED:

```text
bun run test -- --runInBand src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts
FAIL identity.test.ts: Cannot find module './identity'
PASS match.test.ts
```

Expanded RED before implementation:

```text
bun run test -- --runInBand src/lib/catalog/registries.test.ts src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts
FAIL registries.test.ts: Cannot find module './registries'
FAIL identity.test.ts: Cannot find module './identity'
FAIL tri-state matcher expectations against the old binary matcher
```

Additional narrow RED/GREEN cycles covered the fetch-based disambiguation loader and canonical-name `MatchVia` precedence.

Final focused and affected verification:

```text
bun run test -- --runInBand src/lib/catalog/registries.test.ts src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts src/lib/import/parser.test.ts src/lib/workout/exerciseSwap.test.ts
PASS: 5 suites, 132 tests

bun run typecheck
PASS

bun run lint
PASS
```

Full quality gates:

```text
bun run test
PASS: 92 suites, 1077 tests

bun run build
PASS

git diff --check
PASS
```

## Files changed

- `src/lib/catalog/exercises.ts`
- `src/lib/catalog/registries.ts`, `registries.test.ts`
- `src/lib/catalog/identity.ts`, `identity.test.ts`, `identity.testFixtures.ts`
- `src/lib/catalog/match.ts`, `match.test.ts`
- `src/lib/import/parser.ts`
- `src/lib/workout/exerciseSwap.test.ts`

## Self-review

- Confirmed direct-ID, redirect, saved-alias, underspecified, catalogue-name, catalogue-alias, custom-name, concrete-override, name-only override, and standalone branches are covered.
- Confirmed the resolver, not the matcher, performs runtime redirect lookup.
- Confirmed unresolved parser paths keep `canonicalExerciseId` unset while retaining candidate suggestions; Task 8 will add the fuller resolution-warning metadata/grouping flow.
- Replaced the old wrapper-source inspection test with observable runtime metadata behavior.

## Concerns

- The generated disambiguation and redirect artifacts are currently empty, so synthetic typed fixtures cover redirect and phrase-rule paths until curation emits live records.
- The full existing test suite prints React Router future-flag and React `act` warnings, plus an intentional persistence-error log; Vite emits its pre-existing large-chunk advisory. None is a failure or introduced by this task.

## Fix round 1/5 — normalized-name override with an underspecified rule

An important precedence defect allowed an `underspecified-name` rule to return before a global normalized-name correction was considered. The resolver now detects the name-only override after saved aliases but before returning the reviewed underspecified result. It still leaves the normal concrete-name, catalogue-alias, and custom-name precedence unchanged when no underspecified rule exists, so a generic canonical record cannot pre-empt the correction in the coexistence case.

RED evidence:

```text
bun run test -- --runInBand src/lib/catalog/identity.test.ts -t "normalized-name override before an underspecified"
FAIL applies a normalized-name override before an underspecified rule can select a generic name
Expected: source "user-override", specificity "overridden", modifier IDs ["barbell"]
Received: source "standalone", specificity "underspecified", modifier IDs ["barbell", "back-rack"]
```

GREEN evidence:

```text
bun run test -- --runInBand src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts
PASS: 2 suites, 26 tests

bun run typecheck
PASS

bun run lint
PASS
```

The coexistence regression uses a real resolver context containing a generic `Back Squat` concrete record, an underspecified `back squat` rule, and a normalized-name correction. It proves the correction returns an overridden family classification with no concrete exercise ID.
