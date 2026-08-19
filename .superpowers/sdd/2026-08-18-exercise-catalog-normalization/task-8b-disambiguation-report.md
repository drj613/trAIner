# Task 8b — Reviewed import disambiguation rules

Populates `scripts/catalog-normalization/disambiguations.json` (previously
`records: []`, leaving the whole underspecified-import flow dead code) with
16 reviewed records, recompiles `src/lib/catalog/importDisambiguations.generated.json`,
adds compiler-side validation, and adds shipped-rule tests.

## Underspecified-name rules added (6)

Every candidate ID below was verified to exist in the shipped
`exercises.generated.json` (3,175 entries). The compiler now re-verifies this
on every build.

| id | token | movement | candidates | matched modifiers | justification |
|---|---|---|---|---|---|
| `back-squat-choice` | `back squat` | `squat` | `barbell-squat`, `barbell-high-bar-squat`, `barbell-low-bar-squat` | `barbell`, `back-rack` | Spec's canonical case (design doc line ~432). Without the rule, "back squat" silently matches the un-normalized `barbell-back-squat` entry via its `back squat` alias. `barbell-squat` (barbell + back-rack, no bar-position modifier) is the generic "unspecified bar position" option the spec requires alongside high/low bar. |
| `squat-choice` | `squat` | `squat` | `barbell-squat`, `squat--barbell--front-rack`, `bodyweight-squat`, `dumbbell-squat` | — | `squat` is an alias of `barbell-back-squat`, so a bare "Squat" silently resolved to Barbell Back Squat. A bare family name expresses neither implement nor rack position; the spec's picker principle says a movement alone is not a selection. |
| `row-choice` | `row` | `row` | `row`, `bent-over-barbell-row`, `row--cable`, `row--dumbbell`, `row--machine` | — | An entry literally named `Row` (id `row`, no movement assignment) silently captured the token. Barbell/cable/dumbbell/machine rows are mechanically and metrically distinct. The generic `row` entry stays a candidate as the "unspecified" option. |
| `lateral-raise-choice` | `lateral raise` | `raise-fly` | `lateral-raise-dumbbell`, `cable-lateral-raise`, `lateral-raise-machine`, `lateral-raise-with-bands` | — | "Lateral Raise" is an alias of `lateral-raise-with-bands` only, so a plain "lateral raise" silently resolved to the *band* version — a clearly wrong default. All four implements exist as concrete entries. |
| `shoulder-press-choice` | `shoulder press` | `overhead-landmine-press` | `overhead-press`, `dumbbell-shoulder-press`, `cable-shoulder-press`, `shoulder-press-with-bands` | `overhead` | Same pathology: "Shoulder Press" is an alias of `shoulder-press-with-bands` only, silently resolving to the band version. Barbell (canonical `overhead-press`), dumbbell and cable versions all exist. `overhead` is matched because a shoulder press is definitionally overhead. |
| `split-squat-choice` | `split squat` | `lunge-split-squat` | `bulgarian-split-squat`, `dumbbell-split-squat`, `lunge-split-squat--bodyweight` | `split-stance` | "split squat" is an alias of `bulgarian-split-squat`, but a split squat is not necessarily rear-foot-elevated. Plain dumbbell and bodyweight split-squat concretes exist. |

## Non-identity phrase rules added (10)

| id(s) | phrase | behavior | annotation | justification |
|---|---|---|---|---|
| `phrase-competition` | `competition` | strip | competition standard | Spec-approved removal; zero catalogue names contain "competition", so stripping cannot reroute any exact name. |
| `phrase-pain-free`, `phrase-pain-free-depth`, `phrase-pain-free-depth-to`, `phrase-pain-free-depth-to-a` | `pain free` / `pain free depth` / `to pain free depth` / `to a pain free depth` | strip | pain-free (depth) | Spec-approved pain-free-depth wording. Zero catalogue names contain "pain". The longer "to (a) …" forms exist so "squat to pain-free depth" strips to `squat`, not to the dangling `squat to`. Longest-phrase-first application in `prepareImportName` means exactly one fires per name. |
| `phrase-paused-{1,2,3,5}-second` | `N second paused` | paused-duration | N-second pause | Spec: a numeric pause canonicalizes to the one coarse `paused` identity plus a duration annotation. The rule mechanism is exact-phrase, so common durations are enumerated. |
| `phrase-or-alternative` | `or` | reject-alternative | alternative prescription | Spec's explicit case ("assisted or bodyweight neutral-grip pull-up" must stay unresolved). Token-boundary regex means words like "row" are untouched. |

## Candidate rules considered and rejected

- **`weighted` (strip)** — spec text names it, but the shipped catalogue has 67 entries whose names contain "weighted" as identity, including implement names ("Weighted Ball Hyperextension" — a weighted-ball implement, not an annotation). A blanket strip would reroute "weighted crunch" to "crunch" and corrupt "weighted ball …" entries, violating "exact concrete names resolve automatically". Deferred until those legacy entries are merged/assigned; this is a real spec-vs-catalogue conflict a reviewer should settle.
- **`bench press`** — resolves uniquely to the generic `bench-press` entry; convention overwhelmingly means barbell. Unlike back squat, the spec does not name it, and the silent match is the correct generic. Rejected.
- **`deadlift` / `curl` / `pulldown`** — match nothing today, so the existing unmatched flow already presents a grouped choice with suggestions. A rule would only re-label unmatched as underspecified; no silent-wrong-match to fix. Rejected as padding.
- **`pull up`, `push up`, `chin up`, `front squat`, `overhead press`, `romanian deadlift`, `triceps pushdown`, `farmer carry`, `hip hinge`** — each resolves uniquely to its correct conventional/generic concrete entry (e.g. `pull-up` bodyweight generic, `overhead-press` barbell). One concrete outcome = not underspecified; a rule would be wrong. Rejected.
- **load/RPE wording (e.g. "@ RPE 8", "at 75%")** — spec-approved family, but the phrase table is exact-match and this wording is numerically open-ended; enumerating a handful would be false coverage. Needs a parser-level pattern, deferred and reported.
- **noun-form pauses ("with 2-second pause below knee")** — stripping mid-name noun forms leaves dangling prepositions and would break the one exact catalogue alias that contains such wording (`deadlift-trap-bar-high-handles`). Only the adjective "N second paused" forms shipped.

## Compiler validation added

`scripts/catalog-normalization/compiler/core.ts` previously passed
disambiguation records through unvalidated (`validateUnmodeledManifestRecords`).
Added, in the existing decode style:

- `decodeDisambiguations`: key allowlist per kind, non-empty strings, behavior
  enum, duplicate-id and duplicate-token rejection, non-empty candidate list.
- Cross-reference check in `compileCatalog` (complete builds): every rule's
  `movementId`, `matchedModifierIds`, and `candidateExerciseIds` must exist in
  the final registries/catalogue, else the build fails.

Mutation-verified: appending candidate `this-exercise-does-not-exist` fails the
build (`disambiguation rule … references unknown exercise`); an invalid
`behavior` value fails with `Invalid disambiguation manifest record`. Manifest
restored byte-for-byte (sha256 `edba516b…` re-verified).

## Determinism

- `bun run catalog:build` then `bun run catalog:check`: **pass**.
- Recompiling changed only `src/lib/catalog/importDisambiguations.generated.json`
  and the two provenance hashes for it in `reports/catalog-normalization-report.json`.
  Hashes for `exercises/movements/modifiers/legacyRedirects` are byte-identical.

## Runtime tests and mutation evidence

New `src/lib/catalog/shippedDisambiguations.test.ts` (11 tests) runs against the
real generated artifacts (no fixtures) and covers: canonical back-squat choice,
exact-name bypass (`High Bar Back Squat`), saved-alias precedence over the rule,
all six rules firing with exact candidate IDs, no-rule conventional names still
matching, competition/pain-free stripping, paused canonicalization, and `or`
rejection.

Mutation evidence (break → fail → byte-identical restore, verified by
`catalog:check` and sha256):

1. Deleting `back-squat-choice` + `phrase-or-alternative` from the generated
   artifact: **3 failed / 8 passed** (canonical choice, pain-free-reaches-rule,
   or-alternative).
2. Corrupting one candidate ID, one movementId, and one pause behavior:
   **3 failed / 8 passed**, each failure the test guarding that exact field.
3. Emptying the records entirely: the per-rule loop test passes vacuously —
   this is why the `ships at least the reviewed rule families` guard test
   exists; it failed as designed (**3 failed** total in that run).

One pre-existing test change: `src/lib/import/parser.test.ts`'s shared
`minimalDay` fixture used raw name `"Squat"` as a name that must resolve without
a warning. The new `squat` rule correctly makes bare "Squat" underspecified, so
the fixture now uses the exact concrete name `"Barbell Squat"`; the three
affected tests assert day-path patching, not squat semantics.

## Gate results (real output)

- `bun run catalog:build` → exit 0; `bun run catalog:check` → pass.
- `bun run catalog:test` → 45 passed, 2 suites.
- `bun run test -- --runInBand` → **96 suites / 1249 tests passed** (includes
  the other agent's in-flight storage work; no failures attributed elsewhere).
- `bun run typecheck` → pass. `bun run lint` → pass. `git diff --check` → clean.

## Deliberately left for later

- The `weighted` strip family (see rejection above) — blocked on merging the 67
  legacy `weighted-*` entries.
- Load/RPE phrase stripping — needs a pattern-based mechanism, not exact phrases.
- Observed likely un-merged duplicates while curating (report-only, per task
  boundary): `barbell-back-squat` vs `barbell-squat`, `bench-press` vs
  `barbell-bench-press`, `front-squat` vs `squat--barbell--front-rack`,
  `romanian-deadlift` vs `deadlift-hinge--barbell--hinge--romanian`. These
  belong in `merges.json`, which is reviewed variant/merge territory I did not
  touch.
- Four legacy composite-alternative entries (both names and aliases checked; `front-cone-hops-or-hurdle-hops` carries the token in an alias as well) (`front-cone-hops-or-hurdle-hops`,
  `march-or-jog-in-place`, `neutral-grip-pull-ups-or-trx-rows`,
  `zone-2-bike-row-or-incline-walk`) are no longer reachable by exact typed
  name because of the `or` rule — this is the spec's stated intent, but worth a
  reviewer's eye.

---

# Fix round 1 (2026-08-19) — reviewer CHANGES REQUESTED

Commit: `fix: pin disambiguation validation and close token gaps`.

## I5 — single-candidate rules now rejected

`decodeDisambiguations` rejects `candidateExerciseIds.length < 2` (a
one-outcome token is not underspecified; a one-option prompt is worse than no
rule). Verified end-to-end: truncating the real `back-squat-choice` manifest
record to one candidate fails `catalog:build` with
`Invalid disambiguation manifest record`. Manifest restored byte-identical
(sha256 `d1c1c9f3…` matches the generated artifact; `catalog:check` pass).

## I3 — validation now has committed tests

`compile.test.ts` gains 5 rows in the existing `rejects $name` table (unknown
kind, unknown behavior enum, single-candidate rule, duplicate token, unexpected
key) plus a `stage: "complete"` test that copies the real curation inputs into
a temp root, corrupts one candidate ID, and asserts the cross-reference throw
(`references unknown exercise: this-exercise-does-not-exist`). Compiler suite:
45 → 51 tests, all passing.

## I4 — all rules fully pinned

The spot-check test was replaced with a `test.each` table asserting, for every
shipped underspecified rule (now 10), `movementId` and the exact ordered
candidate array via `toEqual`. Mutation evidence for the two previously
surviving mutations:

- Truncating `lateral-raise-choice` candidates to a single ID **and** setting
  `squat-choice.movementId` to `"row"` in the generated artifact:
  **4 failed / 17 passed** (`Squat …`, `Lateral Raise …`, the new ≥2-candidates
  guard, and the family-less pin all fired). Previously both survived.
- Restored via rebuild; `catalog:check` pass.

## Curation changes (approved by coordinator)

- **`barbell-back-squat-choice`** (`barbell back squat`): same three candidates
  as `back-squat-choice`. Evidence: the token exact-matched `barbell-back-squat`
  (`movementId: null`, no modifiers) — a working label but no bar-position
  choice and history that never aggregates with the squat family.
- **Plural tokens** (`squats-choice`, `lateral-raises-choice`,
  `split-squats-choice`): each plural currently exact-matched an unassigned
  `movementId: null` duplicate (`squats`, `lateral-raises`, `split-squats` —
  verified in the shipped catalogue). Same candidate lists as their singular
  rules. Deliberately did **not** singularize in `normalizeExerciseName`.
  Note: no `rows` / `shoulder presses` / `back squats` rules — those tokens
  match nothing today (verified), so the unmatched flow already presents a
  choice.
- **M2**: dropped the generic `row` entry from `row-choice` (family-less,
  three implements on one entry, read as a default when listed first).
- **M3**: `split squat` rules now lead with the generic
  `lunge-split-squat--bodyweight` instead of `bulgarian-split-squat`.

Manifest: 16 → 20 records. Recompile changed only the disambiguation artifact
and its two report hash lines; the other four artifacts are byte-identical.

## I1 — family-less candidates pinned, not fixed

New test `family-less candidates are exactly the known assignment-coverage
gaps` pins the exact per-rule sets of `movementId: null` candidates
(lateral-raise band ×2 rules; shoulder-press dumbbell/cable/band; split-squat
bulgarian/dumbbell ×2 rules). **Final-review item:** these six entries need
movement assignments upstream (in `assignments.json`) so choosing them yields
`movement:` group keys; the assigned generated-name equivalents were rejected
as candidates because their display names are unusable.

## M4 / M5 — stale text corrected

- `resolution.testFixtures.ts` and `parser.test.ts` no longer claim the shipped
  artifact is empty; both now point at `shippedDisambiguations.test.ts`.
- Report corrected: the `or` rule affects **four** entries (count word said
  "five" over a four-item list; alias-carrying `front-cone-hops-or-hurdle-hops`
  is included).

## Gates (real output)

- `catalog:build` exit 0; `catalog:check` pass; report diff = exactly the two
  disambiguation hash lines.
- `bun run test -- --runInBand`: **97 suites / 1306 tests passed**.
- `bun run typecheck`: pass (one transient failure came from the other agent's
  mid-edit `src/lib/import/resolution.ts`/`resolution.test.ts`, which are
  modified in their lane in the working tree; it cleared on re-run and is not
  attributable to this change set).
- `bun run lint`: pass. `git diff --check`: clean.

---

# Fix round 2 (2026-08-19) — answering `task-8-review-2.md`

Commits: `0916d63`, `ac0d228`, `1265ba4`, `f9d0716` (+ this report).
Lane: `scripts/catalog-normalization/**`,
`src/lib/catalog/importDisambiguations.generated.json`,
`src/lib/catalog/shippedDisambiguations.test.ts`,
`reports/catalog-normalization-report.json`. Nothing else was written; every
commit used `git commit --only -- <explicit paths>`.

Counts: compiler suite **51 → 55**, `src/lib/catalog` **50 → 57**,
combined **101 → 112**. Manifest stays at **20 records** (two candidate
additions, no new records).

## Item 3 — an unnormalized token is now a build failure (commit `0916d63`)

The most valuable item, and the reviewer's Important 3. `normalizedName` /
`normalizedPhrase` were validated as non-empty strings and deduplicated by raw
string, never checked for *being normalized*. `prepareImportName` normalizes the
imported name and then does an exact-string `Map.get`
(`identity.ts:112`, `registries.ts:114-119` keys the map on the **raw** token),
so an unnormalized rule ships in the artifact and can never fire.

`decodeDisambiguations` now runs both token fields through `assertNormalizedToken`,
which **imports the runtime's own `normalizeExerciseName`** from
`src/lib/catalog/normalize` rather than reimplementing the rule. Failure is a
specific message naming the offending token and the token the curator meant.

**RED (real output, before the fix):**

```
● rejects a disambiguation rule whose token is not normalized

  expect(received).rejects.toThrow()
  Received promise resolved instead of rejected
  Resolved to value: { … full CatalogBuildReport … }

    > 355 |   await expect(compileCatalog({

● rejects a disambiguation phrase whose token is not normalized   (same shape)

Tests: 2 failed, 51 passed, 53 total
```

That is RED for the right reason: the build *succeeded* with `"Fixture  Lift"`.

**End-to-end proof against the real manifest.** Planted the reviewer's exact
record (`front-squat-choice`, `normalizedName: "Front  Squat"`) into
`scripts/catalog-normalization/disambiguations.json`:

```
$ bun run catalog:build
error: disambiguation rule front-squat-choice token is not normalized: "Front  Squat" (expected "front squat")
      at assertNormalizedToken (…/compiler/core.ts:334:15)
      at loadCurationManifests (…/compiler/core.ts:450:22)
exit=1
```

Restored byte-for-byte: `shasum` `5071c569bae23bacbf1050914b40d5d721bddde7`,
`git status` on the manifest and every artifact empty.

**All 20 shipped records pass the new guard**: `catalog:build` exit 0, zero
working-tree diff, and an independent probe over the shipped artifact reports
`records 20 | not-normalized 0`.

**Mutation evidence (each mutation named beside its count):**

| mutation to `compiler/core.ts` | result |
|---|---|
| **N1** `if (normalized !== token)` → `if (false)` | **2 failed / 51 passed** — both new rows |
| **N2** drop `assertNormalizedToken` at the `normalizedName` call site only | **1 failed / 52 passed** — `rejects a disambiguation rule whose token is not normalized` |
| **N3** drop `assertNormalizedToken` at the `normalizedPhrase` call site only | **1 failed / 52 passed** — `rejects a disambiguation phrase whose token is not normalized` |

Each call site is killed by, and only by, its own row. No earlier-guard masking:
`nonEmptyString` accepts `"Fixture  Lift"` (N1 proves the guard is the only thing
rejecting it), and both rows assert the **specific** message, so a different
guard firing first would fail the test rather than pass it.

**On "the compiler and the runtime must agree" — a gap I have to publish.**
The brief's trap is real in principle but **unfalsifiable in this harness**: the
compiler's own `normalizeToken` (`compiler/normalize.ts:31`) and the runtime's
`normalizeExerciseName` have **identical fixed-point sets**, so no manifest
record can distinguish "imported the runtime rule" from "reimplemented it".
Measured, not reasoned: 16,275 strings of length ≤ 3 over
`a b z A Z 0 9 space - ' ’ é ü ß / ( ) & . , – U+0301 tab +` →
**0 fixed-point divergences**. The import is therefore future-proofing (if
`normalizeExerciseName` ever gains singularization or stop-word stripping, the
compiler follows automatically) and not something a test can pin today. Said out
loud so a reviewer does not read a green mutation as coverage.

Architectural note for the reviewer: this is the **first** `scripts/ → src/`
import in the compiler. The direction is correct (the build tool must agree with
the runtime it feeds), `src/` still never references `scripts/` so the app bundle
is untouched, `src/lib/catalog/normalize.ts` has no imports of its own, and both
`tsconfig.test.json` (which includes `scripts/**`) and `eslint` accept it.

## Item 1 — the movement and modifier cross-reference branches (commit `ac0d228`)

Test-only, exactly as the reviewer scoped it. The single cross-reference test
became a three-row `test.each` over the same real-curation-inputs temp root, via
a `withCorruptedShippedRule` helper. The refactor is mechanical: the exercise row
is the old test's body, and its kill is re-verified below.

**RED (real output, with the reviewer's M-f applied — movement check deleted):**

```
● complete builds reject a disambiguation rule naming an unknown movement

  expect(received).rejects.toThrow()
  Received promise resolved instead of rejected
  Resolved to value: { … full report, "stageCounts": {"complete": 3175 …} … }

    > 424 |   await expect(compileCatalog({

Tests: 1 failed, 54 passed, 55 total
```

**Mutation evidence:**

| mutation to `compiler/core.ts` | result |
|---|---|
| **M-f** delete `movementsById.has(rule.movementId)` check + throw | **1 failed / 54 passed** — `…naming an unknown movement` |
| **M-g** delete the `modifiersById.has(modifierId)` loop + throw | **1 failed / 54 passed** — `…naming an unknown modifier` |
| **M-h** delete the `finalExerciseIds.has(exerciseId)` loop + throw | **1 failed / 54 passed** — `…naming an unknown exercise` |

Where the reviewer measured **19 passed / 19 total, no test fails** for M-f and
M-g, each branch is now killed by exactly one row and the other two rows stay
green — so no row is standing in for another. `core.ts` restored to
`shasum d82c99cd04459e4fd8388dcbe481f66b045be521`, `git diff` empty.

Each row asserts the **specific** message (`references unknown movement: …`), so
an earlier guard firing instead would fail the row. The modifier row *replaces*
`matchedModifierIds` rather than appending, so it does not depend on the chosen
rule already carrying modifiers; the exercise row's `?.push` cannot no-op
silently because the helper throws if `candidateExerciseIds` is absent.

## Item 2 — the six uncovered shipped records (commit `1265ba4`)

**RED first, by reproducing the reviewer's finding.** Deleted all six records
(`phrase-pain-free`, `-depth`, `-depth-to-a`, `phrase-paused-1/3/5-second`) from
`importDisambiguations.generated.json`: **50 passed / 50 total**, confirming the
gap exactly. Then wrote the new rows against that broken artifact:

```
● 3-second pause wording canonicalizes to the coarse paused identity
  expect(received).toBe(expected)
  Expected: "paused barbell back rack squat"
  Received: "3 second paused barbell back rack squat"

● phrase-pain-free strips "Pain-free back squat" to the bare back squat token
  expect(received).toBe(expected)
  Expected: "back squat"
  Received: "pain free back squat"

Tests: 6 failed, 22 passed, 28 total
```

Exactly the six new rows failed, one per deleted record — and
`phrase-pain-free-depth-to` (not deleted) stayed green, which proves each row is
sensitive to *its own* record rather than to the group. Restoring the artifact
(`shasum 5071c569…`, `git status` empty) gives **57 passed / 57 total**.

Both tables drive **real import names** through `prepareImportName` and
`matchExercise`; neither reads the manifest back. The pain-free rows pin the
*surviving token exactly* (`"back squat"`) because a missing record leaves a
dangling fragment — `"back squat to a"`, `"depth back squat"` — which a
"something was stripped" assertion would not catch.

**Mutation evidence — all 10 phrase records, one deletion each:**

| record deleted from the artifact | result |
|---|---|
| `phrase-pain-free` | 1 failed / 56 passed — its own row |
| `phrase-pain-free-depth` | 1 failed / 56 passed — its own row |
| `phrase-pain-free-depth-to` | **2** failed / 55 passed — its own row **+** the pre-existing `pain-free depth wording strips and still reaches the underspecified rule` |
| `phrase-pain-free-depth-to-a` | 1 failed / 56 passed — its own row |
| `phrase-paused-1-second` | 1 failed / 56 passed — its own row |
| `phrase-paused-2-second` | 1 failed / 56 passed — its own row |
| `phrase-paused-3-second` | 1 failed / 56 passed — its own row |
| `phrase-paused-5-second` | 1 failed / 56 passed — its own row |
| `phrase-competition` | 1 failed / 56 passed — `competition wording strips…` |
| `phrase-or-alternative` | 1 failed / 56 passed — `alternative prescriptions with 'or'…` |

Zero survivors. Combined with the reviewer's mutation sets A–C over the 10
underspecified rules, **all 20 shipped records now have coverage.**

Three further mutations against the "test restates the manifest" shape:

| mutation to the artifact | result |
|---|---|
| `phrase-paused-3-second.annotation` → `"9-second pause"` | 1 failed / 56 passed — the 3-second row |
| `phrase-paused-3-second.behavior` → `"strip"` | 1 failed / 56 passed — the 3-second row |
| `phrase-pain-free.annotation` → `"pain-free depth"` (collide with the depth rules) | 1 failed / 56 passed — the `phrase-pain-free` row |

Artifact restored after every mutation; final `shasum 5071c569…` (pre-Item-5).

**One existing test was modified, and it is a fold not a weakening.** The former
`numeric pause wording canonicalizes to the coarse paused identity` (a single
2-second case) became the `seconds === 2` row of the duration table. The
assertions are identical — same three expectations, same values — so nothing is
lost, and the table's 2-second row is mutation-proved above. Reported here
because `IMPLEMENTER-STANDARDS.md:46` asks for it explicitly.

**Minor 3 also closed** in the same commit: the `family-less candidates` comment
now says outright that it is a characterization test, that shrinking the
expectation when `assignments.json` gains coverage is **success**, and that a
failure must never be resolved by editing candidate lists.

## Item 5 — `squat--kettlebell` added (commit `f9d0716`)

**Verified before adding, as the brief required.** `squat--kettlebell` in the
shipped `exercises.generated.json`:
`{"name": "Kettlebell Squat", "movementId": "squat", "movementModifierIds": ["kettlebell"]}`
— genuinely **assigned** and genuinely **well-named**, on identical footing to
`dumbbell-squat` (`{"Dumbbell Squat", "squat", ["dumbbell"]}`) and
`bodyweight-squat` (`{"Bodyweight Squat", "squat", ["bodyweight"]}`) which the
rule already offered. The ruling holds; added to both `squat-choice` and
`squats-choice`, appended last so the generic `barbell-squat` keeps the leading
position the pin controls.

**RED first** — updated `squatCandidates` in the pinned table before touching the
manifest:

```
● Squat returns the curated squat choice instead of a silent match
  expect(received).toEqual(expected) // deep equality
  Array [
    "barbell-squat", "squat--barbell--front-rack", "bodyweight-squat", "dumbbell-squat",
  -   "squat--kettlebell",
  ]
● Squats returns the curated squat choice instead of a silent match
Tests: 2 failed, 26 passed, 28 total
```

**Mutation evidence:**

| mutation to the artifact | result |
|---|---|
| drop `squat--kettlebell` from `squats-choice` **only** | 1 failed / 56 passed — `Squats returns the curated squat choice…` |
| drop `squat--kettlebell` from `squat-choice` **only** | 1 failed / 56 passed — `Squat returns the curated squat choice…` |
| swap `dumbbell-squat` ↔ `squat--kettlebell` in `squat-choice` (ordering) | 1 failed / 56 passed — `Squat returns the curated squat choice…` |

Membership and ordering are pinned per rule, not collectively. The family-less
pin is unaffected because the entry is assigned (57/57 green, expectation
unchanged).

## Determinism (real output)

```
$ shasum -a 256 scripts/catalog-normalization/disambiguations.json src/lib/catalog/importDisambiguations.generated.json
7b7e219d68b6ff90d75b46f87e81361fba6cef1e7569306d4de318b56b765bc8  scripts/catalog-normalization/disambiguations.json
7b7e219d68b6ff90d75b46f87e81361fba6cef1e7569306d4de318b56b765bc8  src/lib/catalog/importDisambiguations.generated.json
```

The artifact remains a byte-for-byte echo of the validated input. The report diff
for `f9d0716` is **exactly two hash lines and nothing else**:

```
-  "scripts/catalog-normalization/disambiguations.json": "d1c1c9f3…"
+  "scripts/catalog-normalization/disambiguations.json": "7b7e219d…"
-  "importDisambiguations.generated.json": "d1c1c9f3…"
+  "importDisambiguations.generated.json": "7b7e219d…"
```

`exercises`, `legacyRedirects`, `modifiers` and `movements` output hashes are
byte-identical. A second `catalog:build` is a proven no-op (hashed all five
artifacts plus the report before and after: byte-identical), and
`catalog:check` exits 0 with zero working-tree drift.

## Cross-lane finding for the token-keying agent

The brief asked me to say loudly if a phrase rule could produce a token that is
not stable under a second normalization pass. **Measured over 36,040 probes** —
every one of the 3,175 catalogue names, every catalogue name prefixed by every
phrase token, and every phrase × phrase × base-name combination:

```
checked 36040 | not-a-fixed-point 0 | empty tokens 6
```

**Good news:** `prepareImportName(...).normalizedName` is *always* a fixed point
of `normalizeExerciseName` — `identity.ts:112` re-normalizes on the way out — so
keying the sheet and the "Remember" path on the stripped token is stable under a
second pass. Item 3 now also enforces this upstream: every manifest token must
itself be a fixed point, so a phrase rule cannot introduce one.

**One thing worth their attention, not a defect in my lane:** an input consisting
of *nothing but* a strippable phrase yields the **empty string** — exactly six
inputs, and they are the six phrase tokens themselves: `competition`,
`pain free`, `pain free depth`, `to pain free depth`, `to a pain free depth`,
`or`. No catalogue name and no phrase+name combination does this. All six are
`unmatched` today, so there is no wrong match; but if the new keying stores a
remembered correction under `prepareImportName(...).normalizedName`, one of these
inputs would key an alias on `""`, and `by-normalized-alias` is the schema's only
unique index. Suggest they reject an empty prepared token before writing.

## Self-review of the full diff

Reviewed `git diff a8007a0..HEAD` over my lane with fresh eyes. Findings:

1. `assertNormalizedToken` returns `token`, not `normalized`. Deliberate and
   left as-is: the contract is *reject, never silently rewrite*, and returning
   the normalized form would quietly repair a curator's typo instead of telling
   them about it. The name and comment carry this.
2. The guard runs **before** the `seenTokens` duplicate check, so an
   unnormalized duplicate reports the normalization error rather than the
   generic `Invalid disambiguation manifest record`. That is the more useful of
   the two messages; noted so the ordering is a decision, not an accident.
3. The pain-free table's `ruleId` field is used only in the test title, never
   asserted. Kept: it documents which shipped record each row covers, while
   every assertion in the row is behavioural.
4. Two stacked comment blocks now sit above `squatCandidates`. Cosmetic;
   left alone rather than rewriting a pre-existing comment.
5. No `git add -A`, `.`, or `-a` anywhere; each commit's `--stat` was checked to
   contain only my lane's files.

## Foreign failures, checked and attributed by filename

Never assumed. Over the round:

- `src/lib/workout/zzreview2.probe.test.ts` — `ENOENT`, a probe file another
  agent created and deleted mid-run. Workout lane.
- `src/components/catalog/ExerciseCorrectionSheet.test.tsx` — 4–10 failures
  across several runs. Attributed by evidence, not assumption: five of the six
  failing test names are **newly added uncommitted lines** in that file
  (`git diff` shows `+  it("keys an assigned annotated name on the token the
  resolver reads"…`), i.e. the other agent's RED phase. Run in isolation it
  fails on its own, independent of my change.
- `src/components/catalog/ExerciseCorrectionSheet.tsx` — two
  `no-unused-vars` lint errors mid-edit; cleared once they landed their
  implementation. `bunx eslint scripts/catalog-normalization src/lib/catalog`
  was exit 0 throughout.
- `src/lib/workout/historyProjection.test.ts`, `historyUtils.test.ts` — 22
  failures in one run, **113/113 passing in isolation**; another mid-edit
  snapshot. Both files are modified in the working tree in the workout lane.

A final clean run: **102 suites / 1472 tests / 0 failures.**

## Gates (real output, final tree)

```
bun run catalog:build                    exit 0, zero working-tree drift
bun run catalog:check                    exit 0 (no output)
bun run catalog:test                     2 suites / 55 tests passed   (was 51)
bun run test -- --runInBand src/lib/catalog   4 suites / 57 tests passed  (was 50)
bun run test -- --runInBand              102 suites / 1472 tests passed, 0 failed
bun run typecheck                        exit 0
bun run lint                             exit 0
bunx eslint scripts/catalog-normalization src/lib/catalog   exit 0
bun run build                            ✓ built in 1.72s (Vite large-chunk advisory only)
git diff --check                         exit 0
bun run test:e2e                         93 passed (1.6m), 0 failed
```

## Item 4 — e2e, actually run, not inferred

The omission the reviewer raised twice is closed. **`CI=1 bun run test:e2e`:
93 passed / 93 total, 0 failed** (`CI=1` enables the config's `retries: 2`;
without it the harness runs zero retries). Run **three times** across the round —
once before `0916d63`, once after `f9d0716`, once on the final tree.

`e2e/program-import.spec.ts` specifically, the file the curation commit broke:
**9 passed / 9**, including
`an underspecified name demands a version before the import may proceed`. So
adding a fifth `squat-choice` candidate did not disturb the
`Remember "Squat" as Barbell Squat` assertions.

Honest note on flakiness, since it would otherwise look like a regression: two
zero-retry full runs failed 2 specs each — but **different** specs each time
(`goal-gate` + `exercise-history`, then `modify-ai` + `today`), all of them
passing in isolation, and all failing on `click({ timeout: 10000 })` after a
`waitForTimeout(300)`. The trigger is environmental: the other two agents were
editing `src/lib/workout/**` and `src/components/catalog/**` while Playwright's
`bun run dev` server hot-reloaded underneath the run. My change set cannot reach
e2e in any case: `grep -rn "catalog-normalization" src/` matches **only** the
`.generated.json` artifacts, so nothing in `src/` imports the compiler.

## Settled rulings — re-verified, not reopened

- **`weighted` strip rule deliberately rejected** — spec-vs-catalogue conflict,
  not a defect; `prepareImportName` runs before any exact-name match, so the
  rule would rewrite the 43 by-name entries before they could match themselves.
  Recorded faithfully at `progress.md:230`. Untouched.
- **`or` reject-alternative accepted with its four-entry consequence** — still
  exactly four, still stated as four, still checked over names *and* aliases.
  Untouched.
- **`barbell-back-squat` carried to final review**; `merges.json` not reopened.
- **Family-less candidates are a characterization pin** — confirmed the comment
  now says so explicitly (Minor 3 above). Adding `squat--kettlebell` did not
  change the expectation, because the entry is assigned.
- **Skipping `rows` / `shoulder presses`** — still right; both are `unmatched`,
  so the unmatched flow already presents a choice.

## Deliberately deferred, with reasoning

- **A runtime-side test that the shipped tokens are all normalized.** Not added:
  the compiler guard is strictly stronger (it fails the *build*, and
  `catalog:check` runs the compiler on every gate), so a runtime assertion would
  be a weaker duplicate that can only fire after a bad artifact already shipped.
- **Canonical ordering for the disambiguation artifact (reviewer's Minor 2).**
  Not my item and no determinism risk — the artifact is a byte-for-byte echo of
  validated input and a second build is a proven no-op. Left as a decision for
  Task 14 rather than changed silently mid-round.
- **Empty prepared token rejection.** Belongs to the token-keying lane
  (`aliasRepo.ts` / the import save path), which another agent holds. Reported
  above rather than reached into.
- **The `weighted` family and load/RPE phrase stripping.** Unchanged from
  fix round 1; both still blocked on upstream work.

## Carry forward

**To Task 14 (audit):**
1. `barbell-back-squat` remains a catalogue defect (`movementId: null`, named
   almost identically to `barbell-squat`, still holding the `back squat` /
   `squat` aliases the new rules shadow). Systemic: 3,033/3,175 unassigned.
2. Six candidate ids still need `assignments.json` coverage:
   `lateral-raise-with-bands`, `dumbbell-shoulder-press`, `cable-shoulder-press`,
   `shoulder-press-with-bands`, `bulgarian-split-squat`, `dumbbell-split-squat`.
   When fixed, **update** the `family-less candidates` expectation downward —
   the comment now says in the file that this is success.
3. Family-less duplicates the rules shadow but do not remove: `squats`,
   `lateral-raises`, `split-squats`, `row`, `front-squat`.
4. `squat--kettlebell` (Q3) is **RESOLVED here**, not deferred — added to both
   squat rules. `squat--kettlebell--front-rack` deliberately not added; the
   front-rack candidate already covers that specificity and a 6-option prompt
   for a bare token trades one friction for another.
5. Reviewer's Minor 2 — the disambiguation artifact is the only generated
   artifact with no canonical ordering. Cosmetic; decide or record as deliberate.

**To Task 15 (final review):**
6. The two cross-reference branches now have tests — M-f/M-g each kill exactly
   one row (Item 1). Verify the three-row table is intact.
7. All 20 shipped records now have coverage — 10 phrase records mutation-proved
   here, 10 underspecified rules by the reviewer's sets A–C (Item 2).
8. The normalization round-trip guard is in and mutation-proved (Item 3).
   **Scrutinise the published gap:** the compiler's `normalizeToken` and the
   runtime's `normalizeExerciseName` have identical fixed-point sets (0
   divergences over 16,275 strings), so no test can prove the compiler uses the
   runtime rule. Read the import in `core.ts:23` directly.
9. e2e is green on the merge candidate: **93/93**, run three times, plus
   `program-import.spec.ts` 9/9 in isolation. Do not re-infer it from unit tests.
10. Do **not** quote `progress.md:253`'s "7 of 23 / row 1/5" (Minor 1). Post-M2
    and post-kettlebell the figure is **6 distinct family-less candidate ids
    across 4 rule families over 25 candidate slots**, `row-choice` clean at 0/4,
    and `squat-choice`/`squats-choice` clean at 0/5. The pinned test is
    authoritative.
11. The `or` rule's blast radius is still exactly four entries, still
    spec-intended (line 418).
12. **Cross-lane:** the six phrase-only inputs that prepare to the empty string
    (`competition`, `pain free`, `pain free depth`, `to pain free depth`,
    `to a pain free depth`, `or`). Confirm the token-keying lane rejects an
    empty prepared token before writing an alias, given
    `by-normalized-alias` is the schema's only unique index.

---

**DONE**

Commits: `0916d63` (Item 3, compiler guard), `ac0d228` (Item 1, cross-reference
tests), `1265ba4` (Item 2 + Minor 3, shipped-record coverage), `f9d0716`
(Item 5, `squat--kettlebell`).
