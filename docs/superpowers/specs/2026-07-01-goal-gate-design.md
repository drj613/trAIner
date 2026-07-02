# Goal-Gate for Routine Analysis — Design

Date: 2026-07-01
Status: implemented (see docs/superpowers/plans/2026-07-01-goal-gate.md)
Depends on: `fix/analysis-residual-findings` branch (residual fixes, esp. Task 2 set-weighted
heaviness and Task 4 `sheetPrompt.ts`) — implement this feature after that branch merges.

## Problem

The deterministic analysis engine (`src/lib/analysis/`) is calibrated for general/hypertrophy
training but grades every program A–F regardless of intent. A well-built strength or peaking
block scores C/D for reasons that are features of that programming. The static footnote
("Calibrated for general & hypertrophy training") doesn't prevent the misread — the grade lands
before the footnote is read. Full per-goal landmark tables were considered and rejected: they
multiply the least evidence-defensible artifact (the volume table) by N goals.

**This design: the goal is a gating input, not a prescription input.** It selects which of the
engine's existing rulers apply. It never re-scores, re-calibrates, or adds per-goal landmarks.

## Decisions (made with DJ, 2026-07-01)

1. **Goal lives per-program, defaulted from profile.** A peaking block and a hypertrophy block
   coexist; the program being analyzed carries its own goal.
2. **Partial grade, not abstention.** When dimensions are gated out, the overall grade is
   recomputed from the applicable dimensions with renormalized weights and labeled "partial".
   (Chosen over full grade-withholding; accepted trade-off: balance ratios are themselves
   hypertrophy-flavored, so a partial number still overstates slightly.)
3. **Five goal options:** `general`, `hypertrophy`, `strength`, `endurance`, `other`.
   General and hypertrophy share the full-scoring profile (two labels, same gate — reads better
   in UI and LLM prompts). Granularity beyond this (which body part, PL vs OL) is prescription
   nuance and belongs to the LLM tier via the existing free-text goals.

## Data model

```ts
// src/lib/programs/types.ts
export const TRAINING_GOALS = ["general", "hypertrophy", "strength", "endurance", "other"] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

// ProgramDocument gains:  goal?: TrainingGoal;
// ProfileDocument gains:  primaryGoal?: TrainingGoal;
```

Both fields optional. `undefined` ⇒ treated as `"general"` ⇒ exactly current behavior.
**No migration.** Existing free-text `profile.goals: string[]` chips are untouched and continue
to feed LLM prompts only (per the anti-anchoring rule: free text is non-structural data).

## Gate profiles

One table in `src/lib/analysis/thresholds.ts`, beside the other tables:

```ts
// src/lib/analysis/types.ts
export type DimensionKey = "volume" | "session" | "balance" | "periodization";

// src/lib/analysis/thresholds.ts
export const GOAL_GATE_PROFILES: Record<TrainingGoal, ReadonlyArray<DimensionKey>> = {
  general:     ["volume", "session", "balance", "periodization"],
  hypertrophy: ["volume", "session", "balance", "periodization"],
  strength:    ["session", "balance"],
  endurance:   ["session"],
  other:       ["session", "balance"],
};
```

| Goal | Graded | Informational only |
|---|---|---|
| general, hypertrophy | volume, session, balance, periodization | — (current behavior) |
| strength (PL/OL/low-rep barbell) | session, balance | volume, periodization |
| endurance/conditioning | session | volume, balance, periodization |
| other/mixed | session, balance | volume, periodization |

Semantics of "informational only":
- Dimension score still computed and displayed (bars, ratios, trajectory data all render).
- Excluded from the overall score.
- Its warnings are dropped from the findings list and from every score.
- Display marks it visually as reference-only (dimmed chip + "info" tag).

Overall score = Σ(score×weight)/Σ(weight) over graded dimensions only (weights from
`DIMENSION_WEIGHTS`, renormalized). Grade letter mapping unchanged.

## Engine API

`analyzeProgram(program)` signature unchanged; reads `program.goal ?? "general"` internally.
Gate logic lives in `score.ts` (renormalized overall) + the gate table in `thresholds.ts`.

`AnalysisResult` gains:

```ts
goalScope: {
  goal: TrainingGoal;             // resolved (default applied)
  partial: boolean;               // any dimension gated out?
  gradedDimensions: DimensionKey[];
}
```

`toDisplayAnalysis` threads it to `DisplayAnalysis.goalScope` (same shape) for the card.

## Mismatch nudge (info severity, never scored)

Reuses the set-weighted heaviness from the residual-fixes Task 2:
- goal ∈ {general, hypertrophy} AND ≥50% of typical-week sets are heavy →
  "This reads like a strength block — consider setting the goal to Strength for a fairer read."
- goal = strength AND zero heavy sets across all weeks →
  "Goal is Strength but no heavy (≥85% / ≤3RM / RPE≥9) work found — is the goal right?"

Implementation: expose the heaviness helper from `periodization.ts` (export `weekIsHeavy` or a
new `heavySetShare(days)`), call from `analyze.ts`, append a `severity: "info"`-style finding.
(Note: `Warning.severity` is currently `green|yellow|red`; the nudge uses the display-level
`FindingDisplay.severity: "info"` channel — plumb as a distinct `notes` array on
`AnalysisResult` rather than widening `Severity`.)

## UI

1. **Analysis card** (`RoutineAnalysisCard.tsx`): small goal `<select>` in the card header;
   changing it persists `program.goal` via `programRepo` and re-runs analysis. Badge shows
   "B · partial" when `goalScope.partial`. Footnote becomes goal-aware, e.g. for strength:
   "Graded on structure + balance for a strength goal; volume & periodization shown for
   reference — strength standards differ." For general/hypertrophy the current footnote stays.
2. **Profile page** (`ProfileClient.tsx`): `primaryGoal` dropdown inside the existing goals
   section, above the free-text chips.
3. **Program creation/import** (`RoutineBuilderClient.tsx`, import flow): new programs get
   `goal: profile.primaryGoal` when set.

## LLM tier

`sheetPrompt.ts` (created by residual-fixes Task 4): replace the "if the routine clearly
targets another goal…" guess with an explicit line — "The user's goal for this routine is
**<goal>**. Judge it by that goal's standards." Free-text goals chips continue flowing to the
generation prompt unchanged.

The prompt must carry the same goal-scope signal as the card: reference-only dimensions are
tagged in the computed-scores list, and any engine mismatch notes are surfaced in an
"Engine notes" section so the LLM can question a wrong goal rather than anchor on it.

## Testing

- Gate math: each goal → expected graded set + renormalized overall (hand-computed cases).
- `undefined` goal ⇒ output identical to today (regression pin on existing fixtures).
- `startingStrengthProgram` fixture with `goal: "strength"` ⇒ volume/periodization warnings
  absent from findings, overall computed from session+balance only, `partial: true`.
- Mismatch nudge both directions + not firing when goal matches.
- `toDisplayAnalysis` goalScope threading + partial badge label.
- Card-level: goal select persists and re-renders (component or e2e level, match repo pattern).

## Out of scope

- Per-goal volume landmarks / landmark recalibration (separate, deliberate effort — the
  generation prompt shares the table, recalibrate once for both).
- Evidence-based reweighting of `DIMENSION_WEIGHTS` (session up, balance down) — separate call.
- Frequency dimension, training-age multipliers, style-fingerprint scoring — stay deferred.
- Goal inference from program content as the *primary* signal (nudge only, never auto-set).
