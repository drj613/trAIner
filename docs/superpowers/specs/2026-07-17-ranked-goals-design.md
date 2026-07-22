# Ranked goals

Date: 2026-07-17
Status: approved

## Problem

`ProfileDocument.goals` (`src/lib/programs/types.ts:20`) is a flat `string[]` of freeform
chips ("get back to competing," "fix shoulder pain"). All goals are treated as equally
important — in the editor UI, in the read-only summary, and in the prompt sent to the LLM.
There's no way for a user to say "this one matters more than that one."

## Non-goal: `primaryGoal`

`ProfileDocument.primaryGoal` (`types.ts:21`, type `TrainingGoal`, a 5-value enum:
`general | hypertrophy | strength | endurance | other`) is a different mechanism and is
**not** touched by this change. It's the sole input to the goal-gate engine: it seeds
`ProgramDocument.goal` at import time (`src/lib/import/parser.ts:113`), which
`src/lib/analysis/analyze.ts:51-93` uses to select which dimensions get graded. It's
structural/gating, not descriptive. Conflating it with freeform `goals[]` ranking would
mean a rank-1 chip that isn't a valid `TrainingGoal` string has no sane mapping to the
gate — so it stays a separate control, untouched.

## Design

**Storage — no schema change.** `goals: string[]` order becomes the rank: index 0 is
highest priority. No new field, no `ProfileDocument` shape change, no IDB version bump
(`DB_VERSION` stays 9 in `src/lib/storage/appDb.ts`), no migration needed. Existing
stored profiles are already valid — their current array order becomes their initial
rank as-is.

**Editor UI.** Add a new `RankedGoalsEditor` component in `ProfileClient.tsx`, used only
for the `goals` field. It is *not* a modification of the existing `EditableChips`
component — `EditableChips` keeps rendering an unordered wrapped chip cloud for
`equipment`, `injuries`, `history`, `schedule`, and `preferences`, none of which are
ranked by this change.

`RankedGoalsEditor` renders goals as a numbered vertical list (`1.`, `2.`, `3.`, …), each
row with a drag handle, using `@dnd-kit/core` + `@dnd-kit/sortable` (+
`@dnd-kit/utilities` for the transform helpers) for reordering. Existing text-input
add/remove-by-click affordances from `EditableChips` are preserved in the new component;
dragging only reorders, it doesn't change add/remove behavior.

New dependency: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. None of these
are currently in `package.json`. Chosen over hand-rolled pointer-event DnD or up/down
buttons per explicit user preference for a maintained library over reinventing reorder
logic.

**Read-only summary view.** `ProfileClient.tsx:~576-577` currently renders
`★ ${GOAL_LABELS[primaryGoal]}` followed by an unordered join of `profile.goals` as chips.
Change the `goals` portion to a numbered ordered list reflecting stored rank. The
`primaryGoal` star badge is unaffected and continues to render separately, ahead of the
ranked list.

**Prompt builder.** `src/lib/prompts/profileFields.ts:46-52` currently renders:

```
Goals: a, b, c
```

Change to a ranked, numbered block so the LLM sees priority order rather than a flat
comma list:

```
Goals (priority order):
1. a
2. b
3. c
```

`hasData` (`p.goals.length > 0`) is unchanged. This is the only place ranking reaches the
LLM — no other prompt-construction path reads `goals` (confirmed via grep across
`src/lib/prompts` and `src/components/prompts`).

## Testing

- `src/components/profile/ProfileClient.test.tsx`: cover drag-reorder writing the new
  array order back to the draft/profile, and that the read-only view renders goals in
  rank order.
- `src/lib/prompts/profileFields.test.ts`: update the `goals` render-format expectation
  to the new numbered block.

## Out of scope

- Any change to `primaryGoal`, `TrainingGoal`, or the goal-gate engine
  (`src/lib/analysis/*`).
- Ranking for `equipment`, `injuries`, `history`, `schedule`, or `preferences` —
  `EditableChips` is unchanged for these fields.
- Any IndexedDB schema/version change.
