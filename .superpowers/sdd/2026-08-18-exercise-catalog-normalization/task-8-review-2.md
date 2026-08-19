# Task 8 + curation — re-review of fix round `e2bdcbb`

Reviewer lane: `scripts/catalog-normalization/**`, `src/lib/catalog/*.generated.json`,
`src/lib/catalog/shippedDisambiguations.test.ts`. Read-only review; every mutation
restored byte-for-byte and verified with `shasum` (evidence at the end).

Branch state note: HEAD is `65a2d72` (Task 10 landed), i.e. the tree has moved 24
commits past `e2bdcbb`. All findings below were measured against the current tree,
which is what ships.

## Gates (real output, current tree)

```
bun run catalog:check                                  exit 0 (no output)
bun run catalog:build                                  exit 0, ZERO working-tree diff
bun run catalog:test                                   2 suites / 51 tests passed
bun run test -- --runInBand src/lib/catalog            4 suites / 50 tests passed
(combined)                                             6 suites / 101 tests passed
```

`src/lib/catalog/shippedDisambiguations.test.ts` alone: **21 passed**.
Manifest: **20 records** (10 `underspecified-name`, 10 `non-identity-phrase`).

---

## I5 — single-candidate rule rejection — RESOLVED

`core.ts:338-339` now reads `nonEmptyStringArray(...)` followed by
`if (candidateExerciseIds.length < 2) invalidManifestRecord("disambiguation");`.

**Mutation (data, real manifest):** set `back-squat-choice.candidateExerciseIds` to
`["barbell-squat"]` in `scripts/catalog-normalization/disambiguations.json`.
**Result:** `bun run catalog:build` exits 1 —
`error: Invalid disambiguation manifest record`, thrown from
`loadCurationManifests (core.ts:431)`. No artifact written.

Verified. This is the exact mutation that previously survived a complete build.

## I4 — full pinning of the 10 underspecified rules — RESOLVED, and stronger than claimed

`shippedDisambiguations.test.ts:76-105` replaced the `toContain` spot checks with a
`test.each` table asserting `movementId` and the exact **ordered** candidate array via
`toEqual`. `back squat` keeps its own dedicated `toEqual` test at lines 34-44, so all
10 rules are covered.

I did not take the report's word for the two named mutations — I swept **all 10 rules
× 3 mutation shapes = 30 mutations**, each applied to
`src/lib/catalog/importDisambiguations.generated.json` (the artifact the shipped test
actually reads) and each restored before the next.

**Mutation set A — drop the last candidate of rule X** (one run per rule):

| rule mutated | failures |
|---|---|
| `back-squat-choice` | 1 — `back squat returns the spec's canonical underspecified choice` |
| `barbell-back-squat-choice` | 1 — `Barbell Back Squat returns the curated squat choice…` |
| `squat-choice` | 1 — `Squat returns the curated squat choice…` |
| `squats-choice` | 1 — `Squats returns the curated squat choice…` |
| `row-choice` | 1 — `Row returns the curated row choice…` |
| `lateral-raise-choice` | 2 — its row + `family-less candidates are exactly the known assignment-coverage gaps` |
| `lateral-raises-choice` | 2 — same shape |
| `shoulder-press-choice` | 2 — same shape |
| `split-squat-choice` | 2 — same shape |
| `split-squats-choice` | 2 — same shape |

**Mutation set B — flip `movementId`** (`squat`→`row`, or `row`→`squat`): all 10 rules,
**1 failed / 20 passed** each time, and in every case the failing test was that rule's
own row. The specific previously-surviving mutation (`squat-choice.movementId` →
`"row"`, which would have filed every bare-"Squat" resolution under the Row family)
now fails `Squat returns the curated squat choice instead of a silent match`.

**Mutation set C — swap candidates[0] and candidates[1]** (ordering, which `toEqual`
should pin and `toContain` could not): all 10 rules, **1 failed / 20 passed** each.
Order is genuinely controlled, not incidental.

**Mutation D — the exact combination the report cites** (`lateral-raise-choice`
truncated to one id **plus** `squat-choice.movementId` → `"row"`): **4 failed / 17
passed**, failures = `Squat…`, `Lateral Raise…`,
`every shipped underspecified rule offers a real choice`,
`family-less candidates are exactly the known assignment-coverage gaps`. The report's
number reproduces exactly.

No sibling of the `toContain`-instead-of-`toEqual` half-pin remains in this file. The
`≥2 candidates` invariant test also genuinely kills (it is one of the 4 in mutation D).

## I3 — committed tests for the new compiler validation — PARTIALLY RESOLVED

### The five `rejects $name` rows all genuinely kill, with no earlier-guard masking

Each mutation deletes exactly one guard in `decodeDisambiguations`; the file has 19
tests total.

| mutation to `scripts/catalog-normalization/compiler/core.ts` | result |
|---|---|
| **M-a** replace the unknown-kind fallthrough `return invalidManifestRecord("disambiguation")` (line 366) with a return of a fabricated valid phrase record | 1 failed / 18 passed — `rejects a disambiguation with an unknown kind` |
| **M-b** delete the behavior-enum check (lines 354-357), replacing it with `const behavior = record.behavior as "strip";` | 1 failed / 18 passed — `rejects a disambiguation phrase with an unknown behavior` |
| **M-c** delete `if (candidateExerciseIds.length < 2) invalidManifestRecord(...)` (line 339) | 1 failed / 18 passed — `rejects a single-candidate disambiguation rule` |
| **M-d** delete `if (seenTokens.has(normalizedName)) invalidManifestRecord(...)` (line 334) | 1 failed / 18 passed — `rejects duplicate disambiguation tokens` |
| **M-e** delete the `assertOnlyKeys(record, [...], "disambiguation")` call for the underspecified branch (lines 330-332) | 1 failed / 18 passed — `rejects a disambiguation rule with an unexpected key` |

Each row is killed by, and only by, the guard it names. Notably **M-c** proves the
single-candidate row is not passing on a stronger earlier guard: `nonEmptyStringArray`
still accepts `["only-one-outcome"]`, and with the `< 2` line gone that row is the
only thing that fails.

*Measurement caveat, stated for honesty:* my first pass reported M-b as killing 2
tests (adding `rejects a disambiguation with an unknown kind`). That was **not
reproducible** — 3 consecutive full-file runs and an isolated `-t "unknown kind"` run
all showed M-b killing exactly 1. I attribute the one-off to a stale `ts-jest`
transform cache from mutating and restoring the same file back-to-back. The table
above is the reproduced result.

### Critical gap: the cross-reference test covers only ONE of the three id kinds

`core.ts:748-763` validates three id kinds at `stage: "complete"` — movement,
modifiers, exercises. Only the exercise branch is tested.

| mutation to `core.ts` | result |
|---|---|
| **M-f** delete the `movementsById.has(rule.movementId)` check + throw (lines 750-752) | **19 passed / 19 total — NO TEST FAILS** |
| **M-g** delete the `modifiersById.has(modifierId)` loop + throw (lines 753-757) | **19 passed / 19 total — NO TEST FAILS** |
| **M-h** delete the `finalExerciseIds.has(exerciseId)` loop + throw (lines 758-762) | 1 failed / 18 passed — `complete builds reject disambiguation candidates missing from the final catalogue` |

Both untested branches are **live, reachable, and correct** — this is a coverage gap,
not dead code. Proven by injecting into the real manifest and running `catalog:build`:

- `back-squat-choice.movementId` → `"no-such-movement"` →
  `error: disambiguation rule back-squat-choice references unknown movement: no-such-movement`
- `back-squat-choice.matchedModifierIds` → `["no-such-modifier"]` →
  `error: disambiguation rule back-squat-choice references unknown modifier: no-such-modifier`

So two thirds of the validation this fix round exists to pin is in exactly the state
I3 was raised about: it could be deleted or weakened and every gate stays green.
**Important — must fix.** Two more `test.each`-style cases in the existing
cross-reference test (inject an unknown `movementId`, then an unknown
`matchedModifierIds` entry, asserting each specific message) close it.

## Applied curation — VERIFIED, including the claim nobody had checked

Counterfactual method: strip all 10 `underspecified-name` records from the shipped
artifact and probe `matchExercise` directly, then restore. This shows what each rule
prevents.

```
"Squat"              matched  via=alias       -> barbell-back-squat        "Barbell Back Squat"        movementId=null
"Squats"             matched  via=normalized  -> squats                    "Squats"                    movementId=null
"Back Squat"         matched  via=alias       -> barbell-back-squat        "Barbell Back Squat"        movementId=null
"Barbell Back Squat" matched  via=normalized  -> barbell-back-squat        "Barbell Back Squat"        movementId=null
"Row"                matched  via=normalized  -> row                       "Row"                       movementId=null
"Rows"               unmatched
"Lateral Raise"      matched  via=alias       -> lateral-raise-with-bands  "Lateral Raise - With Bands" movementId=null
"Lateral Raises"     matched  via=normalized  -> lateral-raises            "Lateral Raises"            movementId=null
"Shoulder Press"     matched  via=alias       -> shoulder-press-with-bands "Shoulder Press - With Bands" movementId=null
"Shoulder Presses"   unmatched
"Split Squat"        matched  via=alias       -> bulgarian-split-squat     "Bulgarian Split Squat"     movementId=null
"Split Squats"       matched  via=normalized  -> split-squats              "Split Squats"              movementId=null
```

- **`barbell-back-squat-choice`** — confirmed necessary. `"Barbell Back Squat"` was an
  exact normalized-name match on `barbell-back-squat` (`movementId: null`, no
  modifiers), i.e. the most formal phrasing bypassed the spec's canonical
  disambiguation entirely. Now underspecified.
- **The three plural rules** — the claim that each "currently exact-matches a
  `movementId: null` duplicate" is **independently confirmed and exactly right**:
  `squats`, `lateral-raises`, `split-squats` are three real family-less duplicate
  catalogue entries that the plurals were silently landing on.
- **Curator's decision to skip `rows` / `shoulder presses`** — still correct.
  Both are `unmatched` today, so the unmatched flow already presents a choice. Rules
  there would be ceremony.
- **M2** — verified. `row-choice` candidates are
  `bent-over-barbell-row, row--cable, row--dumbbell, row--machine`; the generic `row`
  entry is gone. Side benefit worth recording: `row-choice` now has **zero**
  family-less candidates (all four carry `movementId: "row"`).
- **M3** — verified. Both split-squat rules lead with
  `lunge-split-squat--bodyweight` (`movementId: "lunge-split-squat"`), and mutation
  set C proves the leading position is pinned, not incidental.
- **Manifest 16 → 20** — verified by count.

## M4 — false shipped comments — RESOLVED

Both comments now state the truth, and both point the reader at the pin instead of
just deleting the claim:

- `src/lib/import/resolution.testFixtures.ts:3-9` — "now ships reviewed records (see
  `src/lib/catalog/shippedDisambiguations.test.ts` …)".
- `src/lib/import/parser.test.ts:1297-1300` — "so nothing here depends on the shipped
  curation content (which is pinned separately in shippedDisambiguations.test.ts)".

The old text ("currently ships ZERO records", "the shipped disambiguation artifact is
still empty") is gone from both. Verified against `git show e2bdcbb` for those two
files.

## M5 — the `or` rule's blast radius — RESOLVED, and my independent count agrees

Re-derived over **both** names and aliases by tokenizing every catalogue entry's name
and every alias through the production `normalizeExerciseName` and testing for an `or`
token:

```
front-cone-hops-or-hurdle-hops     name="Front Cone Hops (or hurdle hops)"
                                   or-bearing: name AND alias "Front Cone Hops or hurdle hops"
march-or-jog-in-place              name="March or jog in place"
neutral-grip-pull-ups-or-trx-rows  name="Neutral-grip pull-ups or TRX rows"
zone-2-bike-row-or-incline-walk    name="Zone 2 Bike, Row, or Incline Walk"
TOTAL: 4
```

Exactly four, exactly the four named. The mechanism behind the original miss is now
clear and worth recording: `front-cone-hops-or-hurdle-hops` carries the `or` inside
parentheses in its **name**, so a name-only grep for a bare ` or ` token misses it;
the alias has the parens stripped. `task-8b-disambiguation-report.md:111-114` now says
"Four", lists all four, and states that names *and* aliases were checked;
`:190-191` records the "five over a four-item list" correction. Consistent everywhere.

## Settled rulings — still faithfully recorded

Checked, not relitigated:

- **`weighted` strip rule rejected** — `progress.md:230` records the 43 by-name
  entries, the `identity.ts:280` ordering, the safe-future-path note, and the
  classification as spec-vs-catalogue conflict rather than defect. Faithful.
- **`or` reject-alternative accepted with its consequence** —
  `progress.md:231` and `task-8b:111-114`. Faithful, and now with the right count.
- **`barbell-back-squat` carried to final review, `merges.json` not reopened** —
  `progress.md:233`, `:254`, including the 3,033-of-3,175 systemic context. Faithful.
- **Family-less candidates pinned, not substituted** —
  `shippedDisambiguations.test.ts:107-133`. The comment does say the defect is
  "upstream assignment coverage, not the choice lists" and that "a fix — or a
  regression — is visible in the suite", which steers a future reader away from
  swapping in the ugly generated ids. Adequate. See Minor 3 for one wording gap.
- **`parser.test.ts` `minimalDay` touched and flagged** — `parser.test.ts:10-16`
  carries the explanatory comment above `name: "Barbell Squat"`. Faithful.

---

## Answers to the controller's four questions

### Q1 — Determinism

**Verified.** `catalog:check` exits 0. `catalog:build` on the current tree produces a
**zero** working-tree diff, so all five artifacts and the report are already exactly
what the compiler emits. Both curation commits' report diffs are precisely two hash
lines each and nothing else:

- `8177616`: `disambiguations.json` `cbd65b6…`→`edba516…` and
  `importDisambiguations.generated.json` `cbd65b6…`→`edba516…`
- `e2bdcbb`: the same two keys `edba516…`→`d1c1c9f…`

The other four output hashes (`exercises`, `legacyRedirects`, `modifiers`,
`movements`) are byte-identical across both commits.

**Can a curator add a record that passes validation but makes the build
non-deterministic? No.** `shasum` shows
`scripts/catalog-normalization/disambiguations.json` and
`src/lib/catalog/importDisambiguations.generated.json` have the **same hash**
(`5071c56…`): the artifact is a byte-for-byte echo of the validated input
(`versionedArtifact` at `core.ts:437-439` re-serializes with the same indent and
trailing newline, and applies no sort). Nothing else in the pipeline consumes
disambiguations, and `catalog:check` recompiles into a temp root and compares bytes.
Same input bytes ⇒ same output bytes.

**But there is a worse failure mode than non-determinism available, and I reproduced
it.** `normalizedName` is validated as a non-empty string and deduplicated by raw
string, but is **never checked for actually being normalized**. I added this record to
the real manifest:

```json
{ "id": "front-squat-choice", "kind": "underspecified-name",
  "normalizedName": "Front  Squat", "movementId": "squat",
  "candidateExerciseIds": ["squat--barbell--front-rack", "squat--kettlebell--front-rack"],
  "matchedModifierIds": [] }
```

Result: `catalog:build` exit 0 · `catalog:check` exit 0 · `catalog:test` 51/51 passed ·
`shippedDisambiguations.test.ts` 21/21 passed — and the rule is **completely inert**:
`"Front Squat"` still resolves `matched via=normalized -> front-squat` (`movementId:
null`), the silent wrong match the rule was meant to intercept. `prepareImportName`
normalizes the input then does `Map.get`, so a non-normalized key can never be hit.

This is the same defect class as the original BLOCKER — a disambiguation artifact that
ships and does nothing — just one record at a time instead of all of them. The
compiler validates a rule's *shape* but never that its token is *reachable*.
**Important.** The cheap guard is a normalization round-trip assertion in
`decodeDisambiguations` for `normalizedName` and `normalizedPhrase`.

### Q2 — Do the four rules still fix real silent-wrong-matches?

**All four confirmed** by the counterfactual probe above, with the exact wrong target
each one replaces:

| token | silent match without the rule | why it was wrong |
|---|---|---|
| `"Lateral Raise"` | `lateral-raise-with-bands` ("Lateral Raise - With Bands") | band version as the default for a bare name |
| `"Shoulder Press"` | `shoulder-press-with-bands` | same |
| `"Split Squat"` | `bulgarian-split-squat` | rear-foot-elevated as the default for a bare name |
| `"Squat"` / `"Back Squat"` | `barbell-back-squat` (`movementId: null`) | family-less duplicate, bypasses the spec's canonical choice |

**And the three plural rules genuinely intercept a `movementId: null` duplicate** —
this claim had never been independently checked, and it holds for all three:
`"Squats"` → `squats`, `"Lateral Raises"` → `lateral-raises`, `"Split Squats"` →
`split-squats`, each a real family-less duplicate catalogue entry.

### Q3 — Under-reach: is the `squat--kettlebell` omission still open, and does it matter?

**Still open.** `squat-choice` and `squats-choice` offer `barbell-squat`,
`squat--barbell--front-rack`, `bodyweight-squat`, `dumbbell-squat`.
`squat--kettlebell` exists, is **assigned** (`movementId: "squat"`, modifiers
`["kettlebell"]`), and has a clean human name, "Kettlebell Squat".

It matters mildly, and the asymmetry is the argument: it is the only *assigned,
well-named* squat implement excluded, while the rule already includes
`dumbbell-squat` and `bodyweight-squat` on exactly the same footing. A user importing
a bare "Squat" who trains kettlebell squats is offered four options, none of them
theirs — and unlike the family-less candidates, there is no naming excuse here.

**Recommendation (not implemented):** add `squat--kettlebell` to both `squat-choice`
and `squats-choice`. Cost is one manifest edit, one rebuild, and updating
`squatCandidates` in the pinned table; the family-less pin is unaffected because
`squat--kettlebell` is assigned. Controller's call whether this belongs here or in
Task 14's audit. I would not expand further — `squat--kettlebell--front-rack` is
already covered by the front-rack candidate's specificity, and a 6-option prompt for
a bare token starts trading one friction for another.

### Q4 — Dangling ids, and does the cross-reference run over all three kinds?

**No dangling ids.** All 23 candidate exercise ids across the 10 rules resolve in
`exercises.generated.json` (checked individually; also every `movementId` and
`matchedModifierIds` entry passes the `stage: "complete"` cross-reference, which
`catalog:check` exercises on every run and which exits 0).

**The check runs over all three kinds in code; the TEST does not.** `core.ts:748-763`
validates movement, modifiers and exercises. The committed test asserts only
`references unknown exercise: …`. Per M-f/M-g above, deleting either of the other two
branches leaves 19/19 green. See I3 for the required fix.

---

## New findings

**Important 1 — 6 of the 20 shipped records have zero test coverage, and all 6 are
live.** Deleting any one of these from `importDisambiguations.generated.json` leaves
the whole `src/lib/catalog` suite at **50 passed / 50 total**:

`phrase-pain-free`, `phrase-pain-free-depth`, `phrase-pain-free-depth-to-a`,
`phrase-paused-1-second`, `phrase-paused-3-second`, `phrase-paused-5-second`.

(The other four — `phrase-competition`, `phrase-pain-free-depth-to`,
`phrase-paused-2-second`, `phrase-or-alternative` — each kill 1 test when deleted, and
all 10 underspecified rules kill per mutation sets A–C. So the coverage boundary is
exactly these 6.)

They are **not** redundant. Deleting all 6 at once flips four real inputs:

| input | with all 20 records | with the 6 deleted |
|---|---|---|
| `"1-second paused barbell back rack squat"` | `matched -> squat--barbell--back-rack--paused` | `unmatched` |
| `"5-second paused barbell back rack squat"` | `matched -> squat--barbell--back-rack--paused` | `unmatched` |
| `"Back squat to a pain-free depth"` | `underspecified` | `unmatched` |
| `"Pain-free back squat"` | `underspecified` | `unmatched` |

…and the suite stays at 50/50 through all of it. This is I3's defect class on the data
side: shipped behaviour that no test would miss. The 1/3/5-second pause rules are
literal parallels of the tested 2-second rule, so one `test.each` over the four
durations plus two pain-free wordings closes the whole gap cheaply.

**Important 2 —** movement/modifier cross-reference branches untested (I3 above).

**Important 3 —** `normalizedName` normalization unvalidated, so a validating,
green-building, `catalog:check`-passing rule can be entirely inert (Q1 above).

**Important 4 (process) — the fix round shipped with no e2e statement, and e2e was in
fact red.** `IMPLEMENTER-STANDARDS.md:89` requires running e2e or saying explicitly
that you could not. `task-8b-disambiguation-report.md:196-203` lists
`catalog:build`, `catalog:check`, unit (97 suites / 1306 tests), `typecheck`, `lint`
and `git diff --check` — **e2e is absent entirely, in neither form**. And the gap was
real, not theoretical: `e2e/helpers.ts:102` uses bare `{ name: "Squat" }` in
`IMPORT_PROGRAM_JSON`, which `8177616` made underspecified; the e2e suite was only
adapted later, by `0785354` ("test: answer the new import version choice in e2e",
confirmed a descendant of `e2bdcbb`), which added the
`Remember "Squat" as Barbell Squat` assertions now at
`e2e/program-import.spec.ts:66-76`. So e2e was red across `8177616`, `e2bdcbb` and
`344a7f6`, and this is the *second* time the same omission bit the same file. Mitigating:
the four tokens the fix round newly added (`squats`, `split squats`, `lateral raises`,
`barbell back squat`) appear **nowhere** in `e2e/`, so `e2bdcbb` itself introduced no
new e2e exposure, and the breakage is repaired on the current tree. No live defect —
but the standard was not met and the controller should confirm e2e green before
merge rather than inferring it.

**Minor 1 — `progress.md:253`'s "7 of 23 candidates carry `movementId: null` … `row`
1/5" is stale after M2.** Dropping the generic `row` candidate removed the row rule's
only family-less entry, so `row-choice` is now clean at 0/4. Post-fix the figure is
**6 distinct family-less candidate ids** across 4 rule families (lateral-raise band
in 2 rules; 3 shoulder-press entries; 2 split-squat entries in 2 rules), which is
exactly what the pinned test asserts. The ledger is not *wrong* — line 253 records the
pre-fix ruling and line 273 records M2 — but Task 15 must not quote "7 of 23".

**Minor 2 — the disambiguation artifact is the only generated artifact with no
canonical ordering.** Movements sort by `sortOrder`, redirects sort by key, most
records sort `compareById`; disambiguations are echoed in input order.
No determinism risk (Q1), but no ordering discipline either, so manifest diffs depend
on where a curator inserts a record. Cosmetic; flagging only so it is a decision
rather than an oversight.

**Minor 3 — the characterization-test comment stops one sentence short.**
`shippedDisambiguations.test.ts:107-113` correctly says the defect is upstream and
that a fix or regression will be visible, and correctly steers away from swapping the
choice lists. It does not say what the next reader should *do*: that updating this
expectation downward (fewer family-less ids) is **success**, and that the failure must
not be resolved by editing candidates. One added clause would make the settled ruling
unmissable.

## Prior findings I can now correct

None of the fix round's claims were wrong. Two are worth restating as *understated*:

- The report claims I4 pins all 10 rules; my 30-mutation sweep shows it pins
  `movementId`, membership **and ordering** for all 10 — stronger than claimed.
- The report's I3 claim of "6 committed tests" is accurate in count, but the
  cross-reference test covers 1 of the 3 id kinds it validates. That is the one place
  the fix round's self-assessment is more confident than the evidence supports.

## Carry to Task 14's audit and Task 15's final review

**To Task 14 (audit):**
1. `barbell-back-squat` remains a catalogue defect — `movementId: null`, no modifiers,
   named almost identically to the generic `barbell-squat`, still holding the
   `"back squat"`/`"squat"` aliases the new rules shadow. Ruling stands: merge needs
   redirect machinery, not a mid-plan `merges.json` reopen. Systemic: 3,033/3,175
   entries unassigned.
2. Six candidate ids need `assignments.json` coverage so the disambiguation prompt
   stops offering family-less outcomes: `lateral-raise-with-bands`,
   `dumbbell-shoulder-press`, `cable-shoulder-press`, `shoulder-press-with-bands`,
   `bulgarian-split-squat`, `dumbbell-split-squat`. When fixed, **update** the
   `family-less candidates` expectation — that is success, not regression.
3. Family-less duplicate entries the new rules now shadow but do not remove:
   `squats`, `lateral-raises`, `split-squats`, `row`, `front-squat`. They are still
   reachable by their own exact names and still carry no family.
4. `squat--kettlebell` omission from `squat-choice`/`squats-choice` (Q3) — decide
   include or record as deliberate.

**To Task 15 (final review):**
5. Confirm the two cross-reference branches (movement, modifier) gained tests
   (Important 2) — otherwise two thirds of this validation is deletable in silence.
6. Confirm the 6 uncovered phrase records gained tests (Important 1).
7. Confirm a normalization round-trip guard on `normalizedName`/`normalizedPhrase`
   (Important 3), or an explicit ruling that inert rules are acceptable.
8. Confirm the e2e suite green on the merge candidate (Important 4). Do not infer it
   from a green unit suite — that inference has now failed twice on this plan.
9. Do not quote `progress.md:253`'s "7 of 23 / row 1/5" (Minor 1); the post-M2 figure
   is 6 family-less ids and `row-choice` is clean.
10. The four `or`-unreachable entries (`march-or-jog-in-place`,
    `neutral-grip-pull-ups-or-trx-rows`, `zone-2-bike-row-or-incline-walk`,
    `front-cone-hops-or-hurdle-hops`) are accepted and spec-intended (line 418) —
    verify only that the count is still four and still stated as four.

## Mutation-restoration evidence

Every mutated file restored and confirmed byte-identical to the pre-review baseline;
`git diff` over the lane is empty.

```
8b3462461f6f138b5b88bb7e5a76fcdb753ade8e  scripts/catalog-normalization/compiler/core.ts
f3d3105807c6768ea35a255bcf95cc9847978117  scripts/catalog-normalization/compiler/compile.test.ts
5071c569bae23bacbf1050914b40d5d721bddde7  scripts/catalog-normalization/disambiguations.json
5071c569bae23bacbf1050914b40d5d721bddde7  src/lib/catalog/importDisambiguations.generated.json
ffcd9570e7b3de3edb0b735d8497adb694ceef7c  src/lib/catalog/shippedDisambiguations.test.ts
255cf66ae95959af4f9cebb1260b579d9bee6c15  reports/catalog-normalization-report.json

$ git diff --stat -- scripts/catalog-normalization src/lib/catalog reports/catalog-normalization-report.json
(empty)
```

Files mutated during this review: `core.ts` (8 mutations), `disambiguations.json`
(4), `importDisambiguations.generated.json` (41), `reports/catalog-normalization-report.json`
(1, as a build side effect). `compile.test.ts` and `shippedDisambiguations.test.ts`
were read only, never mutated. `src/lib/import/resolution.ts` was **not** touched.
Post-review gates re-run green: `catalog:check` exit 0, 101/101 tests.

Lane note for the controller: I observed a transient `src/components/import/ImportClient.tsx`
modification and a staged `task-12-review.md` from concurrent reviewers, and the shared
scratchpad is shared across all four of us (another agent overwrote my baseline hash
file mid-review, which is why the restoration evidence above is re-derived directly).
Neither affected my measurements.

---

**CHANGES REQUESTED**

I5, I4, M2, M3, M4, M5 and the applied curation are all fully verified and, in I4's
case, stronger than the report claimed. I3 is the one item not finished, and there are
three new gaps of the same defect class the fix round was raised to close.

**What must change:**

1. **(Important, I3)** Add cross-reference test cases for the unknown-**movement** and
   unknown-**modifier** branches at `core.ts:750-757`. Deleting either leaves 19/19
   green today, so two thirds of the validation this fix round exists to pin is
   unprotected. Both branches are live — proven by manifest injection — so this is
   test-only work.
2. **(Important)** Cover the 6 uncovered shipped phrase records
   (`phrase-pain-free`, `phrase-pain-free-depth`, `phrase-pain-free-depth-to-a`,
   `phrase-paused-1-second`, `-3-second`, `-5-second`). Deleting all 6 flips four real
   inputs from matched/underspecified to unmatched with the suite still at 50/50.
   One `test.each` over the four pause durations plus two pain-free wordings.
3. **(Important)** Reject a `normalizedName`/`normalizedPhrase` that is not already
   normalized, in `decodeDisambiguations`. Today `"Front  Squat"` validates, builds,
   passes `catalog:check` and 101/101 tests, and is inert — the original BLOCKER's
   defect class, one record at a time. If the controller prefers to defer, record it
   as a known curator footgun rather than leaving it silent.
4. **(Important, process)** Confirm the e2e suite green on the merge candidate and say
   so. The fix round's report omits e2e in both required forms, and e2e was genuinely
   red for bare `"Squat"` across three commits before Task 9 repaired it.
5. **(Minor)** One clause in the `family-less candidates` comment stating that
   updating the expectation downward is success and must not be resolved by editing
   candidate lists. **(Minor)** Stop quoting `progress.md:253`'s "7 of 23 / row 1/5";
   post-M2 it is 6 family-less ids with `row-choice` clean.

`squat--kettlebell` (Q3) is a recommendation, not a required change — controller's
call whether it lands here or in Task 14.

**Verified but could NOT falsify:**

- The 10 underspecified rules' `movementId`, exact candidate membership, and candidate
  **ordering** — 30 mutations, every one killed exactly its own row.
- The five `rejects $name` validation rows — 5 mutations, each killed by and only by
  its own guard, no earlier-guard masking.
- The single-candidate rejection against the real manifest (`catalog:build` exit 1).
- Build determinism: `catalog:build` yields a zero diff; the artifact is a byte-for-byte
  echo of validated input; no curator record can make it non-deterministic.
- All 23 candidate exercise ids, all `movementId`s and all `matchedModifierIds` exist.
- The `or` rule's blast radius: independently re-derived over names **and** aliases as
  exactly four entries, exactly the four named.
- Both M4 comments are now true statements.
