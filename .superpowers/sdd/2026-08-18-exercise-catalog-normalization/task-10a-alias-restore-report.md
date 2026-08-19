# Task 10a — a correction must survive a backup restore (NEW-A, NEW-B)

Branch `feat/exercise-catalog-normalization`, worktree
`.worktrees/exercise-catalog-normalization`. Started at `1fe3b0d` (brief said
`facd079`; a sibling had landed `1fe3b0d` on top by the time I began).

Commits:

| SHA | What |
|---|---|
| `6ece7ee` | the fix: `aliasLookupToken` keeps the key its writer chose; rule text split off the key; five inherited tests re-pinned |
| `37e661e` | NEW-B: the fixed-point property pinned against the real shipped artifact |
| `ce885bd` | the two-generation case proved over a real database; two self-review comment corrections |
| `1f4d45f` | report + the two false-claim corrections in `task-10-report.md` and one comment in `ExerciseCorrectionSheet.test.tsx` |

**e2e not run — controller instruction.** No Playwright was started at any point
in this session. Nothing in my diff touches a component, a route, or a user
flow: the change is one pure function in `v10Identity.ts` plus comments and
tests. I do not think it needs e2e coverage. If you want one anyway, the
interesting flow is export → restore → `Needs review`, and it is covered at the
database level by `keeps both generations of key for one display name, and the
correction still resolves` in `appDb.test.ts`.

**Snapshot hygiene (controller's `/tmp` warning).** I have never used `/tmp` for
a snapshot in this session. Every pre-mutation copy lived in the session
scratchpad under a task-unique name
(`task10a-v10Identity.ts.orig`, `task10a-identity.ts.orig`,
`task10a-importDisambiguations.generated.json.orig`). Every restore was
`shasum`-verified **and** confirmed against HEAD with `git diff --quiet`, which
is what the warning asks for — a shasum match against a clobbered snapshot
proves nothing. All three files verify clean against HEAD now. I restored from
no `/tmp` path, so there is nothing of mine to re-check.

---

## 1. NEW-A — the ruling, implemented

### RED first, reproducing the reviewer's measurement

Two new tests in `v10Identity.test.ts`, written before any source change:

```
● classifyAliases — a restore keeps the key its writer chose › keeps a remembered
  correction on the phrase-stripped token the resolver reads

    - Expected  - 1
    + Received  + 1
      Array [
    -   "paused hatfield squat",
    +   "3 second paused hatfield squat",
      ]

● classifyAliases — a restore keeps the key its writer chose › keeps both
  generations of key when one display name carries a legacy row and a new one

    - Expected  - 5
    + Received  + 1
      Array [
        Array [
    -     "alias-legacy",
    +     "alias-new",
          "3 second paused hatfield squat",
    -   ],
    -   Array [
    -     "alias-new",
    -     "paused hatfield squat",
        ],
      ]

Tests: 2 failed, 25 passed, 27 total
```

That is the reviewer's repro exactly, including the destructive half: the
two-generation case came back as **one** row, on the unstripped token, with the
legacy row's mapping silently discarded. The first test's pre-restore canary
(`resolves before restore === "goblet-squat"`) passed in the same RED run, so
the failure is the restore and not the fixture.

### The change

`aliasLookupToken` (`v10Identity.ts`) now prefers the readable stored
`normalizedAlias`, keeping the `normalizeExerciseName` pass over it, and derives
from the display text only when there is no readable token. The doc comment
carries the measurement and the reasoning.

**The trap was real and I did not take it.** `fromDisplayText` is gone as a
concept, replaced by a separate `aliasRuleText(alias, token)` that prefers the
readable display text and falls back to the token. Simply inverting the key
preference would have fed the disambiguation rules an already-stripped token,
and an `or` name would have started being **retained** instead of purged. That
is measured below (M-B), and the first version of my guard for it did **not**
catch it — see the mutation section.

### Why the ruling is right, with one thing it did not foresee

I looked hard for a reason to push back and found the opposite: an argument the
brief does not make that strengthens it, and one cost it under-called.

**Strengthening it.** Every alias in an exported file came out of a database
whose `by-normalized-alias` index is `{unique: true}`. So the exported set's
`normalizedAlias` values are distinct *by construction*. Keeping them cannot
introduce a collision that the source database did not already have;
**recomputing** is the operation that can collapse two live keys onto one. The
comment on the old `putRaw` test had this backwards — it claimed trusting the
stored token "plants a duplicate on the unique index" — and that is the reverse
of what the index guarantees.

**And the reason the obvious fourth option is wrong.** I costed a
discriminating rule — trust the stored token when it equals *either*
`normalizeExerciseName(alias)` *or* `prepareImportName(alias).normalizedName`,
else re-derive. It fixes NEW-A, keeps both generations, and breaks none of the
five inherited tests, so it looks strictly better. It is not: it makes "do we
trust this key?" depend on the **current** rule artifact. A correction written
today matches neither derivation after any future curation change, so the next
restore re-keys it and NEW-A comes straight back — triggered by a catalogue
regeneration, which is the thing this whole plan does. Trusting the stored token
unconditionally is the only rule that is stable across rule-set changes. The
brief's uniform version is the correct one.

**What the brief under-called.** It says legacy rows "already equal the derived
one, so they are unaffected". True for every legacy row any code in `src/` can
produce, and false for a **hand-edited** one whose token disagrees with its
display text. Five inherited tests were built on exactly that row, and one
consequence is stronger than "no longer repaired":

- an **already-classified** row (`remembered`, or `legacy-auto` in a version-2
  file) keeps its stale token — no loss, the row was already unreachable in the
  database that exported it;
- an **unclassified** legacy row is still judged by the outcome gate on that
  token, so a stale one names nothing, has zero concrete outcomes, and is
  **purged** rather than repaired.

So a hand-edited version-1 file can lose an auto-generated alias it used to
keep. I judged that acceptable and shipped it, rather than widening the change:
a user **correction** is never affected (`remembered` rows short-circuit the
rules under both scopes), the row is an auto-classified resolution shortcut that
was already dead, the standards sanction dropping a dead alias, and only
hand-editing can produce the row at all. It is pinned by name in two tests
(`purges an unclassified legacy row whose stored token names no exercise`,
`purges an unclassified legacy alias whose stale token names no exercise`) and
stated in the `aliasLookupToken` comment, so it is a decision on the record
rather than a silent one.

I considered closing it by feeding the outcome gate the display-derived token
while the key keeps the stored one — the same decoupling, one line further down.
It works and deletes nothing. I did **not** do it: the spec's wording for that
gate is "whose *token* still has one unique concrete outcome", and quietly
changing a purge rule that nobody asked me to touch is how this plan has been
burned before. **Flagging it as a controller decision**, not implementing it.

### Five inherited tests changed — declared, not slipped in

The standards say to stop and report when existing tests must change. These are
the ones, all pinning "recompute from the display text, never trust the stored
token", which is precisely the rule the ruling inverts. None was weakened; each
now pins the new rule in the same place, and two gained a sibling so the cost
above is pinned rather than deleted.

| File | Was | Now |
|---|---|---|
| `v10Identity.test.ts` | `prefers the display text over a stale stored token` | `keeps a readable stored token that disagrees with the display text` **+** `purges an unclassified legacy row whose stored token names no exercise` |
| `backup.test.ts` | `recomputes normalizedAlias from the alias text` | `keeps the token the file gave an already-classified alias` **+** `purges an unclassified legacy alias whose stale token names no exercise` |
| `backup.test.ts` | `keeps one row when two aliases recompute to the same token` | renamed `…normalize to the same token`; assertions unchanged and still green |
| `appDb.test.ts` | `makes a restored alias findable even when the file's own token was stale` | `purges a legacy alias whose stale token names no exercise` |
| `appDb.test.ts` | `still recomputes a stale token on an already-classified alias` | `keeps an already-classified alias on the token the file gave it` |
| `aliasRepo.test.ts` | `putRaw recomputes normalizedAlias instead of trusting the stored token` | `putRaw keeps the token the row was written under, normalized` **+** new `putRaw keeps a phrase-stripped token rather than re-deriving it from the display text` |

`appDb.test.ts` is not literally named in my lane. It is a storage test that my
change breaks, no other agent holds storage, and leaving it red was not an
option; flagging it for completeness.

### Healthy-data behaviour: legacy retention decisions are unchanged

Not argued — measured, against a clean control worktree rather than a stash.

A probe built **24,412 legacy-shaped rows** (`normalizedAlias ===
normalizeExerciseName(alias)`, which is what every writer in `src/` produced
before the re-keying ruling): every catalogue name and every catalogue alias,
each with five prefixes (`""`, `"3 second paused "`, `"competition "`,
`"pain free "`, `"Squat or "`), plus a custom exercise so the one-unique-outcome
retention path is exercised. It ran `classifyAliases` under both scopes and
digested the full result.

```
rows: 24412
all: retained 3749
all: digest e56fb04582923af9057e0a68b2c9a1619678ea25adda87a05affc7ee5a15964c
unclassified: retained 3749
unclassified: digest e56fb04582923af9057e0a68b2c9a1619678ea25adda87a05affc7ee5a15964c
```

The same probe was run in a throwaway detached worktree at **`1fe3b0d`** — the
tree before my fix — and `diff` of the two outputs is empty:

```
--- BEFORE (1fe3b0d, pre-fix) vs AFTER (working tree) ---
IDENTICAL: legacy retention decisions unchanged
```

Byte-identical retained set, both scopes. The `or`-retention trap is closed by
measurement, not by reading.

### The two-generation case, verified explicitly

Pinned twice: once on the pure classifier
(`keeps both generations of key when one display name carries a legacy row and a
new one`) and once end to end over a real fake-indexeddb database
(`appDb.test.ts` → `keeps both generations of key for one display name, and the
correction still resolves`). The database version matters, because it is the one
that exercises `by-normalized-alias`. Both rows come back with their own tokens,
and `aliasRepo.find("3 second paused Hatfield Squat")` — the lookup the app
actually performs — returns the corrected row.

### Can a write now be REJECTED?

Asked directly, because this change alters which token rows land on.

Preferring the stored token lets two rows with **different display texts** claim
**one** key, where re-deriving gave them two — a new collision path. It cannot
reach the object store: `classifyAliases` dedupes on the final token before
anything is written, and that is now pinned by
`collapses two rows that claim one stored token, rather than issuing a colliding
write`, killed by M-D. The end-to-end two-generation test above commits a real
transaction through the real unique index and does not throw. `putRaw` does not
dedupe — it puts one row — but it has no production callers, and the doc comment
now says so instead of implying the classifier's guarantee covers it.

Standing invariants re-checked at my HEAD: `by-normalized-alias` is still the
only unique index, and `grep -rn "\.add(" src/` finds no `IDBObjectStore.add()`.
No schema change, no new index, no migration.

---

## 2. NEW-B — the fixed-point property, pinned

`shippedDisambiguations.test.ts` gains five assertions over the **real** shipped
artifact, checking both halves for every input: the prepared output is already
normalized, and preparing it a second time returns it unchanged.

| Test | Corpus |
|---|---|
| over every catalogue name and alias | 3,175 names + aliases |
| over every shipped rule token | all 20 |
| over every rule token applied to every catalogue name | 20 × 3,175 |
| over every phrase token embedded in and appended to every catalogue name | 10 phrase tokens × 3,175 names × 2 positions |
| over punctuation-heavy variants of the rule tokens | deterministic, not random |

The **embedded** corpus is the load-bearing one and I only found that out by
mutation. Rules run once, longest phrase first, so the only way to break
fixed-pointness is a strip that **joins** the text either side of it and hands a
second pass a longer phrase the first could not match. A prefix-only corpus
cannot produce that shape: my first attempt at a killing mutation survived
32/32 because every generated input had the token at the front. That is written
into the test's comment so nobody trims it.

Adds ~1.7s to the suite.

---

## 3. Mutation evidence — every count beside its exact mutation

Scope **S** = `src/lib/storage` + `src/lib/backup`. Baseline **14 suites / 266
passed** at the time of measurement (268 once the last two tests landed; the
count is stated per row). Scope **C** = `src/lib/catalog/shippedDisambiguations.test.ts`,
baseline **33 passed**. Every mutation applied to the shipped file, run,
restored from a task-uniquely-named scratchpad copy, `shasum`-verified **and**
`git diff --quiet`-verified against HEAD.

| # | Exact mutation | Scope | Result |
|---|---|---|---|
| **M-A** | `v10Identity.ts` `aliasLookupToken`: swap the two blocks back so the display text is tried first — the shipped defect restored verbatim | S (268) | **11 failed / 257** — `keeps a remembered correction on the phrase-stripped token the resolver reads`, `keeps both generations of key when one display name carries a legacy row and a new one`, `collapses two rows that claim one stored token…`, `keeps a readable stored token that disagrees with the display text`, `purges an unclassified legacy row whose stored token names no exercise`, `keeps both generations of key for one display name, and the correction still resolves`, `keeps an already-classified alias on the token the file gave it`, `purges a legacy alias whose stale token names no exercise`, `keeps the token the file gave an already-classified alias`, `purges an unclassified legacy alias whose stale token names no exercise`, `putRaw keeps a phrase-stripped token rather than re-deriving it from the display text` |
| **M-B** | `v10Identity.ts` `aliasRuleText` body → `return token;` (the naive fix: rule text recoupled to the key) | S (266) | **1 failed / 265** — `runs the disambiguation rules over the display text even when the token is already stripped`. **First measurement of this mutation was 266/266 — see below.** |
| **M-C** | `v10Identity.ts` `aliasLookupToken`: drop the `normalizeExerciseName` pass, `? alias.normalizedAlias : ""` | S (266) | **18 failed / 248** — the whole collision/dedupe family plus `normalizes a stored token that was never normalized`, `keeps one row when two aliases normalize to the same token`, `putRaw keeps the token the row was written under, normalized` |
| **M-D** | `v10Identity.ts` `claim`: `token = document.id;` inserted, so `classifyAliases` dedupes per row instead of per token | S (267) | **11 failed / 256** — including `collapses two rows that claim one stored token, rather than issuing a colliding write` |
| **M-N1** | `importDisambiguations.generated.json` gains `{kind: "non-identity-phrase", normalizedPhrase: "high bar back squat", behavior: "strip"}` — a curation record whose phrase only appears once another rule has stripped what sat in the middle | C | **2 failed / 31** — `over every phrase token embedded in and appended to every catalogue name`, and the pre-existing `exact concrete names bypass the underspecified choice` |
| **M-N2** | `identity.ts:112` `normalizedName: normalizeExerciseName(normalizedName)` → `normalizedName` (drop the final normalize pass over the prepared output) | C | **10 failed / 23** — kills 4 of the 5 new tests: catalogue, composites, embedded, decorated |
| **M-N3** | `importDisambiguations.generated.json` gains an underspecified rule whose own `normalizedName` contains a strippable phrase (`"high bar competition back squat"`) **plus** a strip rule matching what remains | C | **6 failed / 27** — kills `over every shipped rule token`, composites, embedded, decorated |

Every one of the five fixed-point tests is killed by at least one named
mutation; `over every shipped rule token` is killed only by M-N3, which is why
M-N3 exists.

### The test that was green for the wrong reason

Worth recording, because it is the eleven-times pattern and reasoning did not
catch it. My first `or`-retention guard used an alias whose stored token was
`"hatfield squat lunge"` with `canonicalExerciseId: "goblet-squat"`. It passed.
Under **M-B** it **also** passed — **266/266, zero failures**. The row was being
dropped by the *outcome gate* further down (a token naming no exercise has zero
concrete outcomes), so the alternative check never decided anything and the test
could not tell the fix from the trap.

Fixed by giving the token exactly one real outcome — a custom exercise named
`Hatfield Squat Lunge` — so the outcome gate would **keep** the row and the only
thing that can drop it is the rules reading the display text. A canary asserts
that premise inside the test (same row with a plain display name → retained,
length 1). Re-measured: M-B → **1 failed / 265**, exactly the intended test. The
negative result and its cause are written into the test's comment.

---

## 4. Self-review of the full diff

Read with fresh eyes before the final commit. Three findings, all fixed:

1. **A false claim in a comment I had just written.** `aliasLookupToken` said
   the normalize pass "keeps two rows differing only in whitespace from
   restoring as two rows fighting over one unique-index key". Backwards — two
   different tokens are two different keys and do not fight; the normalize pass
   is what *creates* the shared key, which the dedupe then resolves. Its real
   value is reachability: every lookup goes through `prepareImportName`, whose
   output is always normalized, so a token carrying stray case could never be
   matched. Rewritten (`ce885bd`). Writing the exact defect class I was sent to
   remove, in the same comment that removes it, is not a comfortable finding.
2. **An over-broad guarantee.** The same comment said "the write set stays legal
   because `classifyAliases` dedupes", in a doc shared with `putRaw`, which does
   not dedupe. Narrowed, and `putRaw`'s single-row nature and lack of production
   callers stated.
3. **A comment made false by my change, one file outside my lane.**
   `ExerciseCorrectionSheet.test.tsx:557` said `putRaw` "derives the token from
   the display text". The fixture is unaffected — it supplies the unstripped
   token explicitly and asserts it — but the sentence was now wrong. Corrected
   in place. That file is Task 10's closed lane, not import or workout, and it
   was clean in `git status`; comment-only, no assertion touched.

I also re-read the `rememberedAliasToken` comment I was asked to correct and
made it state the property that is true after the fix — both generations survive
a restore on their own key, neither is re-keyed into the other — rather than
deleting it and leaving the reader nothing.

---

## 5. Gates — real output

Final tree, all green.

```
$ bun run test -- --runInBand
Test Suites: 103 passed, 103 total
Tests:       1552 passed, 1552 total
Snapshots:   0 total
Time:        23.272 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(no output)

$ bun run lint
$ eslint .
(no output)

$ bun run build
✓ built in 1.76s
(large-chunk advisory only — known-acceptable)

$ git diff --check
(no output)

$ bun run test:e2e
not run — controller instruction
```

Baseline was 103 / 1,493. I added 18 tests net (4 catalogue fixed-point +
1 embedded, 6 in `v10Identity.test.ts`, 2 in `aliasRepo.test.ts`, 1 in
`appDb.test.ts`, 1 in `backup.test.ts`, plus splits of the re-pinned ones); the
rest of the delta is the two sibling lanes.

### Foreign failures, attributed rather than assumed

Mid-task a full run showed **2 failed / 1,545**:

```
FAIL src/components/workout/WorkoutDayClient.integration.test.tsx
  ● tells the user and refuses input when the day's sessions cannot be loaded at all
FAIL src/components/workout/HistoryClient.aggregateLogs.test.ts
  ● shows a placeholder rather than a blank cell when the date is unreadable
```

Both in `src/components/workout/**`, a lane I am forbidden to touch.
`git status` showed the workout lane holding uncommitted edits to
`src/lib/workout/localDate.ts`, `historyUtils.ts` and `sessionState.ts`, which
those suites depend on. Control: a throwaway detached worktree at **`6ece7ee`**
— my commit, none of the siblings' uncommitted work — ran both suites at
**2 suites / 21 passed**. Foreign, confirmed by a clean control rather than by a
path-scoped stash. They have since been fixed in the workout lane (`03eafa5`,
`5bd8e09`) and the final run is fully green.

### Flakes — pre-existing, and worse without my change

`--runInBand` is green three times consecutively (1,556 / 1,556 each). Under the
standards' `--maxWorkers=24` load technique the UI suites flake:

```
run 1: 4 failed / 1552  (LibraryClient, ExerciseCorrectionSheet, WorkoutDayClient.integration)
run 2: 1 failed / 1555  (LibraryClient)
run 3: 1556 passed
```

The failure is the documented RTL timeout shape, e.g.
`expect(element).not.toBeDisabled()` on `Finish workout`. Control at **`1fe3b0d`**
— before any of my work — in a throwaway detached worktree, same technique:

```
run 1: 16 failed / 1488  (9 suites, including the compiler and two import suites)
run 2: 1504 passed
run 3:  4 failed / 1500
```

So the class pre-exists my change and is measurably **worse** without it. I
raised no timeout anywhere. Not cleared — disclosed.

---

## 6. Deferred, with reasoning

- **NEW-D** (an override left by an older build is keyed on the unstripped token
  and is never cleaned up). Same "two generations of key" family, and the
  reviewer suggested folding it in here. I did not: it is a change to the
  correction sheet's write path (`src/components/catalog/**`), it deletes a
  stored record rather than choosing a key for one, and it wants its own RED
  test and its own ruling on whether cleanup should be unconditional. Bundling a
  delete into a fix-the-key round is how a small change becomes a wide one.
- **NEW-E** (`rememberedAliasToken`'s unused `disambiguations` parameter).
  Trivial, in my lane, and I still left it: it is Task 10's Minor, dropping it
  touches a signature `resolution.ts` may be about to use, and it is unrelated
  to the Critical. One line whenever the controller wants it.
- **The outcome gate's input** — feeding it the display-derived token so a
  hand-edited stale token is purged no longer, described in §1. A behaviour
  change to a purge rule nobody asked me to touch; controller's call.
- **A migration for pre-existing dead rows** (a user who mapped an annotated
  name under an older build still has an unreachable row, and nothing tells
  them). Explicitly declined by the standing ruling; unchanged by this round in
  either direction.

---

## What a reviewer should scrutinise most

1. **The purge-instead-of-repair consequence** (§1). It is the only place my
   change can *remove* a row that the old code kept. I argue it is bounded to
   hand-edited version-1 files and to auto-classified rows only — never a user
   correction — but it is a deletion, and deletion deserves a second opinion.
2. **The five re-pinned tests.** Read them as a set and check none of them got
   quietly weaker rather than merely inverted.
3. **The `or`-retention guard's fixture.** It was green for the wrong reason
   once already. Check the canary really establishes that the outcome gate would
   have kept the row.
4. **My claim that legacy retention is unchanged.** The evidence is a digest
   diff against a control worktree at `1fe3b0d`; re-run it if you want it
   independently.
5. **Whether trusting the stored token can be rejected by the unique index** on
   any path I have not thought of. I checked `classifyAliases` (dedupes) and
   `putRaw` (single row, no production callers).

---

## Status

**DONE_WITH_CONCERNS**

Commits: `6ece7ee`, `37e661e`, `ce885bd`, `1f4d45f`.
Gates: test 103/1,552 green · typecheck clean · lint clean · build clean ·
`git diff --check` clean · **e2e not run — controller instruction**.

The concern is the single item in §1: a hand-edited version-1 backup can now
lose an auto-classified alias that the old code repaired. It is pinned by name
in two tests and stated in the shipped comment rather than hidden, and the
one-line change that would close it is described — but it alters a purge rule
outside what I was asked to change, so it is yours to take or leave.
