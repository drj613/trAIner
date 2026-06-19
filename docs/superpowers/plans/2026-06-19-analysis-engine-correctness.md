# Analysis Engine — Correctness, Honesty & Intensity Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed correctness/honesty defects in the deterministic routine-analysis engine and lay the intensity-parsing foundation, without yet building the full goal-aware rebuild.

**Architecture:** The engine (`src/lib/analysis/`) scores set counts against hypertrophy landmarks and emits an A–F grade. This plan (1) makes the grade's scope honest in the UI, (2) fixes a data-ordering bug + adds an invariant guard, (3) makes untrained muscles a single neutral state, (4) de-inflates volume by using the typical (median) week instead of the peak week, (5) adds a fuzzy `parseLoad` utility, (6) makes periodization intensity-aware so peak weeks aren't called "deloads" and rising-intensity blocks aren't called "static," (7) drops the disproportionate single-week penalty, (8) makes movement-pattern coverage neutral (the decided-but-unshipped change), and (9) deletes confirmed dead code.

**Tech Stack:** TypeScript, React 19, jest + ts-jest (`bun run test`), Vite. Path alias `@/` → `src/`.

**Source of truth for *why* each change:** `.reviews/2026-06-19/00-analysis-framework-evidence-audit.md`.

**Out of scope (needs its own brainstorm + plan — see end):** goal-conditional volume landmarks, training-style fingerprint/detection, the frequency dimension, goal-gated session/balance thresholds, broad landmark recalibration, and reconciling the duplicate LLM prompt builders.

**Run a single test file:** `bun run test <path>` (e.g. `bun run test src/lib/analysis/parseLoad.test.ts`).
**Run a single test by name:** `bun run test <path> -t "<name>"`.
**Typecheck:** `bunx tsc --noEmit`.

---

## Task 1: UI honesty — label the grade as general/hypertrophy-calibrated

The A–F grade is only valid for general/hypertrophy training; the UI currently presents it as universal. Add a always-visible caption.

**Files:**
- Modify: `src/components/analysis/RoutineAnalysisCard.tsx`
- Test: `src/components/analysis/RoutineAnalysisCard.test.tsx`

- [ ] **Step 1: Write the failing test** (append inside the existing top-level `describe` in `RoutineAnalysisCard.test.tsx`)

```tsx
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { balancedProgram } from "@/lib/analysis/fixtures";

it("states the grade is calibrated for general/hypertrophy training", () => {
  const analysis = toDisplayAnalysis(analyzeProgram(balancedProgram), 0);
  render(<RoutineAnalysisCard analysis={analysis} onOpenPrompt={() => {}} />);
  expect(
    screen.getByText(/calibrated for general .* hypertrophy training/i),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/analysis/RoutineAnalysisCard.test.tsx -t "calibrated for general"`
Expected: FAIL — "Unable to find an element with the text ...".

- [ ] **Step 3: Add the caption to the card**

In `RoutineAnalysisCard.tsx`, immediately after the closing `</button>` of the header (the line `<span style={{ color: "var(--fg-3)", flexShrink: 0, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>` is inside that button; insert after the whole header `</button>` and before the `{/* Chips row ... */}` comment):

```tsx
      <div style={{
        padding: "0 12px 8px", fontSize: 10, color: "var(--fg-3)", lineHeight: 1.4,
      }}>
        Calibrated for general &amp; hypertrophy training. Strength, powerlifting &amp; Olympic
        programs may score low by design — use the AI prompt for goal-aware review.
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/analysis/RoutineAnalysisCard.test.tsx -t "calibrated for general"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analysis/RoutineAnalysisCard.tsx src/components/analysis/RoutineAnalysisCard.test.tsx
git commit -m "feat(analysis-ui): label grade as general/hypertrophy-calibrated"
```

---

## Task 2: Fix the hamstrings landmark ordering bug + add a monotonicity invariant

`thresholds.ts:15` has hamstrings `mavLow:2 < mev:3`, violating `mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv`. Add a guard test that catches this for every muscle, then fix the value.

**Files:**
- Modify: `src/lib/analysis/thresholds.ts:15`
- Create: `src/lib/analysis/thresholds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { VOLUME_LANDMARKS } from "./thresholds";
import { ALL_MUSCLE_GROUPS } from "./types";

describe("VOLUME_LANDMARKS", () => {
  it("keeps landmarks monotonic (mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv) for every muscle", () => {
    for (const muscle of ALL_MUSCLE_GROUPS) {
      const lm = VOLUME_LANDMARKS[muscle];
      expect(lm.mv).toBeLessThanOrEqual(lm.mev);
      expect(lm.mev).toBeLessThanOrEqual(lm.mavLow);
      expect(lm.mavLow).toBeLessThanOrEqual(lm.mavHigh);
      expect(lm.mavHigh).toBeLessThanOrEqual(lm.mrv);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/analysis/thresholds.test.ts`
Expected: FAIL — at `hamstrings`, `expect(3).toBeLessThanOrEqual(2)`.

- [ ] **Step 3: Fix the hamstrings landmark**

In `thresholds.ts`, change the hamstrings row (line 15) so `mavLow` is consistent with the other lower-body muscles (quads/calves use `mavLow: 6`):

```ts
  hamstrings:  { mv: 1, mev: 3, mavLow: 6,  mavHigh: 8,  mrv: 14 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/analysis/thresholds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/thresholds.ts src/lib/analysis/thresholds.test.ts
git commit -m "fix(analysis): hamstrings mavLow ordering bug + landmark monotonicity guard"
```

> Note: broader landmark *recalibration* (raising too-low MEVs, lowering biceps MEV) is deliberately deferred to the goal-aware/calibration follow-up — it shifts everyone's scores and is a product decision.

---

## Task 3: Make untrained muscles a single neutral state

A 0-set muscle is currently shown three contradictory ways (red bar, red "Below maintenance" finding, neutral in Coverage), and `classifyVolume` even returns green for core/neck at 0 sets. Make "not trained" one neutral state, and stop emitting below-maintenance warnings for muscles the user deliberately skipped (the volume *score* already excludes them at `score.ts:22`).

**Files:**
- Modify: `src/lib/analysis/types.ts` (MuscleDisplay status union)
- Modify: `src/lib/analysis/toDisplayAnalysis.ts` (set "untrained")
- Modify: `src/lib/analysis/analyze.ts` (exclude untrained from warnings)
- Modify: `src/components/analysis/RoutineAnalysisCard.tsx` (neutral color)
- Test: `src/lib/analysis/toDisplayAnalysis.test.ts`, `src/lib/analysis/analyze.test.ts`

- [ ] **Step 1: Write the failing tests**

In `toDisplayAnalysis.test.ts` (append in the existing `describe`):

```ts
import { imbalancedProgram } from "./fixtures";
import { analyzeProgram } from "./analyze";

it("marks zero-set muscles as 'untrained' (not red)", () => {
  const d = toDisplayAnalysis(analyzeProgram(imbalancedProgram), 0);
  const quads = d.muscles.find((m) => m.group === "Quads");
  expect(quads?.sets).toBe(0);
  expect(quads?.status).toBe("untrained");
  expect(quads?.flag).toBeUndefined();
});
```

In `analyze.test.ts` (append in the existing `describe`):

```ts
import { imbalancedProgram } from "./fixtures";

it("does not emit below-maintenance warnings for untrained muscles", () => {
  const result = analyzeProgram(imbalancedProgram);
  const zeroSetWarnings = result.warnings.filter((w) => /0 sets\/week/.test(w.message));
  expect(zeroSetWarnings).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/analysis/toDisplayAnalysis.test.ts -t "untrained"`
Expected: FAIL — `status` is `"red"`, not `"untrained"`.
Run: `bun run test src/lib/analysis/analyze.test.ts -t "untrained muscles"`
Expected: FAIL — receives several `"... : 0 sets/week — Below maintenance"` warnings.

- [ ] **Step 3a: Widen the MuscleDisplay status union** (`types.ts`, the `MuscleDisplay` type)

```ts
export type MuscleDisplay = {
  group: string;
  sets: number;
  mev: number;
  mavLo: number;
  mavHi: number;
  mrv: number;
  status: "green" | "yellow" | "red" | "untrained";
  flag?: string;
};
```

- [ ] **Step 3b: Set "untrained" in the display adapter** (`toDisplayAnalysis.ts`, the `muscles` map ~lines 64-75)

```ts
  const muscles: MuscleDisplay[] = result.muscleVolumes.map((mv): MuscleDisplay => ({
    group: MUSCLE_LABEL[mv.muscle] ?? capitalize(mv.muscle.replace(/_/g, " ")),
    sets: mv.effectiveSets,
    mev: mv.landmarks.mev,
    mavLo: mv.landmarks.mavLow,
    mavHi: mv.landmarks.mavHigh,
    mrv: mv.landmarks.mrv,
    status: mv.effectiveSets === 0 ? "untrained" : mv.severity,
    flag: mv.effectiveSets === 0 ? undefined
        : mv.effectiveSets > mv.landmarks.mrv ? "above_mrv"
        : mv.effectiveSets < mv.landmarks.mev ? "below_mev"
        : undefined,
  }));
```

- [ ] **Step 3c: Exclude untrained muscles from warnings** (`analyze.ts`, the `warnings` array ~lines 46-55)

```ts
  const warnings = [
    ...muscleVolumes.filter((r) => r.severity !== "green" && r.effectiveSets > 0).map((r) => ({
      severity: r.severity,
      dimension: "volume" as const,
      message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
    })),
    ...sessions.flatMap((s) => s.warnings),
    ...balance.warnings,
    ...periodization.warnings,
  ];
```

- [ ] **Step 3d: Render the neutral color in the card** (`RoutineAnalysisCard.tsx`)

Extend the `AnyStatus` type and both color maps:

```tsx
type AnyStatus = "good" | "warn" | "bad" | "green" | "yellow" | "red" | "untrained";

const STATUS_FG: Record<AnyStatus, string> = {
  good:   "var(--good, #7fc77a)",
  green:  "var(--good, #7fc77a)",
  warn:   "var(--warn, #e6b664)",
  yellow: "var(--warn, #e6b664)",
  bad:    "var(--bad, #e07b6a)",
  red:    "var(--bad, #e07b6a)",
  untrained: "var(--fg-4)",
};

const STATUS_BG: Record<AnyStatus, string> = {
  good: "rgba(127,199,122,0.10)", green: "rgba(127,199,122,0.10)",
  warn: "rgba(230,182,100,0.10)", yellow: "rgba(230,182,100,0.10)",
  bad: "rgba(224,123,106,0.10)", red: "rgba(224,123,106,0.10)",
  untrained: "transparent",
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/analysis/toDisplayAnalysis.test.ts -t "untrained"` → PASS
Run: `bun run test src/lib/analysis/analyze.test.ts -t "untrained muscles"` → PASS
Run: `bunx tsc --noEmit` → no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/toDisplayAnalysis.ts src/lib/analysis/analyze.ts src/components/analysis/RoutineAnalysisCard.tsx src/lib/analysis/toDisplayAnalysis.test.ts src/lib/analysis/analyze.test.ts
git commit -m "fix(analysis): single neutral 'untrained' state for zero-set muscles"
```

---

## Task 4: Use the typical (median) week instead of the peak week

`analyze.ts:31` takes the per-muscle **max across weeks**, which reports a transient peak/overreach as chronic volume and biases every program toward the MRV ceiling. Use the median (typical) week instead. Single-week programs are unaffected.

**Files:**
- Modify: `src/lib/analysis/analyze.ts:17-31`
- Test: `src/lib/analysis/analyze.test.ts`

- [ ] **Step 1: Write the failing test** (append in `analyze.test.ts`)

```ts
import { multiWeekProgram } from "./fixtures";

it("uses the typical (median) week, not the peak, for weekly volume", () => {
  // multiWeekProgram bench (chest primary) sets per week: 3, 4, 5, 2 → median 3.5; max would be 5.
  const result = analyzeProgram(multiWeekProgram);
  const chest = result.muscleVolumes.find((m) => m.muscle === "chest");
  expect(chest?.effectiveSets).toBeCloseTo(3.5, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/analysis/analyze.test.ts -t "typical"`
Expected: FAIL — `effectiveSets` is `5` (the max).

- [ ] **Step 3: Replace `mergeMaxVolumes` with a median** (`analyze.ts`)

Replace the `mergeMaxVolumes` function (lines 17-25) with:

```ts
function typicalWeeklyVolumes(weekMaps: Map<MuscleGroup, number>[]): Map<MuscleGroup, number> {
  const muscles = new Set<MuscleGroup>();
  for (const map of weekMaps) for (const muscle of map.keys()) muscles.add(muscle);

  const result = new Map<MuscleGroup, number>();
  for (const muscle of muscles) {
    const values = weekMaps.map((map) => map.get(muscle) ?? 0).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    result.set(muscle, median);
  }
  return result;
}
```

Then update the call site (line 31):

```ts
  const weeklyVolume = typicalWeeklyVolumes(weekNums.map((w) => countWeeklyVolume(days, w)));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/analysis/analyze.test.ts` → PASS (all)
Expected: the new test passes; existing analyze tests still pass (single-week fixtures use one map, median == that value).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/analyze.ts src/lib/analysis/analyze.test.ts
git commit -m "fix(analysis): aggregate weekly volume by typical (median) week, not peak"
```

---

## Task 5: Add a fuzzy `parseLoad` utility

Foundation for intensity-aware analysis. Extracts `%1RM`, `RPE`, `RIR`, and rep-max from free-text LLM `load` strings; returns `{}` for anything unrecognized.

**Files:**
- Create: `src/lib/analysis/parseLoad.ts`
- Create: `src/lib/analysis/parseLoad.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { parseLoad } from "./parseLoad";

describe("parseLoad", () => {
  it("returns {} for missing/empty/unrecognized input", () => {
    expect(parseLoad(undefined)).toEqual({});
    expect(parseLoad("")).toEqual({});
    expect(parseLoad("bodyweight")).toEqual({});
    expect(parseLoad("BWx8")).toEqual({});
  });

  it("extracts percent of 1RM", () => {
    expect(parseLoad("75%")).toEqual({ pct1rm: 75 });
    expect(parseLoad("@ 92.5%")).toEqual({ pct1rm: 92 });
  });

  it("extracts RPE (including half steps)", () => {
    expect(parseLoad("RPE 8")).toEqual({ rpe: 8 });
    expect(parseLoad("rpe 9.5")).toEqual({ rpe: 9.5 });
  });

  it("extracts RIR", () => {
    expect(parseLoad("2 RIR")).toEqual({ rir: 2 });
    expect(parseLoad("RIR 1")).toEqual({ rir: 1 });
  });

  it("extracts rep-max", () => {
    expect(parseLoad("5RM")).toEqual({ repMax: 5 });
  });

  it("extracts multiple signals from one string", () => {
    expect(parseLoad("80% RPE 9")).toEqual({ pct1rm: 80, rpe: 9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/analysis/parseLoad.test.ts`
Expected: FAIL — "Cannot find module './parseLoad'".

- [ ] **Step 3: Implement `parseLoad`**

```ts
export type ParsedLoad = {
  pct1rm?: number;
  rpe?: number;
  rir?: number;
  repMax?: number;
};

/**
 * Fuzzy-parse a free-text load string (LLM output) into intensity signals.
 * Tolerant by design: unrecognized formats yield {} rather than throwing.
 */
export function parseLoad(raw: string | undefined): ParsedLoad {
  if (!raw) return {};
  const s = raw.toLowerCase();
  const out: ParsedLoad = {};

  const pct = s.match(/(\d{1,3})(?:\.\d+)?\s*%/);
  if (pct) {
    const n = parseInt(pct[1], 10);
    if (n > 0 && n <= 100) out.pct1rm = n;
  }

  const rpe = s.match(/rpe\s*(\d{1,2}(?:\.5)?)/);
  if (rpe) {
    const n = parseFloat(rpe[1]);
    if (n >= 1 && n <= 10) out.rpe = n;
  }

  const rir = s.match(/(\d{1,2})\s*rir|rir\s*(\d{1,2})/);
  if (rir) {
    const n = parseInt(rir[1] ?? rir[2], 10);
    if (n >= 0 && n <= 10) out.rir = n;
  }

  const rm = s.match(/(\d{1,2})\s*rm\b/);
  if (rm) {
    const n = parseInt(rm[1], 10);
    if (n >= 1 && n <= 20) out.repMax = n;
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/analysis/parseLoad.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/parseLoad.ts src/lib/analysis/parseLoad.test.ts
git commit -m "feat(analysis): add fuzzy parseLoad intensity-signal utility"
```

---

## Task 6: Make periodization intensity-aware (peak ≠ deload; rising intensity ≠ static)

Today a peak week (low volume, heavy singles) is labeled "deload detected," and a linear strength block (flat sets, rising load) is labeled "static / no progression." Use `parseLoad` + rep midpoints to distinguish these.

**Files:**
- Modify: `src/lib/analysis/types.ts` (PeriodizationResult)
- Modify: `src/lib/analysis/periodization.ts`
- Modify: `src/lib/analysis/score.ts:54-63`
- Test: `src/lib/analysis/periodization.test.ts`

- [ ] **Step 1: Write the failing tests** (append in `periodization.test.ts`)

```ts
import type { ProgramDay, ProgramDocument } from "@/lib/programs/types";

function squatWeek(weekNumber: number, sets: number, reps: string, load: string): ProgramDay {
  return {
    id: `w${weekNumber}`, dayNumber: 1, weekNumber, title: `Week ${weekNumber}`,
    sections: [{
      id: `s${weekNumber}`, type: "strength", name: "Main",
      groups: [{
        id: `g${weekNumber}`, type: "single",
        exercises: [{
          id: `e${weekNumber}`, name: "Back Squat", sets, reps, load,
          tags: { primary: ["quads", "glutes"], secondary: ["hamstrings"], incidental: [], modifiers: [] },
        }],
      }],
    }],
  };
}

it("classifies a heavy low-volume final week as a peak, not a deload", () => {
  const peaking: ProgramDay[] = [
    squatWeek(1, 6, "5", "75%"),
    squatWeek(2, 6, "4", "80%"),
    squatWeek(3, 5, "3", "85%"),
    squatWeek(4, 2, "1-2", "92%"),
  ];
  const r = analyzePeriodization(peaking);
  expect(r.peakDetected).toBe(true);
  expect(r.deloadDetected).toBe(false);
  expect(r.warnings.some((w) => /no deload/i.test(w.message))).toBe(false);
});

it("does not warn 'static' when sets are flat but intensity is rising", () => {
  const linear: ProgramDay[] = [
    squatWeek(1, 4, "8", "70%"),
    squatWeek(2, 4, "6", "78%"),
    squatWeek(3, 4, "4", "86%"),
  ];
  const r = analyzePeriodization(linear);
  expect(r.volumePattern).toBe("static");
  expect(r.intensityProgression).toBe("rising");
  expect(r.warnings.some((w) => /flat across all weeks|progressive overload/i.test(w.message))).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/analysis/periodization.test.ts -t "peak"`
Expected: FAIL — `peakDetected` is undefined; `deloadDetected` is `true`.
Run: `bun run test src/lib/analysis/periodization.test.ts -t "static"`
Expected: FAIL — `intensityProgression` undefined and the static warning is present.

- [ ] **Step 3a: Extend `PeriodizationResult`** (`types.ts`)

```ts
export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  deloadDetected: boolean;
  peakDetected: boolean;
  intensityProgression: "rising" | "flat" | "unknown";
  warnings: Warning[];
};
```

- [ ] **Step 3b: Rewrite `periodization.ts`**

```ts
import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets, repMidpoint } from "./muscles";
import { parseLoad } from "./parseLoad";

function weekExercises(weekDays: ProgramDay[]): ProgramExercise[] {
  const out: ProgramExercise[] = [];
  for (const day of weekDays)
    for (const section of day.sections)
      for (const group of section.groups)
        for (const exercise of group.exercises) out.push(exercise);
  return out;
}

function exerciseIsHeavy(exercise: ProgramExercise): boolean {
  const load = parseLoad(exercise.load);
  if (load.pct1rm !== undefined && load.pct1rm >= 85) return true;
  if (load.repMax !== undefined && load.repMax <= 3) return true;
  if (load.rpe !== undefined && load.rpe >= 9) return true;
  const mid = repMidpoint(exercise.reps);
  if (mid !== null && mid <= 3) return true;
  return false;
}

function weekIsHeavy(weekDays: ProgramDay[]): boolean {
  const exercises = weekExercises(weekDays);
  if (exercises.length === 0) return false;
  return exercises.filter(exerciseIsHeavy).length / exercises.length >= 0.5;
}

function weekAvgPct(weekDays: ProgramDay[]): number | null {
  const pcts = weekExercises(weekDays)
    .map((e) => parseLoad(e.load).pct1rm)
    .filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return null;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function weekAvgReps(weekDays: ProgramDay[]): number | null {
  const mids = weekExercises(weekDays)
    .map((e) => repMidpoint(e.reps))
    .filter((m): m is number => m !== null);
  if (mids.length === 0) return null;
  return mids.reduce((a, b) => a + b, 0) / mids.length;
}

function detectIntensityProgression(
  days: ProgramDay[],
  weeks: number[],
): PeriodizationResult["intensityProgression"] {
  const firstDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[0]);
  const lastDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[weeks.length - 1]);

  const p0 = weekAvgPct(firstDays);
  const p1 = weekAvgPct(lastDays);
  if (p0 !== null && p1 !== null) return p1 - p0 >= 5 ? "rising" : "flat";

  const r0 = weekAvgReps(firstDays);
  const r1 = weekAvgReps(lastDays);
  if (r0 !== null && r1 !== null) return r0 - r1 >= 2 ? "rising" : "flat";

  return "unknown";
}

export function analyzePeriodization(days: ProgramDay[]): PeriodizationResult {
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
  const warnings: Warning[] = [];

  if (weeks.length <= 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Single-week program — no periodization detected. Consider adding progressive overload across 4-6 weeks with a deload.",
    });
    return {
      weeksDetected: 1,
      volumePattern: "static",
      deloadDetected: false,
      peakDetected: false,
      intensityProgression: "unknown",
      warnings,
    };
  }

  const weeklyVolumes = weeks.map((wk) => {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    let total = 0;
    for (const exercise of weekExercises(weekDays)) total += getEffectiveSets(exercise);
    return total;
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const lastWeekDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[weeks.length - 1]);

  const volumeDropped = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;
  const lastWeekHeavy = weekIsHeavy(lastWeekDays);
  const deloadDetected = volumeDropped && !lastWeekHeavy;
  const peakDetected = volumeDropped && lastWeekHeavy;

  const volumePattern = detectPattern(weeklyVolumes);
  const intensityProgression = detectIntensityProgression(days, weeks);

  if (!deloadDetected && !peakDetected && weeks.length >= 4) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "No deload week detected — consider reducing volume by 30%+ in the final week every 4-6 weeks.",
    });
  }

  if (volumePattern === "static" && weeks.length > 1 && intensityProgression !== "rising") {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Volume is flat across all weeks — consider progressive overload (add 1 set/muscle/week).",
    });
  }

  return { weeksDetected: weeks.length, volumePattern, deloadDetected, peakDetected, intensityProgression, warnings };
}

function detectPattern(volumes: number[]): PeriodizationResult["volumePattern"] {
  if (volumes.length <= 1) return "static";

  const diffs: number[] = [];
  for (let i = 1; i < volumes.length; i++) {
    diffs.push(volumes[i] - volumes[i - 1]);
  }

  const allZero = diffs.every((d) => Math.abs(d) < 1);
  if (allZero) return "static";

  const increasing = diffs.every((d) => d >= 0);
  if (increasing) return "increasing";

  const decreasing = diffs.every((d) => d <= 0);
  if (decreasing) return "decreasing";

  return "wave";
}
```

- [ ] **Step 3c: Stop penalizing peak weeks and rising-intensity blocks in scoring** (`score.ts`, `scorePeriodizationDimension`)

```ts
export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  let score = 100;
  if (result.weeksDetected <= 1) score -= 30;
  if (!result.deloadDetected && !result.peakDetected && result.weeksDetected >= 4) score -= 20;
  if (
    result.volumePattern === "static" &&
    result.weeksDetected > 1 &&
    result.intensityProgression !== "rising"
  ) {
    score -= 20;
  }
  score -= result.warnings.filter((w) => w.severity === "red").length * 15;
  score -= result.warnings.filter((w) => w.severity === "yellow").length * 5;
  score = Math.max(0, Math.min(100, score));
  return { name: "Periodization", score, grade: scoreToGrade(score) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/analysis/periodization.test.ts` → PASS (all)
Run: `bun run test src/lib/analysis/score.test.ts` → PASS (update any existing periodization-score test that assumed the old fields; the `peakDetected`/`intensityProgression` fields are additive, existing static/deload tests keep working)
Run: `bunx tsc --noEmit` → no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/periodization.ts src/lib/analysis/score.ts src/lib/analysis/periodization.test.ts
git commit -m "fix(analysis): intensity-aware periodization (peak ≠ deload, rising ≠ static)"
```

---

## Task 7: Remove the disproportionate single-week penalty

A single-week template (the most common real-world pattern — one week + progressive load tracked in the log) is docked 30 points. Keep the informational warning; drop the score penalty.

**Files:**
- Modify: `src/lib/analysis/score.ts` (`scorePeriodizationDimension`)
- Test: `src/lib/analysis/score.test.ts`

- [ ] **Step 1: Write the failing test** (append in `score.test.ts`)

```ts
import { scorePeriodizationDimension } from "./score";

it("does not heavily penalize single-week programs", () => {
  const result = {
    weeksDetected: 1,
    volumePattern: "static" as const,
    deloadDetected: false,
    peakDetected: false,
    intensityProgression: "unknown" as const,
    warnings: [{ severity: "yellow" as const, dimension: "periodization", message: "Single-week program" }],
  };
  const score = scorePeriodizationDimension(result);
  expect(score.score).toBeGreaterThanOrEqual(90); // only the -5 yellow warning, no -30
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/analysis/score.test.ts -t "single-week"`
Expected: FAIL — score is `65` (100 − 30 − 5).

- [ ] **Step 3: Remove the `-30`** (`score.ts`, `scorePeriodizationDimension`)

Delete this line:

```ts
  if (result.weeksDetected <= 1) score -= 30;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/analysis/score.test.ts -t "single-week"`
Expected: PASS — score is `95`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/score.ts src/lib/analysis/score.test.ts
git commit -m "fix(analysis): drop disproportionate single-week periodization penalty"
```

---

## Task 8: Make movement-pattern coverage neutral (no severity), soften ratio framing

The 2026-05-06 decision was that movement-pattern coverage is informational (covered/absent), not a scored warning. `balance.ts:155-167` still pushes red/yellow warnings. Remove them (coverage is still returned for display) and soften the chest:back rationale copy.

**Files:**
- Modify: `src/lib/analysis/balance.ts` (remove pattern warnings)
- Modify: `src/lib/analysis/toDisplayAnalysis.ts` (soften chest:back detail)
- Modify: `src/components/analysis/RoutineAnalysisCard.tsx` (ratio caption)
- Test: `src/lib/analysis/balance.test.ts`

- [ ] **Step 1: Write the failing test** (append in `balance.test.ts`)

```ts
import { startingStrengthProgram } from "./fixtures";

it("does not emit severity warnings for missing movement patterns", () => {
  const result = analyzeBalance(startingStrengthProgram.days);
  // Starting Strength has no vertical pull, but pattern coverage is informational now.
  expect(result.movementPatternsMissing).toContain("vertical_pull");
  expect(result.warnings.some((w) => /movement pattern/i.test(w.message))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/analysis/balance.test.ts -t "movement patterns"`
Expected: FAIL — a yellow/red "Missing movement pattern(s)" warning is present.

- [ ] **Step 3a: Remove the pattern-warning block** (`balance.ts`)

Delete this block (currently ~lines 155-167), keeping the two `const movementPatterns...` lines above it and the `return { ... }`:

```ts
  if (movementPatternsMissing.length >= 2) {
    warnings.push({
      severity: "red",
      dimension: "balance",
      message: `Missing movement patterns: ${movementPatternsMissing.join(", ")}`,
    });
  } else if (movementPatternsMissing.length === 1) {
    warnings.push({
      severity: "yellow",
      dimension: "balance",
      message: `Missing movement pattern: ${movementPatternsMissing[0]}`,
    });
  }
```

- [ ] **Step 3b: Soften the chest:back rationale** (`toDisplayAnalysis.ts`, the `chest_back` ratio `detail`)

```ts
      detail: b.chestBackRatio !== null && b.chestBackRatio < bt.chestBack.idealMin
        ? "Back-emphasized — common and generally fine." : undefined,
```

- [ ] **Step 3c: Add a framing caption to the balance panel** (`RoutineAnalysisCard.tsx`, inside `BalancePanel`, right after the opening `<div>`)

```tsx
      <div style={{ fontSize: 10, color: "var(--fg-3)", lineHeight: 1.4, marginBottom: 6 }}>
        Volume-balance heuristics — not injury-risk metrics. Goal-specific programs may diverge intentionally.
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/analysis/balance.test.ts` → PASS (all)
Run: `bunx tsc --noEmit` → no errors

> Existing balance tests that asserted a missing-pattern warning must be updated to assert `movementPatternsMissing` instead. Update them in this step if present.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/balance.ts src/lib/analysis/toDisplayAnalysis.ts src/components/analysis/RoutineAnalysisCard.tsx src/lib/analysis/balance.test.ts
git commit -m "fix(analysis): neutral movement-pattern coverage; soften balance framing"
```

---

## Task 9: Delete confirmed dead code

`llmPrompt.ts` (only its own test imports it; the live LLM path is `LlmAnalysisSheet`'s inline `buildPrompt`), `isCompound` (no live caller), and `TRAINING_AGE_MULTIPLIER` (no importers) are all dead. `parseRepRange`/`repMidpoint` are now used by Task 6 — keep them.

**Files:**
- Delete: `src/lib/analysis/llmPrompt.ts`, `src/lib/analysis/llmPrompt.test.ts`
- Modify: `src/lib/analysis/muscles.ts` (remove `isCompound`)
- Modify: `src/lib/analysis/thresholds.ts` (remove `TRAINING_AGE_MULTIPLIER`)

- [ ] **Step 1: Confirm nothing references them** (should print nothing but the definitions / deleted test)

Run:
```bash
grep -rn "buildLlmAnalysisPrompt\|isCompound\|TRAINING_AGE_MULTIPLIER" src --include="*.ts" --include="*.tsx" | grep -v "llmPrompt\|muscles.ts:.*function isCompound\|thresholds.ts:.*TRAINING_AGE"
```
Expected: no output.

- [ ] **Step 2: Delete the dead files and symbols**

```bash
git rm src/lib/analysis/llmPrompt.ts src/lib/analysis/llmPrompt.test.ts
```

In `muscles.ts`, delete the entire `isCompound` function (the `export function isCompound(...) { ... }` block) and remove the now-unused `ExerciseCatalogItem` import only if nothing else in the file uses it (it is still used by `lookupCatalogExercise`/`classifyMovement`, so keep the import).

In `thresholds.ts`, delete the `TRAINING_AGE_MULTIPLIER` block (lines ~58-62).

- [ ] **Step 3: Verify the build and full suite are clean**

Run: `bunx tsc --noEmit` → no errors
Run: `bun run test` → all pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(analysis): remove dead llmPrompt, isCompound, TRAINING_AGE_MULTIPLIER"
```

---

## Final verification

- [ ] Run the full suite: `bun run test` → all green
- [ ] Typecheck: `bunx tsc --noEmit` → clean
- [ ] Build: `bun run build` → succeeds (the app deploys as a static GitHub Pages site)
- [ ] Manually open a routine in the app and confirm: the grade caption shows, untrained muscles render neutral, a peaking block no longer says "deload detected," and missing patterns show as plain "absent" chips with no warning.

---

## Deferred — requires its own brainstorm + plan (do NOT attempt here)

These are the design-heavy items from the audit. They involve product decisions (which goals, override UX, threshold sets) and should go through `superpowers:brainstorming` → `superpowers:writing-plans`:

1. **Goal-aware engine.** Training-style detection/fingerprint (replace the stub at `toDisplayAnalysis.ts:127`), goal-conditional volume landmarks (competition lifts on strength thresholds, accessories on hypertrophy), goal-gated session/balance thresholds, and a real (or explicitly omitted) overall grade per goal. Re-introduce a wired `trainingAgeMultiplier` here.
2. **Frequency dimension.** Per-muscle distinct-day count. Note current evidence (Schoenfeld 2019) says frequency isn't an independent hypertrophy driver when volume is equated — its real value is reconciling weekly volume with the per-session cap (flag a muscle whose weekly target arrives in a single over-capacity session).
3. **Volume-counting convention.** Decide: keep RP (direct-only) landmarks and drop fractional indirect credit, OR keep fractional counting and adopt landmarks derived under that convention. Re-evaluate the 0.25 incidental tier.
4. **Landmark recalibration.** The evidence-based value changes (biceps MEV down, rear-delt/quad/chest/calf MEVs up) — a scored-impact product decision.
5. **Prompt-builder reconciliation.** One canonical builder (the richer goal-aware content currently in `LlmAnalysisSheet`'s inline `buildPrompt`), one volume table shared with `thresholds.ts`.

### Follow-ups surfaced during execution (not done here)

Discovered by the per-task and final code reviews while executing this plan; deliberately left for later:

- **Warning/score double-counting in periodization & balance scoring.** The periodization warning *conditions* (`periodization.ts`) and the score *penalties* (`score.ts`) encode the same predicates in two places, and a "no deload" situation is penalized twice — once by the explicit `-20` and again by the `-5`-per-yellow-warning that the same condition pushed. Pre-existing (Tasks 6/7 only narrowed when the gates fire). Fix: derive penalties from `result.warnings`, or return structured flags that `score.ts` maps without re-deriving conditions. Touches scoring semantics → belongs with the goal-aware/recalibration pass.
- **Volume dimension note counts untrained muscles in the denominator.** `toDisplayAnalysis.ts` shows "N of {muscleVolumes.length} muscles in MAV range" using the full muscle list, while the volume *score* excludes untrained (`score.ts`). A program training 8 muscles well can read "8 of 19 in MAV range" yet score an A. More visible now that untrained is a first-class state. Fix alongside the goal-aware work (the denominator should reflect intended-to-train muscles).
- **`detectIntensityProgression` rep-fallback is undocumented.** The pct branch uses `p1 - p0 >= 5` (rising load) while the rep fallback uses `r0 - r1 >= 2` (falling reps = rising intensity); a one-line comment on the rep branch would prevent a future "is this a bug?" read.

---

## Self-review (completed by plan author)

- **Spec coverage:** Audit §4 bugs → Tasks 2 (hamstrings), 3 (untrained incoherence), 4 (max aggregation), 6 (peak-as-deload), 8 (pattern warnings), 9 (dead code). Audit "honesty/reframe" → Tasks 1, 8. Audit "intensity foundation" → Tasks 5, 6, 7. Design-heavy items → explicitly deferred. No in-scope requirement left without a task.
- **Placeholder scan:** No TBD/"add error handling"/"similar to Task N"; every code step shows complete code.
- **Type consistency:** `ParsedLoad` (Task 5) consumed unchanged in Task 6; `PeriodizationResult` gains `peakDetected`/`intensityProgression` (Task 6) and both are read in `score.ts` (Task 6) and the Task 7 test fixture; `MuscleDisplay.status` gains `"untrained"` (Task 3) consumed by the card's `AnyStatus`. `analyzePeriodization(days: ProgramDay[])` signature unchanged.
