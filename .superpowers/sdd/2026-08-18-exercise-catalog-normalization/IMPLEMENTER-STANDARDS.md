# Implementer standards — exercise catalogue normalization plan

Every implementer on this plan follows these. Your task brief adds task-specific context on top; it does not replace this.

## Workspace

- Worktree: `/Users/djdjo/Documents/mine/trAIner/.worktrees/exercise-catalog-normalization`, branch `feat/exercise-catalog-normalization`. Work nowhere else.
- Binding spec (highest authority): `docs/superpowers/specs/2026-08-18-exercise-catalog-normalization-design.md`.
- Plan: `docs/superpowers/plans/2026-08-18-exercise-catalog-normalization.md`.
- Ledger of accumulated rulings: `.superpowers/sdd/2026-08-18-exercise-catalog-normalization/progress.md`. **Skim it before starting** so you don't relitigate a settled decision. Do not edit it — the controller owns it.
- Your task's verbatim plan text: `task-N-plan.md` in the SDD directory. Read it in full.

## Method — non-negotiable

**Strict TDD.** Failing test first. Confirm RED for the *right reason* and paste the actual error, not "it failed".

**Mutation-verify every new test.** Break the behaviour the test covers, confirm that specific test fails, restore the file byte-for-byte, and report the numbers in your report.

This is not ceremony. On this plan, tests that looked like they verified something and did not have been found **five separate times**:

1. A "second migration pass is a no-op" test that never re-ran the migration.
2. Four `dispatch: false` suppression tests where the suppressed write happened before the listener was attached — with the behaviour deliberately broken, the old tests reported `34 passed, 34 total`.
3. Five `isRecord` guards where mutating each to `true` left 316/316 green.
4. A precedence test that passed only because one row happened to sort first in `getAll` key order.
5. Twenty pass-through tests where 18 stayed green under a silent early-bail mutation, because an un-migrated record equals the seeded record.

Recurring shapes to watch for:
- A test that would be green with the rule under test **deleted**.
- A test that passes because a **stronger earlier guard** already rejects the input, so the rule you think you're testing never runs.
- A test that depends on **incidental ordering** it doesn't control.
- An assertion that **cannot distinguish** the success case from the bail-early case (add a completion canary).
- A probe placed **downstream of the failure it claims to detect** (one implementer patched the write for `logs`, which happens *after* `programs`, so the test held whether or not the fix worked).
- A test whose fixture makes two independently-computed numbers **coincidentally agree**, hiding a bug in one of them.
- UI: asserting a spinner rather than the effect; "reloads once" tests that can't tell one reload from three.

## Two rules about mutation numbers

**Always state the exact mutation next to the count.** A count alone is meaningless. On this plan one guard was reported as caught by 1, 5, and 29 tests — all three were correct, because each was a different mutation (corrupt the value with the key set held constant; set the value to `undefined`, which the fake IndexedDB drops so it reads as a key removal; add the key to fixtures lacking it). Three numbers, three mutations, no contradiction. Without the mutation named, two of those readings look like errors.

**"No mutation kills this" does not automatically mean "delete it."** Distinguish two cases:
- **Unfalsifiable by construction** — no input in any engine could make the guard fire, because something upstream already guarantees the condition. That is dead code; delete it. (Example: a `hasIds` check on a field the code overwrites unconditionally a few lines later.)
- **Unfalsifiable in this harness** — the guard protects behaviour the test environment cannot reproduce, such as an ordering the IndexedDB spec does not pin but a real browser may exhibit. Keeping it is legitimate **only if you measure the negative result and write it in the comment**, so the next reader doesn't delete it citing a green mutation.

If you keep something no mutation can kill, say so explicitly and say why. Claiming coverage you don't have is the failure; publishing the gap is the fix.

**Do not modify existing tests to make new code pass.** If you believe you must, stop and report it — that means semantics moved, and the controller decides.

**Healthy-data behaviour must not change** unless your task explicitly owns that change.

## Data safety

This is a local-first app. IndexedDB holds the user's **only** copy of their data. Permanent loss of access is the worst possible outcome — worse than a visible failure.

Principles established by earlier rulings on this plan:
- A record we cannot read is a record we must not rewrite — pass it through untouched, key set included.
- Unreadable content is never grounds for deletion. (Exception: unreadable *aliases* are dropped, because an alias is only a resolution shortcut and an unreadable one would occupy its token forever.)
- Check whether a write can be **rejected**, not only whether a read can **throw**. A unique-index `ConstraintError` bricked the database permanently and was missed by five rounds of read-hardening.
- There is no `IDBObjectStore.add()` anywhere in `src/` — every write is `put`. Do not introduce one. `by-normalized-alias` is the schema's only unique index; a new unique index reopens the rejected-write class.

## Flaky tests

RTL timeout flakes in this repo reproduce under concurrent load: `--maxWorkers=24`. Reproduce that way; prove a fix with `asyncUtilTimeout: 1`. **Never** paper over a flake by raising a timeout.

## UI work

`PRODUCT.md` (register: product; platform: web) and `DESIGN.md` govern. Principles: the data is the interface; quiet by default; instrument, not toy; local-first is the product; no friction between intent and logging.

**Density over inflation** — a standing preference from the repo owner, who rejected a previous polish pass for being too chunky. Prefer **list rows, not cards**. Use **pseudo-element hit areas** for comfortable touch targets without inflating visual size. Do not pad your way to clarity.

## Hard constraints

- Must work as a static, serverless GitHub Pages deployment. No server APIs.
- No AI attribution trailers in commit messages.
- Prefer smaller, atomic commits.
- **Commit as you go, not once at the end.** Land each coherent piece as soon as its gates pass. This is not a style note: on this plan an agent was stopped mid-flight and lost every uncommitted file it had written, including five new modules, and the task had to be redone from scratch. A sibling task that had already committed five times survived the same interruption completely intact.
- **Stage by explicit path** — `git add <paths>`. Never `git add -A`, `git add .`, or `git commit -a`. Other agents work in this same worktree, and a wildcard stage sweeps their half-finished work into your commit.
- Stage your report with `git add -f` if gitignore requires it, matching how Tasks 1-7 did.

## Gates before you commit

Run each; paste **real output** into your report:

```
bun run test -- --runInBand
bun run typecheck
bun run lint
bun run build
git diff --check
```

**Plus the e2e suite** (find the script in `package.json`). This was added mid-plan for a reason: the curation commit silently broke `e2e/helpers.ts` — bare `Squat` became underspecified, which blocked demo seeding and nine specs — and it went unnoticed through an implementer, an independent reviewer, and the controller, because every one of them ran a fully green unit suite over a broken e2e suite. If e2e is slow, run it once before you commit rather than never. If you cannot run it, say so explicitly in your report instead of omitting it.

Known-acceptable console noise: React Router future warnings, intentional error-path logs, Vite's large-chunk advisory.

## Deliverables

1. Self-review your full diff (tracked **and** untracked) with fresh eyes before committing. Fix what you find.
2. Write `task-N-report.md` in the SDD directory, following the shape of `task-6-report.md`: per-step detail, RED evidence, mutation evidence with numbers, real gate output, self-review findings, and anything you deliberately deferred with reasoning.
3. Commit.

## Escalation

If a decision isn't settled by the spec, plan, and brief, **do not guess** — stop and report `NEEDS_CONTEXT` with the specific question and the options you see. A question costs minutes; a wrong guess has cost this plan whole rounds.

If you think your brief, the plan, or a reviewer finding is **wrong**, push back with file:line evidence rather than implementing something you believe is a mistake. Implementers on this plan have overturned reviewer findings that way and were right to.

End your report with a status line — `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED` — then the commit SHA(s), gate results, and a concise list of what a reviewer should scrutinise most.
