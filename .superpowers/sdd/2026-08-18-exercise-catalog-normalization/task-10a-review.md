# Task 10a review — restore keeps the key its writer chose (NEW-A, NEW-B)

Reviewer working notes, written incrementally. Sections fill in as evidence lands.

- Worktree: `/Users/djdjo/Documents/mine/trAIner/.worktrees/exercise-catalog-normalization`
- HEAD at review start: `6f9f3c5`
- Scope reviewed: `6ece7ee`, `37e661e`, `ce885bd`, `a6224d6`/`74f05d8`

## Status
IN PROGRESS

## Findings landed so far (working notes, may be revised below)

### F1 (Important) — `backup.ts:311-313` still documents the OLD rule, inverted
`src/lib/backup/backup.ts:311-317`:

> `- Integrity, for every version: the token is recomputed from the alias text
>    and rows are deduped on the result. **The file's own `normalizedAlias` is
>    never written.**`

After `6ece7ee` the file's own `normalizedAlias` is *exactly* what is written
whenever it is readable. This is the shipped comment that justified the whole
"integrity recompute", it is in the one file with a history of wiping stores on
restore, and it is now the inverse of the code four lines below it. Round 3's
unconditional obligation was to remove or correct false shipped claims of this
class; two of the three were corrected (`aliasRepo.ts:25-33`,
`ExerciseCorrectionSheet.test.tsx:557`) and this one — the load-bearing one — was
not.

### F2 (Important) — `aliasRepo.ts:130-135` likewise inverted
`putRaw`'s comment still reads

> `// One shared rule with the migration/restore classifier ... : recomputed from
>  // the display text, falling back to the stored token, ...`

Same defect class, same round, same function pair. `aliasLookupToken` now does
the opposite of what its only production-adjacent caller's comment says it does.

## Mutation evidence (mine, re-measured)

Zero-footprint harness: an out-of-tree Jest config in the session scratchpad
(`t10arev/jest.mut.js`) whose `moduleNameMapper` swaps `v10Identity` for a
mutated copy kept **outside** `src/`. No tracked file was edited at any point in
this review; `git diff --quiet` and `git status --porcelain` verified clean
after every run. Scope **S** = `src/lib/storage` + `src/lib/backup`, baseline
**14 suites / 268 passed** at `6f9f3c5`. Scope **C** =
`src/lib/catalog/shippedDisambiguations.test.ts`, baseline **33 passed**.

**Harness non-vacuity — a trap I fell into first and record here because it is
the exact class this plan keeps hitting.** My first config listed the mutation
entry *after* `"^@/(.*)$"`. Jest applies `moduleNameMapper` in insertion order,
so every `@/lib/storage/migrations/v10Identity` import (i.e. `backup.ts`,
`appDb.ts`) resolved to the *real* module and only the relative-import callers
were mutated: M-A measured **6 failed / 262** and looked like a report
discrepancy. With the mutation entries inserted first it measures 11. Anyone
reusing the `moduleNameMapper` technique on this repo must put the mutation
before the alias mapping, and must sanity-check that the count moves.

| # | Exact mutation | Scope | Report | Mine |
|---|---|---|---|---|
| **M-A** | `v10Identity.ts` `aliasLookupToken`: the `fromStored` block moved back *below* the `fromDisplay` block — the shipped defect restored verbatim | S | 11 / 268 | **11 failed / 257** — same 11 test names as the report, exactly |
| **M-B** | `v10Identity.ts` `aliasRuleText` body → `return token;` (the trap: rule text recoupled to the key) | S | 1 / 266 | **1 failed / 267** — `runs the disambiguation rules over the display text even when the token is already stripped` |
| **M-C** | `v10Identity.ts` `aliasLookupToken`: `normalizeExerciseName(alias.normalizedAlias)` → `alias.normalizedAlias` (drop the normalize pass) | S | 18 / 266 | **18 failed / 250** — same family |
| **M-D** | `v10Identity.ts` `claim`: `token = document.id;` inserted, so dedupe is per row not per token | S | 11 / 267 | **11 failed / 257** — includes `collapses two rows that claim one stored token, rather than issuing a colliding write` |

The report's denominators are two lower (266/267) because it measured before its
last two tests landed; the kill sets are identical. **The reported numbers
reproduce.**

## Verdict 1 — the NEW-A fix and the decoupling

**The fix is correct and the decoupling is complete.** `v10Identity.ts:359-368`
now tries `fromStored` first and `fromDisplay` only as a fallback; the
`fromDisplayText` flag is gone from the return type entirely, so no caller can
re-couple the two decisions by accident.

**The decoupling is not merely "correct", it is provably behaviour-preserving
for the rule text**, which is the strongest form the trap could have been
closed in. Old code:

```
fromDisplay = isReadableText(alias.alias) ? normalizeExerciseName(alias.alias) : ""
if (fromDisplay) -> { fromDisplayText: true }
textForRules = token.fromDisplayText ? alias.alias : normalizedAlias
```

New code (`v10Identity.ts:381-384`):

```
if (isReadableText(alias.alias) && normalizeExerciseName(alias.alias)) return alias.alias;
return token;
```

The guard is the *same predicate*, and both branches return the *same value*
(`alias.alias`, else the final token). So `textForRules` is byte-identical to
the pre-fix value for **every possible input**, not merely for the ones under
test. The `or`-detection path therefore cannot have moved. This is the reason
the 24,412-row digest comes out identical, and it is a stronger argument than
the digest — the digest is a sample, this is total.

Confirmed by mutation, not only by reading: **M-B** (`aliasRuleText` body →
`return token;`) kills `runs the disambiguation rules over the display text even
when the token is already stripped`, **1 failed / 267**. The trap is pinned.

## Verdict 2 — the attack on the "hand-edited backups only" premise

The controller's phrasing of the premise is **literally false**, and the
implementer's own report says so more precisely than the ruling does. I tested
it rather than reasoning about it. Probe file (scratchpad, deleted after use):
`t10arev/probe/t10arev.premise.test.ts`, 10 assertions, **all pass at HEAD**,
and **5 of the 10 die under M-A**, so the probe is not vacuous.

| Probe | Result |
|---|---|
| `aliasRepo.save("3 second paused Hatfield Squat")` | stores `paused hatfield squat` — a **real mismatch**, `!== normalizeExerciseName(alias)` — and stamps `provenance: "remembered"` |
| `aliasRepo.replaceRemembered(...)` | same: mismatch, `remembered` |
| `aliasRepo.save({provenance: "legacy-auto"})` | **rejected** (`assertRememberedInput`, `aliasRepo.ts:57`) |
| `aliasRepo.putRaw({normalizedAlias: "totally unrelated token"})` | stores it verbatim as `legacy-auto` — the **one** `src/` writer that can mint a non-`remembered` mismatch |
| `classifyAliases([staleRememberedRow], [], "all")` | retained on its own token |
| `classifyAliases([staleRememberedRow], [], "unclassified")` | retained on its own token |
| same row with `provenance` deleted, scope `"all"` | **purged** — canary proving the short-circuit is what saved it |
| `Hatfield Squat or Lunge` as `remembered` | retained; unclassified twin purged — `remembered` outranks the `or`-purge too |
| `save` → real `getAll` export → `restoreBackup` v2 | correction still resolves; every exported row keeps its provenance |
| the same rows presented as a **version-1** file (scope `"all"`) | correction still resolves |

**So the premise as ruled — "no code path in `src/` can produce a row whose
stored token disagrees with its display text" — is false; three do.** The premise
that actually holds, and that the deferral needs, is narrower:

> Every mismatch row any *production* `src/` path can write carries
> `provenance: "remembered"`, and `remembered` short-circuits the classification
> rules under both scopes, so it can never reach the outcome gate.

I verified that narrower premise by enumeration as well as by test. The complete
set of writers to the `aliases` store in `src/`:

- `aliasRepo.saveMany` (`aliasRepo.ts:116`) — `provenance: "remembered"` hard-coded
- `aliasRepo.replaceRemembered` (`:162`) — hard-coded
- `aliasRepo.putRaw` (`:141`) — `input.provenance ?? "legacy-auto"`; **no production callers** (`grep -rn putRaw src/` outside tests returns only the declaration, the implementation and two doc comments)
- `appDb.ts:263` (v10 upgrade) and `backup.ts:390` (restore) — both write only what `classifyAliases` returns, which preserves an input mismatch but cannot invent one

`ExerciseCorrectionSheet.tsx:454-455` and `ImportClient.tsx:278` are the only
production call sites, and both go through `replaceRemembered`/`save`/`saveMany`.

**Conclusion: the deferral stands, but on a corrected premise.** The population
that can lose an alias is exactly "an unclassified row whose stored token
disagrees with its display text", and the only ways to get one are hand-editing
a backup or calling `putRaw`, which nothing does. I could **not** falsify it.

*The record should be corrected, though*: `putRaw` is a live, exported, public
method on `AliasRepository` with zero production callers, and it is the single
gap in the premise. If anything ever wires it up — a future "import a partial
backup" or "merge two databases" feature is the obvious candidate — the
deferral's population stops being self-inflicted. The `aliasLookupToken` comment
already notes `putRaw` has no production callers; the *deferral* should say so
too, because that is the fact it depends on.

## Verdict 3 — legacy retention: the conclusion is right, one claim about the evidence is not

**The retention conclusion reproduces exactly.** I rebuilt the probe
independently (24,415 legacy-shaped rows — every catalogue name and alias under
the same five prefixes, plus a custom exercise — targets pointed at the id the
name came from):

```
rows: 24415
all: retained 3749            unclassified: retained 3749
digest c8923047e8390032139e36293b8346e652510a2badc20d1d65b8f47e1f787633 (both scopes)
```

**`retained 3749`, both scopes, matches the report to the unit** on an
independently written corpus. And running the *same* probe under **M-A** — which
is the pre-fix `aliasLookupToken` verbatim, so it is the control worktree at
`1fe3b0d` for this function — gives a **byte-identical digest**. The legacy
population really is unaffected by the key-preference flip. That half is solid.

### Finding F3 (Important) — the digest harness is vacuous for the `or` trap it is credited with closing

The report says of that measurement: *"The `or`-retention trap is closed by
measurement, not by reading."* **It is not.** I ran the same digest under **M-B**
(the trap mutation) and under **M-C**:

| Harness run | retained | digest |
|---|---|---|
| HEAD | 3749 | `c8923047…` |
| **M-A** (pre-fix key preference) | 3749 | `c8923047…` |
| **M-B** (`aliasRuleText` → `return token`) | 3749 | **`c8923047…` — identical** |
| **M-C** (drop the normalize pass) | 3749 | **`c8923047…` — identical** |

A digest that is invariant under the exact mutation it is offered as evidence
against proves nothing about that mutation. And it is vacuous **by
construction**, not by luck — the same structural blindness the implementer
correctly diagnosed in its own NEW-B corpus, missed one section earlier in its
own report. For a legacy-shaped row `token === normalizeExerciseName(alias)`,
and `prepareImportName`'s first act is `normalizeExerciseName`, so
`prepareImportName(alias.alias)` and `prepareImportName(token)` are the *same
call*. No legacy-shaped corpus of any size can express the trap.

Isolated and proved (`t10arev/probe/t10arev.ortrap.test.ts`):

| Row | HEAD | under M-B |
|---|---|---|
| legacy-shaped: `{alias: "Hatfield Squat or Lunge", token: "hatfield squat or lunge"}` | purged | **purged** — the corpus shape cannot flip |
| mismatched: `{alias: "Hatfield Squat or Lunge", token: "hatfield squat lunge"}` | purged | **RETAINED** — the trap, and the only shape that expresses it |
| canary: `{alias: "Hatfield Squat Lunge", token: "hatfield squat lunge"}` | retained | retained — so the `or` rule, not the outcome gate, is what dropped the row above |

**What actually closes the trap** is (a) the shipped test M-B kills,
`runs the disambiguation rules over the display text even when the token is
already stripped`, which is exactly the mismatched shape above and carries the
right canary; and (b) the total equivalence argument in Verdict 1. Both are
sound. So the *outcome* is safe — only the report's characterisation of which
evidence carries it is wrong, and on this plan a misattributed piece of evidence
is how a green test survives a round. **Correct the sentence.**

Worth recording as a general lesson, since it is the second instance in one
round: *a corpus built from rows the defect cannot inhabit is not evidence about
the defect, however many rows it has.* The implementer wrote that lesson for
NEW-B and then did not apply it to §1.

## Verdict 4 — the two-generation case, reproduced independently

`t10arev/probe/t10arev.reject.test.ts`, three tests, all over a **real
fake-indexeddb database through `restoreBackup`** (not the pure classifier).
All three pass at HEAD; **all three fail under M-A**.

| Probe | HEAD | M-A |
|---|---|---|
| v2 file: `{legacy, "3 second paused Hatfield Squat", "3 second paused hatfield squat", legacy-auto}` + `{new, same display, "paused hatfield squat", remembered}` → both survive with their own tokens; `aliasRepo.find("3 second paused Hatfield Squat")` returns `new` | PASS | FAIL |
| **v1 file (scope `"all"`, the harder case the shipped test does not cover)**: an unclassified legacy row plus a `remembered` stripped row, distinct display names → both survive, the correction resolves | PASS | FAIL |
| two hand-edited rows claiming one stored token → restore **resolves**, one row stored, no throw | PASS | FAIL |

Note my v2 fixture uses `legacy-auto` for the legacy row where the shipped test
`appDb.test.ts:1725` uses `remembered` for **both**. The shipped test therefore
only exercises the `alreadyClassified` branch. Mine exercises the retain branch
as well and the v1 `"all"` scope, and the result holds. **Minor: the shipped
two-generation test would be strictly stronger with the legacy row as
`legacy-auto`**, which is what a real legacy row is.

## Verdict 5 — write rejection

All three standing invariants re-verified at `6f9f3c5`, by grep and by test:

- `by-normalized-alias` (`appDb.ts:120`) is still the **only** `{unique: true}` index in the schema.
- **No `IDBObjectStore.add()` in `src/`**. Every `.add(` hit is a `Set.add`, and every alias write is `store.put` (`aliasRepo.ts:123, 145, 157`, `backup.ts:390`, `appDb.ts:263ff`).
- `restoreBackup` **clears** the aliases store before writing (`backup.ts:385`), and the write set is `classifyAliases`'s output, which is `[...byToken.values()]` — the map key *is* the written `normalizedAlias`. So the put set has distinct index keys by construction and cannot self-collide.

**The negative result is meaningful, not an artefact of a permissive harness.**
Control (`t10arev/probe/t10arev.control.test.ts`): two raw puts with the same
`normalizedAlias`, bypassing every guard, produce a real
`ConstraintError: A mutation operation in the transaction failed…` from
`fake-indexeddb`'s `Index.storeRecord`. So the harness does enforce the index,
and "restore does not throw" is a measured negative.

**The implementer's strengthening argument is correct and I want it on the
record**: an exported alias set came out of a database whose
`by-normalized-alias` is unique, so its `normalizedAlias` values are distinct
*by construction*; keeping them cannot introduce a collision the source database
did not have, whereas **recomputing** can collapse two live keys onto one. That
inverts the reasoning in the comment the old `putRaw` test carried, and the
implementer is right that the old comment had it backwards. For any
legally-exported file the new rule is strictly safer than the old one, not a
trade.

### Finding F4 (Minor) — a second new loss path, named but not classified as loss

Preferring the stored token means two **hand-edited** rows with different
display texts sharing one token now collapse to one, where re-deriving gave them
two distinct keys and kept both. The report names this as "a new collision path"
and answers only the write-rejection question. It is also a (bounded) *loss*
question, and it should be recorded as one. It is unreachable from a legally
exported file (the unique index forbids two such rows coexisting), it is
absorbed by `winsCollision` (newest wins) rather than arbitrarily, and the
standing exception permits dropping an alias — so **no change requested**, only
the classification.

## Verdict 6 — the five inherited tests, checked by diff

Read as a set against `git show 6ece7ee -- src/lib/backup/backup.test.ts
src/lib/storage/appDb.test.ts src/lib/storage/aliasRepo.test.ts`. **None was
weakened, and the declaration in the report is complete and accurate** (the sixth
row of its table, `appDb.test.ts` being outside the named lane, is flagged
honestly). Detail:

| Test | Change | Judgement |
|---|---|---|
| `backup.test.ts` `recomputes normalizedAlias from the alias text` → `keeps the token the file gave an already-classified alias` | fixture moved v1/`legacy-auto` → v2/`remembered`; now asserts `normalizedAlias: "wrong token"` (the normalize pass visible) | inverted, not weakened; the v1 case it vacated is covered by the new sibling |
| new sibling `purges an unclassified legacy alias whose stale token names no exercise` | asserts `putsToStore(isAlias)` is `[]` | real; killed by M-A |
| `backup.test.ts` `…recompute to the same token` → `…normalize to the same token` | rename only, assertions byte-identical | correct; still killed by M-C and M-D |
| `appDb.test.ts` `makes a restored alias findable even when the file's own token was stale` → `purges a legacy alias whose stale token names no exercise` | assertion inverted to `find` undefined **and** `list()` empty | the deferral, pinned; killed by M-A |
| `appDb.test.ts` `still recomputes a stale token…` → `keeps an already-classified alias on the token the file gave it` | `find(...)` → `list()` with id/token/provenance | not weaker; `find` is deliberately no longer the right question |
| `aliasRepo.test.ts` `putRaw recomputes…` → `putRaw keeps the token the row was written under, normalized` | fixture `"totally-wrong-token"` → `"  90 90   HAMSTRING "` | **see F5** |
| new sibling `putRaw keeps a phrase-stripped token rather than re-deriving it from the display text` | annotated name, asserts the stripped token survives | real; killed by M-A; carries its own comment saying the annotated name is load-bearing |

Both claimed new siblings add real coverage: M-A kills each of them.

### Finding F5 (Minor) — one re-pinned test is the "plain name" trap, and its name overclaims

`aliasRepo.test.ts` `putRaw keeps the token the row was written under, normalized`
uses `alias: "90/90 Hamstring"`, `normalizedAlias: "  90 90   HAMSTRING "`.
Measured: `normalizeExerciseName("90/90 Hamstring")` and
`normalizeExerciseName("  90 90   HAMSTRING ")` are **both** `"90 90 hamstring"`.
The fixture therefore **cannot distinguish "keep the stored token" from
"re-derive from the display text"** — and it does not: **M-A does not kill it**
(it is absent from M-A's 11). What it actually pins is the normalize pass, and
M-C kills it, so it is not dead weight — but its title claims the property it is
structurally unable to test. Its *predecessor* (`"totally-wrong-token"`) could
discriminate; this fixture cannot.

No coverage is lost, because the new sibling covers exactly that property with
an annotated name. **Requested change is cosmetic but on this plan it matters:**
rename it to what it pins (the normalize pass over a stored token), or give it
an annotated display text so the title becomes true. This is the shape the brief
told me to hunt for — a fixture using a plain name — and it is present in the
shipped diff.

## Verdict 7 — NEW-B's fixed-point pin

**The corpus does exercise the join shape.** `shippedDisambiguations.test.ts`
builds the embedded corpus as both `` `${name} ${token}` `` *and*
`[words[0], token, ...words.slice(1)].join(" ")` — appended and mid-name — over
all 10 `non-identity-phrase` tokens × the catalogue, with a
`toBeGreaterThan(10_000)` vacuity guard. The comment explains why prefix-only is
insufficient and tells future readers not to trim it.

Re-measured, two of the three catalogue mutations:

| # | Exact mutation | Report | Mine |
|---|---|---|---|
| **M-N1** | `importDisambiguations.generated.json` gains `{kind: "non-identity-phrase", normalizedPhrase: "high bar back squat", behavior: "strip"}` | 2 / 31 | **2 failed / 31** — `over every phrase token embedded in and appended to every catalogue name`, and the pre-existing `exact concrete names bypass the underspecified choice` |
| **M-N2** | `identity.ts:112` `normalizedName: normalizeExerciseName(normalizedName)` → `normalizedName` | 10 / 23 | **10 failed / 23** — kills 4 of the 5 new tests (catalogue, composites, embedded, decorated) |
| **M-N3** | two-part artifact mutation | 6 / 27 | **not re-run.** A simplified one-record variant of mine (underspecified `normalizedName: "high bar competition back squat"`, no second strip rule) survived **33/33**, correctly — the property pins the *output's* stability, not `prepared(input) === input`, and one strip alone leaves the output stable. Consistent with the report, which describes M-N3 as two records. Reported as the implementer's measurement, not mine. |

**M-N1 is the decisive result and it confirms the implementer's claim
precisely**: it kills the *embedded* test and leaves `over every rule token
applied to every catalogue name` — the prefix-only composite corpus, 20 × 3,175
inputs — **green**. So a prefix corpus of 63,500 inputs would have missed a
curation record that genuinely breaks the property, and the join-shape corpus
catches it. The pin would fail if a future curation record broke the property.
**Verified, could not falsify.**

## The purge pin and the shipped comment

The two tests the deferral is recorded in are real and they pin the purge, not
something adjacent: **M-A kills both** — `purges an unclassified legacy row whose
stored token names no exercise` (`v10Identity.test.ts`) and `purges an
unclassified legacy alias whose stale token names no exercise`
(`backup.test.ts`), plus a third, `purges a legacy alias whose stale token names
no exercise` (`appDb.test.ts`), which the report does not name. Under M-A each
row is repaired instead of purged, so the assertion is genuinely load-bearing on
the deferred behaviour.

The shipped comment in `v10Identity.ts:346-351` describes it **accurately**:

> *"an unclassified legacy row is still judged by the outcome gate below on that
> token, so a hand-edited one naming no exercise is purged rather than repaired."*

### Finding F6 (Minor) — one shipped test comment repeats the premise in its false, wide form
`backup.test.ts` (the `restoreBackup — alias tokens are kept, then deduped`
header) says *"No writer in `src/` can produce such a row"*. `aliasRepo.putRaw`
can: I planted `{alias: "3 second paused Hatfield Squat", normalizedAlias:
"totally unrelated token"}` through it and it stored verbatim as `legacy-auto`.
The true statement is *"no writer in `src/` with a production caller"*. One word.

## Judging the rejected alternative

The implementer costed and rejected a discriminating rule — trust the stored
token when it equals `normalizeExerciseName(alias)` **or**
`prepareImportName(alias).normalizedName`, else re-derive — on the ground that it
makes trust depend on the *current* rule artifact, so a future curation change
re-opens NEW-A silently, triggered by the very catalogue regeneration this plan
performs.

**That reasoning is right, and it is the strongest argument in the report.** Two
things reinforce it that the report does not say:

1. The failure it predicts is not hypothetical here — `37e661e` exists *because*
   a curation record can move a prepared token. The discriminating rule would
   have made a correctness property of restore depend on the same artifact
   NEW-B had to be written to guard. Two load-bearing dependencies on one
   regenerated file, one of them silent.
2. The discriminating rule's failure mode is **silent re-keying**, which is the
   exact defect class of NEW-A; the uniform rule's failure mode is **a dead
   shortcut staying dead**, which is bounded and visible. Given the standing
   principle that loss of access outranks a visible failure, choosing the rule
   whose worst case is "no change to an already-dead row" is correct.

That the discriminating rule breaks zero tests and reads better is exactly why
it deserved to be written down and refused rather than quietly not considered.
Good judgement, well recorded.

## Anything NEW

Nothing Critical. F1-F6 above; F1 and F3 are the two that should change before
this lands. Specifically, I found **no** new data-loss path, no new
`ConstraintError` reachability, no schema change, no new unique index, and no
`IDBObjectStore.add()`.

Lane gates at `6f9f3c5`, run serially, no e2e and no Playwright at any point:

```
$ npx jest --runInBand src/lib/storage src/lib/backup src/lib/catalog
Test Suites: 18 passed, 18 total
Tests:       330 passed, 330 total
```

Worktree left exactly as found: `git status --porcelain` empty,
`git diff --quiet -- src/` clean, no `__t10arev_*` files anywhere under `src/`.
Every mutant and probe lived in the session scratchpad under a `t10arev` prefix
and has been deleted.

## Status

**CHANGES REQUESTED** — nothing Critical; two Important items, both text rather
than behaviour, and on this plan false shipped text has been the leading
indicator every time.

What must change:

1. **F1 (Important)** — `backup.ts:311-313` still says *"the token is recomputed
   from the alias text… The file's own `normalizedAlias` is never written."*
   That is the inverse of the shipped behaviour, in the restore path, in the
   comment that justifies the whole operation. Round 3's obligation to correct
   false shipped claims was unconditional and this is the one that mattered
   most.
2. **F2 (Important)** — `aliasRepo.ts:130-135`, `putRaw`'s comment, same
   inversion: *"recomputed from the display text, falling back to the stored
   token"*.
3. **F3 (Important)** — correct the report's claim that *"the `or`-retention trap
   is closed by measurement"*. The 24,412-row legacy digest is **invariant under
   M-B and M-C** (measured; table above) and cannot express the trap, because a
   legacy row's display text and token are the same string to
   `prepareImportName`. The trap *is* closed — by the M-B test and by the total
   equivalence of `aliasRuleText` to the old `textForRules` — but the evidence
   cited is not the evidence that closes it.
4. **F5 (Minor)** — rename `putRaw keeps the token the row was written under,
   normalized`, or give it an annotated display text. Its fixture cannot
   distinguish the two rules (`normalizeExerciseName` of both the display text
   and the stored token is `"90 90 hamstring"`) and M-A does not kill it.
5. **F6 (Minor)** — `backup.test.ts`: *"No writer in `src/` can produce such a
   row"* → *"no writer with a production caller"*; `putRaw` can.
6. **F4 (Minor, classification only)** — record the two-hand-edited-rows-share-a-token
   collapse as a bounded *loss* path, not only as a write-rejection question.
7. **Optional strengthening** — `appDb.test.ts:1725`'s two-generation fixture
   marks both rows `remembered`, so it only exercises the `alreadyClassified`
   branch. Making the legacy row `legacy-auto` exercises the retain branch too;
   I verified that variant passes.

Verified but could **NOT** falsify (recorded as confirmations, not as gaps I
closed):

- **The NEW-A fix.** M-A reproduces the shipped defect and kills 11 tests, the same 11 the report names.
- **The decoupling.** `aliasRuleText` is *provably* value-identical to the old `textForRules` for every input, not merely for the tested ones; M-B kills exactly one test, the right one, with the right canary.
- **The deferral's operative premise.** Ten probes, five of which die under M-A: every mismatch row a production `src/` path can write carries `provenance: "remembered"`, and `remembered` short-circuits under both scopes — including for an `or` name and for a token naming no exercise. The single gap is `putRaw`, which has no production callers. The controller's wider phrasing of the premise is false; the narrower one holds.
- **Legacy retention.** Independently rebuilt corpus, `retained 3749` both scopes, matching the report to the unit, and byte-identical under M-A.
- **Write rejection.** One unique index, no `.add()`, restore clears-then-puts a set whose keys are the dedupe map's keys; and `fake-indexeddb` really does throw `ConstraintError` on a raw duplicate put, so the negative is measured.
- **The two-generation case**, reproduced over a real database including the harder version-1 `"all"`-scope variant the shipped tests do not cover.
- **NEW-B's pin.** M-N1 kills the embedded test and leaves the 63,500-input prefix-only corpus green — the join shape is load-bearing exactly as claimed.
- **e2e.** Not run, by controller instruction. I agree with the implementer that this change needs none: `aliasLookupToken` is a pure function and the restore path is covered at the database level. Unverified, not cleared.
