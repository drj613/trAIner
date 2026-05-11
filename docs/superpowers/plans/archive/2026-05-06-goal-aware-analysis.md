# Goal-Aware Routine Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the routine analysis system serve hypertrophy, powerlifting, Olympic lifting, and powerbuilding programs correctly instead of scoring all programs against hypertrophy-only benchmarks.

**Architecture:** Three sequential tiers: Tier 1 fixes concrete UI/scoring bugs with no dependencies; Tier 2 adds a fuzzy intensity parser and peak-week detection that unblocks Tier 3; Tier 3 adds style detection, goal-conditional volume landmarks, catalog enrichment, and the user-facing style override. Each tier is independently shippable.

**Tech Stack:** TypeScript, React, Jest, existing analysis module at `src/lib/analysis/`, programs types at `src/lib/programs/types.ts`, exercise catalog at `src/lib/catalog/exercises.generated.json`.

---

## File Map

### Modified
- `src/lib/analysis/balance.ts` — remove movement pattern severity warnings
- `src/lib/analysis/volume.ts` — "Not trained" label for zero sets; goal-conditional landmark selection
- `src/lib/analysis/score.ts` — remove single-week -30 penalty; update scoreVolumeDimension filter
- `src/lib/analysis/periodization.ts` — peak week detection using parsed load + reps
- `src/lib/analysis/types.ts` — add `peakWeekDetected`, `TrainingStyle`, `StyleDetection`, update `AnalysisResult`
- `src/lib/analysis/thresholds.ts` — add `STRENGTH_VOLUME_LANDMARKS`, `STRENGTH_PRIMARY_MUSCLES`
- `src/lib/analysis/analyze.ts` — wire style detection; pass style to scoreVolume
- `src/lib/analysis/fixtures.ts` — add `peakWeekProgram` fixture; add `strengthProgram` fixture
- `src/lib/programs/types.ts` — add `trainingStyle?: TrainingStyle` to `ProgramDocument`
- `src/lib/catalog/exercises.generated.json` — tag snatch/C&J variants with movement patterns
- `src/components/workout/ProgramDetailClient.tsx` — add trainingStyle selector UI

### Created
- `src/lib/analysis/parseLoad.ts` — fuzzy load string parser
- `src/lib/analysis/parseLoad.test.ts` — load parser tests
- `src/lib/analysis/detectStyle.ts` — training style detection from program signals
- `src/lib/analysis/detectStyle.test.ts` — style detection tests

---

## TIER 1 — Targeted Fixes

### Task 1: Remove movement pattern severity warnings from balance analysis

**Files:**
- Modify: `src/lib/analysis/balance.ts:155–166`
- Modify: `src/lib/analysis/balance.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/analysis/balance.test.ts` inside the existing `describe("analyzeBalance")` block:

```ts
it("does not generate severity warnings for missing movement patterns", () => {
  // imbalancedProgram has only chest/delts/triceps — many patterns are missing
  const result = analyzeBalance(imbalancedProgram.days);
  const patternWarnings = result.warnings.filter((w) =>
    w.message.toLowerCase().includes("pattern") ||
    w.message.toLowerCase().includes("missing")
  );
  expect(patternWarnings).toHaveLength(0);
});

it("still reports movementPatternsMissing array correctly", () => {
  const result = analyzeBalance(imbalancedProgram.days);
  // imbalancedProgram has horizontal push (chest) but no hip hinge, squat, vertical pull
  expect(result.movementPatternsMissing.length).toBeGreaterThan(0);
  expect(result.movementPatternsCovered.length + result.movementPatternsMissing.length).toBe(6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/balance.test.ts --no-coverage
```

Expected: the new "does not generate severity warnings" test fails.

- [ ] **Step 3: Remove the warning pushes from balance.ts**

In `src/lib/analysis/balance.ts`, delete lines 155–166 (the two `warnings.push()` calls for missing patterns):

```ts
// DELETE this entire block:
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

The `movementPatternsCovered` and `movementPatternsMissing` arrays are still computed and returned — only the warning emissions are removed.

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/analysis/balance.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/balance.ts src/lib/analysis/balance.test.ts
git commit -m "fix: remove movement pattern severity warnings — patterns now display neutrally"
```

---

### Task 2: Fix front-squat catalog entry

**Files:**
- Modify: `src/lib/catalog/exercises.generated.json`

The entry with `"id": "front-squat"` has `"movementPatterns": []` and `"tags": []`, causing OL programs to get a false "missing squat pattern" warning.

- [ ] **Step 1: Locate and update the entry**

Find the object with `"id": "front-squat"` in `src/lib/catalog/exercises.generated.json` and update its `movementPatterns` and `tags` arrays:

```json
{
  "id": "front-squat",
  "movementPatterns": ["squat"],
  "tags": ["compound"]
}
```

Leave all other fields (`name`, `aliases`, `equipment`, `muscles`) unchanged.

- [ ] **Step 2: Verify with a grep**

```bash
grep -A 8 '"id": "front-squat"' src/lib/catalog/exercises.generated.json
```

Expected: `"movementPatterns": ["squat"]` and `"tags": ["compound"]` are present.

- [ ] **Step 3: Commit**

```bash
git add src/lib/catalog/exercises.generated.json
git commit -m "fix: add movementPatterns and tags to front-squat catalog entry"
```

---

### Task 3: Remove single-week program score penalty

**Files:**
- Modify: `src/lib/analysis/score.ts:56`
- Modify: `src/lib/analysis/analyze.test.ts`

The `-30` penalty for single-week programs is disproportionate. The warning message is already informative.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/analysis/analyze.test.ts` inside the existing `describe("analyzeProgram")` block:

```ts
it("single-week program scores above 0 on periodization dimension", () => {
  // balancedProgram is a single-week program
  const result = analyzeProgram(balancedProgram);
  // Before fix: weeksDetected <= 1 caused -30, so a program with no other issues
  // would score 70 on periodization. After fix it should score at least 90.
  expect(result.dimensions.periodization.score).toBeGreaterThanOrEqual(90);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/analysis/analyze.test.ts --no-coverage
```

Expected: the new test fails (periodization.score is 70, not ≥ 90).

- [ ] **Step 3: Remove the penalty from score.ts**

In `src/lib/analysis/score.ts`, delete the single-week penalty line:

```ts
// BEFORE:
export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  let score = 100;
  if (result.weeksDetected <= 1) score -= 30;   // DELETE this line
  if (!result.deloadDetected && result.weeksDetected >= 4) score -= 20;
  ...
```

```ts
// AFTER:
export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  let score = 100;
  if (!result.deloadDetected && result.weeksDetected >= 4) score -= 20;
  if (result.volumePattern === "static" && result.weeksDetected > 1) score -= 20;
  score -= result.warnings.filter((w) => w.severity === "red").length * 15;
  score -= result.warnings.filter((w) => w.severity === "yellow").length * 5;
  score = Math.max(0, Math.min(100, score));
  return { name: "Periodization", score, grade: scoreToGrade(score) };
}
```

The warning message "Single-week program — no periodization detected" (emitted in `periodization.ts`) still informs the user without punishing the score.

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/analysis/analyze.test.ts src/lib/analysis/periodization.test.ts --no-coverage
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/score.ts src/lib/analysis/analyze.test.ts
git commit -m "fix: remove -30 single-week program score penalty"
```

---

### Task 4: Display zero-set muscles as "Not trained" and exclude from volume score

**Files:**
- Modify: `src/lib/analysis/volume.ts`
- Modify: `src/lib/analysis/score.ts`
- Modify: `src/lib/analysis/volume.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/analysis/volume.test.ts` inside the `describe("scoreVolume")` block:

```ts
it("zero-set muscles get severity green and label 'Not trained'", () => {
  // imbalancedProgram has no leg work — quads should be "Not trained"
  const volumes = countWeeklyVolume(imbalancedProgram.days, 1);
  const results = scoreVolume(volumes);
  const quads = results.find((r) => r.muscle === "quads")!;
  expect(quads.effectiveSets).toBe(0);
  expect(quads.severity).toBe("green");
  expect(quads.label).toBe("Not trained");
});

it("zero-set muscles are excluded from scoreVolumeDimension", () => {
  // A program with only 1 muscle trained at MAV (green) and 18 untrained muscles
  // should score 90 (pure green), not be dragged down by untrained muscles
  const volumes = new Map([["chest" as const, 10]]);  // chest in MAV range
  const results = scoreVolume(volumes);
  // All muscles except chest will be zero-set and excluded from scoring
  // Verify: call scoreVolumeDimension and check the score reflects only trained muscles
  const { scoreVolumeDimension } = require("./score");
  const score = scoreVolumeDimension(results);
  expect(score.score).toBe(90); // only chest contributes; it's green (90)
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/volume.test.ts --no-coverage
```

Expected: both new tests fail.

- [ ] **Step 3: Update classifyVolume in volume.ts**

In `src/lib/analysis/volume.ts`, update `classifyVolume` to return "Not trained" when sets is 0:

```ts
function classifyVolume(
  sets: number,
  lm: (typeof VOLUME_LANDMARKS)[MuscleGroup],
): { severity: Severity; label: string } {
  if (sets === 0) return { severity: "green", label: "Not trained" };
  if (sets < lm.mv) return { severity: "red", label: "Below maintenance" };
  if (sets < lm.mev) return { severity: "yellow", label: "Maintenance only" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
```

- [ ] **Step 4: Update scoreVolumeDimension filter in score.ts**

In `src/lib/analysis/score.ts`, update `scoreVolumeDimension` to only include muscles that are actually trained:

```ts
export function scoreVolumeDimension(results: MuscleVolumeResult[]): DimensionScore {
  const trained = results.filter((r) => r.effectiveSets > 0);
  if (trained.length === 0) return { name: "Volume", score: 0, grade: "F" };
  const scores = trained.map((r) => {
    if (r.severity === "green") return 90;
    if (r.severity === "yellow") return 60;
    return 30;
  });
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { name: "Volume", score: avg, grade: scoreToGrade(avg) };
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/lib/analysis/ --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/volume.ts src/lib/analysis/score.ts src/lib/analysis/volume.test.ts
git commit -m "fix: display zero-set muscles as 'Not trained'; exclude from volume score"
```

---

## TIER 2 — Fuzzy Load Parser + Peak Week Detection

### Task 5: Fuzzy load string parser

**Files:**
- Create: `src/lib/analysis/parseLoad.ts`
- Create: `src/lib/analysis/parseLoad.test.ts`

- [ ] **Step 1: Write the tests first**

Create `src/lib/analysis/parseLoad.test.ts`:

```ts
import { parseLoad } from "./parseLoad";

describe("parseLoad", () => {
  // Percentage formats
  it("parses '80% 1RM'", () => expect(parseLoad("80% 1RM")).toMatchObject({ pct1rm: 80 }));
  it("parses '80%'", () => expect(parseLoad("80%")).toMatchObject({ pct1rm: 80 }));
  it("parses '~80%'", () => expect(parseLoad("~80%")).toMatchObject({ pct1rm: 80 }));
  it("parses '85 percent'", () => expect(parseLoad("85 percent")).toMatchObject({ pct1rm: 85 }));
  it("parses '90% of 1RM'", () => expect(parseLoad("90% of 1RM")).toMatchObject({ pct1rm: 90 }));

  // RPE formats
  it("parses 'RPE 8'", () => expect(parseLoad("RPE 8")).toMatchObject({ rpe: 8 }));
  it("parses '@8'", () => expect(parseLoad("@8")).toMatchObject({ rpe: 8 }));
  it("parses '@8.5'", () => expect(parseLoad("@8.5")).toMatchObject({ rpe: 8.5 }));
  it("parses 'rpe8'", () => expect(parseLoad("rpe8")).toMatchObject({ rpe: 8 }));
  it("parses '8 RPE'", () => expect(parseLoad("8 RPE")).toMatchObject({ rpe: 8 }));
  it("parses 'RPE8'", () => expect(parseLoad("RPE8")).toMatchObject({ rpe: 8 }));

  // RIR formats — converts to RPE
  it("parses '3RIR' as rpe 7 and rir 3", () => {
    const result = parseLoad("3RIR");
    expect(result).toMatchObject({ rir: 3, rpe: 7 });
  });
  it("parses '2 RIR' as rpe 8 and rir 2", () => {
    const result = parseLoad("2 RIR");
    expect(result).toMatchObject({ rir: 2, rpe: 8 });
  });
  it("parses 'rir 1'", () => expect(parseLoad("rir 1")).toMatchObject({ rir: 1, rpe: 9 }));

  // Rep-max formats
  it("parses '5RM'", () => expect(parseLoad("5RM")).toMatchObject({ repMax: 5 }));
  it("parses '5 rep max'", () => expect(parseLoad("5 rep max")).toMatchObject({ repMax: 5 }));
  it("parses '5-rep max'", () => expect(parseLoad("5-rep max")).toMatchObject({ repMax: 5 }));
  it("parses '3 rep max'", () => expect(parseLoad("3 rep max")).toMatchObject({ repMax: 3 }));
  it("parses '1RM'", () => expect(parseLoad("1RM")).toMatchObject({ repMax: 1 }));

  // Combinations
  it("parses '85% 1RM @ RPE 8'", () => {
    expect(parseLoad("85% 1RM @ RPE 8")).toMatchObject({ pct1rm: 85, rpe: 8 });
  });
  it("parses '3RM ~90%'", () => {
    expect(parseLoad("3RM ~90%")).toMatchObject({ repMax: 3, pct1rm: 90 });
  });

  // Unknown / empty — returns empty object, never throws
  it("returns {} for empty string", () => expect(parseLoad("")).toEqual({}));
  it("returns {} for 'bodyweight'", () => expect(parseLoad("bodyweight")).toEqual({}));
  it("returns {} for 'moderate'", () => expect(parseLoad("moderate")).toEqual({}));
  it("returns {} for null/undefined input", () => {
    expect(parseLoad(undefined as unknown as string)).toEqual({});
    expect(parseLoad(null as unknown as string)).toEqual({});
  });

  // Bounds check — ignores out-of-range values
  it("ignores pct1rm > 120", () => expect(parseLoad("150%")).toEqual({}));
  it("ignores rpe > 10", () => expect(parseLoad("RPE 11")).toEqual({}));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/parseLoad.test.ts --no-coverage
```

Expected: all fail (module not found).

- [ ] **Step 3: Implement parseLoad.ts**

Create `src/lib/analysis/parseLoad.ts`:

```ts
export type ParsedLoad = {
  pct1rm?: number;
  rpe?: number;
  rir?: number;
  repMax?: number;
};

export function parseLoad(s: string | null | undefined): ParsedLoad {
  if (!s || typeof s !== "string") return {};
  const result: ParsedLoad = {};
  const lower = s.toLowerCase().trim();

  // RIR (must check before RPE to avoid partial match on "rpe")
  const rirMatch = lower.match(/(\d+(?:\.\d+)?)\s*rir\b/) ?? lower.match(/\brir\s*(\d+(?:\.\d+)?)/);
  if (rirMatch) {
    const rir = parseFloat(rirMatch[1]);
    if (rir >= 0 && rir <= 10) {
      result.rir = rir;
      result.rpe = 10 - rir;
    }
  }

  // RPE (only if not already set via RIR)
  if (!result.rpe) {
    const rpeMatch =
      lower.match(/\brpe\s*(\d+(?:\.\d+)?)/) ??
      lower.match(/(\d+(?:\.\d+)?)\s*rpe\b/) ??
      lower.match(/@\s*(\d+(?:\.\d+)?)/);
    if (rpeMatch) {
      const rpe = parseFloat(rpeMatch[1]);
      if (rpe >= 0 && rpe <= 10) result.rpe = rpe;
    }
  }

  // %1RM
  const pctMatch =
    lower.match(/~?(\d+(?:\.\d+)?)\s*%/) ??
    lower.match(/(\d+(?:\.\d+)?)\s*percent/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    if (pct > 0 && pct <= 120) result.pct1rm = pct;
  }

  // Rep max (only if not already interpreted as RPE — "1RM" is repMax:1, not rpe)
  const rmMatch =
    lower.match(/(\d+)\s*[-\s]?rep\s*max/) ??
    lower.match(/(\d+)\s*rm\b(?!\s*[/])/);
  if (rmMatch) {
    const rm = parseInt(rmMatch[1], 10);
    if (rm >= 1 && rm <= 20) result.repMax = rm;
  }

  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/analysis/parseLoad.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/parseLoad.ts src/lib/analysis/parseLoad.test.ts
git commit -m "feat: add fuzzy load string parser (parseLoad)"
```

---

### Task 6: Peak week detection in periodization analysis

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/periodization.ts`
- Modify: `src/lib/analysis/fixtures.ts`
- Modify: `src/lib/analysis/periodization.test.ts`

- [ ] **Step 1: Add peakWeekDetected to PeriodizationResult type**

In `src/lib/analysis/types.ts`, update `PeriodizationResult`:

```ts
export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  deloadDetected: boolean;
  peakWeekDetected: boolean;
  warnings: Warning[];
};
```

- [ ] **Step 2: Add peakWeekProgram fixture**

In `src/lib/analysis/fixtures.ts`, add at the end:

```ts
// ---------------------------------------------------------------------------
// peakWeekProgram — 4-week block ending in a peak week (1-rep sets, high load)
// The final week has low volume but high intensity — should NOT be labelled "deload"
// ---------------------------------------------------------------------------

export const peakWeekProgram: ProgramDocument = program(
  "peak-week-1",
  "4-Week Peak Block",
  [
    // Weeks 1-3: accumulation (moderate reps, increasing sets)
    day("pw-w1", 1, "Squat", 1, section("pw-s1", "strength", "Strength",
      group("pw-g1", { ...ex("pw-e1", "Back Squat", 5, "5", ["quads", "glutes"], ["hamstrings"]), load: "75% 1RM" }),
    )),
    day("pw-w2", 1, "Squat", 2, section("pw-s2", "strength", "Strength",
      group("pw-g2", { ...ex("pw-e2", "Back Squat", 5, "3", ["quads", "glutes"], ["hamstrings"]), load: "82% 1RM" }),
    )),
    day("pw-w3", 1, "Squat", 3, section("pw-s3", "strength", "Strength",
      group("pw-g3", { ...ex("pw-e3", "Back Squat", 4, "2", ["quads", "glutes"], ["hamstrings"]), load: "88% 1RM" }),
    )),
    // Week 4: peak (1-rep sets, 93%+, volume drops >30% from week 1's 5 sets)
    day("pw-w4", 1, "Peak Day", 4, section("pw-s4", "strength", "Strength",
      group("pw-g4", { ...ex("pw-e4", "Back Squat", 3, "1", ["quads", "glutes"], ["hamstrings"]), load: "93% 1RM" }),
    )),
  ],
);
```

- [ ] **Step 3: Write failing tests**

Add to `src/lib/analysis/periodization.test.ts`:

```ts
import { balancedProgram, multiWeekProgram, peakWeekProgram } from "./fixtures";

// (existing tests stay as-is, add below)

it("detects peak week and sets peakWeekDetected = true", () => {
  const result = analyzePeriodization(peakWeekProgram.days);
  expect(result.peakWeekDetected).toBe(true);
});

it("does not flag missing deload when peak week is detected", () => {
  const result = analyzePeriodization(peakWeekProgram.days);
  const deloadWarning = result.warnings.find((w) =>
    w.message.toLowerCase().includes("deload")
  );
  expect(deloadWarning).toBeUndefined();
});

it("non-peak programs still flag missing deload", () => {
  // multiWeekProgram has a real deload week — no warning expected
  const result = analyzePeriodization(multiWeekProgram.days);
  expect(result.deloadDetected).toBe(true);
  expect(result.peakWeekDetected).toBe(false);
});

it("returns peakWeekDetected: false for single-week programs", () => {
  const result = analyzePeriodization(balancedProgram.days);
  expect(result.peakWeekDetected).toBe(false);
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/periodization.test.ts --no-coverage
```

Expected: new tests fail (peakWeekDetected undefined, missing deload warning still fires).

- [ ] **Step 5: Update analyzePeriodization in periodization.ts**

Replace the full content of `src/lib/analysis/periodization.ts`:

```ts
import type { ProgramDay } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets, parseRepRange, repMidpoint } from "./muscles";
import { parseLoad } from "./parseLoad";

export function analyzePeriodization(days: ProgramDay[]): PeriodizationResult {
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
  const warnings: Warning[] = [];

  if (weeks.length <= 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Single-week program — no periodization detected. Consider adding progressive overload across 4-6 weeks with a deload.",
    });
    return { weeksDetected: 1, volumePattern: "static", deloadDetected: false, peakWeekDetected: false, warnings };
  }

  const weeklyVolumes = weeks.map((wk) => {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    let total = 0;
    for (const day of weekDays)
      for (const section of day.sections)
        for (const group of section.groups)
          for (const exercise of group.exercises)
            total += getEffectiveSets(exercise);
    return total;
  });

  // Per-week intensity signals: average pct1rm and average reps
  const weeklyIntensity = weeks.map((wk) => {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    const pct1rms: number[] = [];
    const rpes: number[] = [];
    const repMids: number[] = [];
    for (const day of weekDays)
      for (const section of day.sections)
        for (const group of section.groups)
          for (const exercise of group.exercises) {
            const load = parseLoad(exercise.load);
            if (load.pct1rm !== undefined) pct1rms.push(load.pct1rm);
            if (load.rpe !== undefined) rpes.push(load.rpe);
            const mid = repMidpoint(exercise.reps);
            if (mid !== null) repMids.push(mid);
          }
    const avgPct = pct1rms.length > 0 ? pct1rms.reduce((a, b) => a + b, 0) / pct1rms.length : null;
    const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    const avgReps = repMids.length > 0 ? repMids.reduce((a, b) => a + b, 0) / repMids.length : null;
    return { avgPct, avgRpe, avgReps };
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const lastWeekIntensity = weeklyIntensity[weeklyIntensity.length - 1];
  const volumeDrops = lastWeekVolume <= maxVolume * 0.7;

  // Peak week: volume drops ≥30% from max AND intensity signals suggest high intensity
  const isPeakWeek = (inten: typeof lastWeekIntensity): boolean => {
    if (inten.avgPct !== null && inten.avgPct >= 85) return true;
    if (inten.avgRpe !== null && inten.avgRpe >= 8.5) return true;
    if (inten.avgReps !== null && inten.avgReps <= 3) return true;
    return false;
  };

  const peakWeekDetected = volumeDrops && weeklyVolumes.length >= 3 && isPeakWeek(lastWeekIntensity);
  const deloadDetected = volumeDrops && weeklyVolumes.length >= 3 && !peakWeekDetected;

  const volumePattern = detectPattern(weeklyVolumes);

  if (!deloadDetected && !peakWeekDetected && weeks.length >= 4) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "No deload week detected — consider reducing volume by 30%+ in the final week every 4-6 weeks.",
    });
  }

  if (volumePattern === "static" && weeks.length > 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Volume is flat across all weeks — consider progressive overload (add 1 set/muscle/week).",
    });
  }

  return { weeksDetected: weeks.length, volumePattern, deloadDetected, peakWeekDetected, warnings };
}

function detectPattern(volumes: number[]): PeriodizationResult["volumePattern"] {
  if (volumes.length <= 1) return "static";
  const diffs: number[] = [];
  for (let i = 1; i < volumes.length; i++) diffs.push(volumes[i] - volumes[i - 1]);
  if (diffs.every((d) => Math.abs(d) < 1)) return "static";
  if (diffs.every((d) => d >= 0)) return "increasing";
  if (diffs.every((d) => d <= 0)) return "decreasing";
  return "wave";
}
```

- [ ] **Step 6: Run all analysis tests**

```bash
npx jest src/lib/analysis/ --no-coverage
```

Expected: all pass. The existing `"detects deload week"` test still passes because `multiWeekProgram` has no load fields — it falls back to the set-count heuristic which still flags the low-volume final week as deload.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/periodization.ts src/lib/analysis/fixtures.ts src/lib/analysis/periodization.test.ts
git commit -m "feat: add peak week detection to periodization analysis using load + reps signals"
```

---

## TIER 3 — Style Detection and Goal-Conditional Analysis

### Task 7: Add trainingStyle field to ProgramDocument

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/analysis/types.ts`

- [ ] **Step 1: Add TrainingStyle type and StyleDetection to analysis types**

In `src/lib/analysis/types.ts`, add before `MuscleGroup`:

```ts
export type TrainingStyle =
  | "strength"
  | "hypertrophy"
  | "olympic_lifting"
  | "powerbuilding"
  | "mixed";

export type StyleDetection = {
  primary: TrainingStyle;
  secondary?: TrainingStyle;
  confidence: number;
};
```

Also update `AnalysisResult` to include style:

```ts
export type AnalysisResult = {
  overall: DimensionScore;
  style: StyleDetection;
  dimensions: {
    volume: DimensionScore;
    session: DimensionScore;
    balance: DimensionScore;
    periodization: DimensionScore;
  };
  muscleVolumes: MuscleVolumeResult[];
  sessions: SessionResult[];
  balance: BalanceResult;
  periodization: PeriodizationResult;
  warnings: Warning[];
};
```

- [ ] **Step 2: Add trainingStyle to ProgramDocument**

In `src/lib/programs/types.ts`, add to `ProgramDocument`:

```ts
export type ProgramDocument = {
  id: ID;
  title: string;
  description?: string;
  trainingStyle?: TrainingStyle;   // add this line — user override for style detection
  source: "import" | "manual" | "backup";
  active: boolean;
  // ... rest unchanged
};
```

`TrainingStyle` must be imported from analysis types OR redefined here. Since `programs/types.ts` has no analysis dependency, define it in a shared location or duplicate the type. Simplest: define `TrainingStyle` in `programs/types.ts` and re-export from `analysis/types.ts`:

In `src/lib/programs/types.ts` add:
```ts
export type TrainingStyle =
  | "strength"
  | "hypertrophy"
  | "olympic_lifting"
  | "powerbuilding"
  | "mixed";
```

In `src/lib/analysis/types.ts` change the `TrainingStyle` definition to:
```ts
export type { TrainingStyle } from "@/lib/programs/types";
```

- [ ] **Step 3: Run the full test suite to confirm no type errors broke anything**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all existing tests pass (no regressions from the type additions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/programs/types.ts src/lib/analysis/types.ts
git commit -m "feat: add TrainingStyle type and trainingStyle field to ProgramDocument and AnalysisResult"
```

---

### Task 8: Style detection utility

**Files:**
- Create: `src/lib/analysis/detectStyle.ts`
- Create: `src/lib/analysis/detectStyle.test.ts`
- Modify: `src/lib/analysis/fixtures.ts` — add a strength-style fixture

- [ ] **Step 1: Add strengthProgram fixture to fixtures.ts**

In `src/lib/analysis/fixtures.ts`, add at the end:

```ts
// ---------------------------------------------------------------------------
// strengthProgram — Sheiko-style 3-day powerlifting program
// High compound ratio, low reps (3-5), strength section types, no isolation
// ---------------------------------------------------------------------------

export const strengthProgram: ProgramDocument = program(
  "strength-1",
  "Sheiko-Style 3-Day",
  [
    day("sp-d1", 1, "Day A", 1,
      section("sp-s1", "strength", "Squat + Bench",
        group("sp-g1", { ...ex("sp-e1", "Back Squat", 5, "5", ["quads", "glutes"], ["hamstrings"]), load: "80% 1RM" }),
        group("sp-g2", { ...ex("sp-e2", "Bench Press", 5, "5", ["chest", "front delts"], ["triceps"]), load: "80% 1RM" }),
        group("sp-g3", { ...ex("sp-e3", "Back Squat", 4, "3", ["quads", "glutes"], ["hamstrings"]), load: "85% 1RM" }),
      ),
    ),
    day("sp-d2", 2, "Day B", 1,
      section("sp-s2", "strength", "Deadlift + Bench",
        group("sp-g4", { ...ex("sp-e4", "Deadlift", 4, "4", ["hamstrings", "glutes", "lower back"], ["lats"]), load: "80% 1RM" }),
        group("sp-g5", { ...ex("sp-e5", "Bench Press", 4, "4", ["chest", "front delts"], ["triceps"]), load: "82% 1RM" }),
      ),
    ),
    day("sp-d3", 3, "Day C", 1,
      section("sp-s3", "strength", "Squat + Deadlift",
        group("sp-g6", { ...ex("sp-e6", "Back Squat", 5, "3", ["quads", "glutes"], ["hamstrings"]), load: "85% 1RM" }),
        group("sp-g7", { ...ex("sp-e7", "Deadlift", 3, "3", ["hamstrings", "glutes", "lower back"], ["lats"]), load: "82% 1RM" }),
      ),
    ),
  ],
);
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/analysis/detectStyle.test.ts`:

```ts
import { detectStyle } from "./detectStyle";
import { balancedProgram, imbalancedProgram, strengthProgram } from "./fixtures";
import type { ProgramDay } from "@/lib/programs/types";

describe("detectStyle", () => {
  it("detects balanced upper/lower program as hypertrophy", () => {
    const result = detectStyle(balancedProgram.days);
    expect(result.primary).toBe("hypertrophy");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects chest bro split as hypertrophy", () => {
    const result = detectStyle(imbalancedProgram.days);
    expect(result.primary).toBe("hypertrophy");
  });

  it("detects strength/powerlifting program", () => {
    const result = detectStyle(strengthProgram.days);
    expect(result.primary).toBe("strength");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns confidence 0–1", () => {
    const result = detectStyle(balancedProgram.days);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("detects olympic program when 'olympic' section type is present", () => {
    const days: ProgramDay[] = [{
      id: "d1", dayNumber: 1, weekNumber: 1, title: "OL Day",
      sections: [{
        id: "s1", type: "explosive", name: "OL",
        groups: [{
          id: "g1", type: "single",
          exercises: [
            { id: "e1", name: "Snatch", sets: 5, reps: "2", load: "85% 1RM",
              tags: { primary: ["quads", "glutes"], secondary: ["lats"], incidental: [], modifiers: [] } },
            { id: "e2", name: "Clean and Jerk", sets: 4, reps: "2", load: "82% 1RM",
              tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] } },
          ],
        }],
      }],
    }];
    const result = detectStyle(days);
    expect(result.primary).toBe("olympic_lifting");
  });

  it("returns mixed for a program with no clear signals", () => {
    const days: ProgramDay[] = [{
      id: "d1", dayNumber: 1, weekNumber: 1, title: "Random",
      sections: [{
        id: "s1", type: "training", name: "Mixed",
        groups: [{
          id: "g1", type: "single",
          exercises: [
            { id: "e1", name: "Curl", sets: 3, reps: "10",
              tags: { primary: ["biceps"], secondary: [], incidental: [], modifiers: [] } },
          ],
        }],
      }],
    }];
    const result = detectStyle(days);
    // low-confidence; no strong signal — should be mixed or hypertrophy (isolation = hypertrophy signal)
    expect(["mixed", "hypertrophy"]).toContain(result.primary);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/detectStyle.test.ts --no-coverage
```

Expected: all fail (module not found).

- [ ] **Step 4: Implement detectStyle.ts**

Create `src/lib/analysis/detectStyle.ts`:

```ts
import type { ProgramDay } from "@/lib/programs/types";
import type { TrainingStyle, StyleDetection } from "./types";
import { parseLoad } from "./parseLoad";
import { repMidpoint, isCompound, lookupCatalogExercise } from "./muscles";

const OL_EXERCISE_NAMES = new Set([
  "snatch", "clean", "jerk", "clean and jerk", "power clean",
  "power snatch", "hang clean", "hang snatch", "split jerk",
]);

const STRENGTH_SECTION_TYPES = new Set([
  "strength", "power", "explosive",
]);

const HYPERTROPHY_SECTION_TYPES = new Set([
  "hypertrophy", "accessory",
]);

const OL_SECTION_TYPES = new Set([
  "explosive", "olympic",
]);

type Signals = {
  totalExercises: number;
  strengthSectionFraction: number;
  hypertrophySectionFraction: number;
  hasOlympicExercises: boolean;
  hasOlympicSectionType: boolean;
  compoundRatio: number;
  avgRepMidpoint: number | null;
  avgPct1rm: number | null;
  hasAccessorySections: boolean;
  hasStrengthSections: boolean;
};

function gatherSignals(days: ProgramDay[]): Signals {
  let totalExercises = 0;
  let compoundCount = 0;
  let strengthSections = 0;
  let hypertrophySections = 0;
  let totalSections = 0;
  let hasOlympicExercises = false;
  let hasOlympicSectionType = false;
  let hasAccessorySections = false;
  let hasStrengthSections = false;
  const repMids: number[] = [];
  const pct1rms: number[] = [];

  for (const day of days) {
    for (const section of day.sections) {
      totalSections++;
      const st = section.type;
      if (STRENGTH_SECTION_TYPES.has(st)) { strengthSections++; hasStrengthSections = true; }
      if (HYPERTROPHY_SECTION_TYPES.has(st)) { hypertrophySections++; hasAccessorySections = true; }
      if (OL_SECTION_TYPES.has(st)) hasOlympicSectionType = true;
      if (st === "accessory") hasAccessorySections = true;

      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          totalExercises++;
          const catalogItem = lookupCatalogExercise(exercise);
          if (isCompound(exercise, catalogItem)) compoundCount++;

          const nameLower = exercise.name.toLowerCase();
          if ([...OL_EXERCISE_NAMES].some((k) => nameLower.includes(k))) {
            hasOlympicExercises = true;
          }

          const mid = repMidpoint(exercise.reps);
          if (mid !== null) repMids.push(mid);

          const load = parseLoad(exercise.load);
          if (load.pct1rm !== undefined) pct1rms.push(load.pct1rm);
        }
      }
    }
  }

  return {
    totalExercises,
    strengthSectionFraction: totalSections > 0 ? strengthSections / totalSections : 0,
    hypertrophySectionFraction: totalSections > 0 ? hypertrophySections / totalSections : 0,
    hasOlympicExercises,
    hasOlympicSectionType,
    compoundRatio: totalExercises > 0 ? compoundCount / totalExercises : 0,
    avgRepMidpoint: repMids.length > 0 ? repMids.reduce((a, b) => a + b, 0) / repMids.length : null,
    avgPct1rm: pct1rms.length > 0 ? pct1rms.reduce((a, b) => a + b, 0) / pct1rms.length : null,
    hasAccessorySections,
    hasStrengthSections,
  };
}

function scoreStrength(s: Signals): number {
  let score = 0;
  if (s.strengthSectionFraction >= 0.5) score += 0.3;
  if (s.compoundRatio >= 0.8) score += 0.3;
  if (s.avgRepMidpoint !== null && s.avgRepMidpoint <= 6) score += 0.3;
  else if (s.avgRepMidpoint !== null && s.avgRepMidpoint <= 8) score += 0.1;
  if (s.avgPct1rm !== null && s.avgPct1rm >= 80) score += 0.1;
  return Math.min(1, score);
}

function scoreHypertrophy(s: Signals): number {
  let score = 0;
  if (s.hypertrophySectionFraction >= 0.3) score += 0.3;
  if (s.compoundRatio >= 0.4 && s.compoundRatio < 0.85) score += 0.3;
  if (s.avgRepMidpoint !== null && s.avgRepMidpoint >= 7 && s.avgRepMidpoint <= 15) score += 0.3;
  return Math.min(1, score);
}

function scoreOlympic(s: Signals): number {
  let score = 0;
  if (s.hasOlympicExercises) score += 0.5;
  if (s.hasOlympicSectionType) score += 0.3;
  if (s.compoundRatio >= 0.9) score += 0.2;
  return Math.min(1, score);
}

function scorePowerbuilding(s: Signals): number {
  let score = 0;
  if (s.hasStrengthSections && s.hasAccessorySections) score += 0.4;
  if (s.compoundRatio >= 0.5 && s.compoundRatio < 0.85) score += 0.3;
  if (s.avgRepMidpoint !== null && s.avgRepMidpoint >= 4 && s.avgRepMidpoint <= 10) score += 0.3;
  return Math.min(1, score);
}

export function detectStyle(days: ProgramDay[]): StyleDetection {
  const signals = gatherSignals(days);

  const scores: Record<TrainingStyle, number> = {
    strength: scoreStrength(signals),
    hypertrophy: scoreHypertrophy(signals),
    olympic_lifting: scoreOlympic(signals),
    powerbuilding: scorePowerbuilding(signals),
    mixed: 0.3,
  };

  const ranked = (Object.entries(scores) as [TrainingStyle, number][])
    .sort(([, a], [, b]) => b - a);

  const [primaryStyle, primaryScore] = ranked[0];
  const [secondaryStyle, secondaryScore] = ranked[1];

  if (primaryScore < 0.5) {
    return { primary: "mixed", confidence: primaryScore };
  }

  return {
    primary: primaryStyle,
    secondary: secondaryScore >= 0.3 ? secondaryStyle : undefined,
    confidence: primaryScore,
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/lib/analysis/detectStyle.test.ts --no-coverage
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/detectStyle.ts src/lib/analysis/detectStyle.test.ts src/lib/analysis/fixtures.ts
git commit -m "feat: add training style detection (detectStyle)"
```

---

### Task 9: Strength volume landmarks and goal-conditional scoring

**Files:**
- Modify: `src/lib/analysis/thresholds.ts`
- Modify: `src/lib/analysis/volume.ts`
- Modify: `src/lib/analysis/volume.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/analysis/volume.test.ts`:

```ts
import { scoreVolume } from "./volume";

// (below existing tests)
describe("scoreVolume with style", () => {
  it("scores zero biceps sets as Not trained for strength style (not Below MEV)", () => {
    const volumes = new Map([["quads" as const, 10]]);
    const results = scoreVolume(volumes, "strength");
    const biceps = results.find((r) => r.muscle === "biceps")!;
    expect(biceps.label).toBe("Not trained");  // already passes from Task 4
    expect(biceps.severity).toBe("green");
  });

  it("uses lower MEV thresholds for quads in strength programs", () => {
    // In strength programming, 3 sets/week of quads is at MEV (not below it)
    // In hypertrophy (default), quads mev=5, so 3 sets would be below MEV (yellow)
    const volumes = new Map([["quads" as const, 3]]);
    const hypertrophyResults = scoreVolume(volumes);
    const strengthResults = scoreVolume(volumes, "strength");
    const quadHypertrophy = hypertrophyResults.find((r) => r.muscle === "quads")!;
    const quadStrength = strengthResults.find((r) => r.muscle === "quads")!;
    // hypertrophy: 3 sets < mev(5) → yellow
    expect(quadHypertrophy.severity).toBe("yellow");
    // strength: 3 sets = mev(3) → at MEV → green
    expect(quadStrength.severity).toBe("green");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/analysis/volume.test.ts --no-coverage
```

Expected: the "lower MEV thresholds for quads" test fails.

- [ ] **Step 3: Add STRENGTH_VOLUME_LANDMARKS and STRENGTH_PRIMARY_MUSCLES to thresholds.ts**

In `src/lib/analysis/thresholds.ts`, add after `VOLUME_LANDMARKS`:

```ts
// Muscles that use strength thresholds in strength/OL/powerbuilding programs.
// These are the primary muscles of competition/compound lifts.
export const STRENGTH_PRIMARY_MUSCLES = new Set<MuscleGroup>([
  "quads", "glutes", "hamstrings", "lower_back",
  "chest", "front_delts", "side_delts",
  "lats", "upper_back",
]);

// Volume landmarks calibrated for strength-sport programming (Sheiko/Prilepin basis).
// Key differences from hypertrophy: lower MEV/MAV (intensity does the work, not volume);
// near-zero MEV for isolation muscles (direct arm/calf work is optional in strength sport).
export const STRENGTH_VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest:        { mv: 1, mev: 3, mavLow: 4, mavHigh: 12, mrv: 16 },
  lats:         { mv: 2, mev: 3, mavLow: 4, mavHigh: 12, mrv: 16 },
  upper_back:   { mv: 2, mev: 3, mavLow: 4, mavHigh: 12, mrv: 16 },
  lower_back:   { mv: 1, mev: 2, mavLow: 3, mavHigh: 8,  mrv: 12 },
  front_delts:  { mv: 1, mev: 1, mavLow: 2, mavHigh: 8,  mrv: 12 },
  side_delts:   { mv: 1, mev: 2, mavLow: 3, mavHigh: 10, mrv: 14 },
  rear_delts:   { mv: 1, mev: 1, mavLow: 2, mavHigh: 6,  mrv: 10 },
  biceps:       { mv: 0, mev: 0, mavLow: 0, mavHigh: 6,  mrv: 10 },
  triceps:      { mv: 1, mev: 2, mavLow: 3, mavHigh: 8,  mrv: 12 },
  forearms:     { mv: 0, mev: 0, mavLow: 0, mavHigh: 4,  mrv: 8  },
  quads:        { mv: 2, mev: 3, mavLow: 4, mavHigh: 12, mrv: 16 },
  hamstrings:   { mv: 1, mev: 2, mavLow: 3, mavHigh: 8,  mrv: 12 },
  glutes:       { mv: 2, mev: 3, mavLow: 4, mavHigh: 12, mrv: 16 },
  calves:       { mv: 0, mev: 0, mavLow: 0, mavHigh: 8,  mrv: 12 },
  core:         { mv: 0, mev: 0, mavLow: 4, mavHigh: 10, mrv: 14 },
  adductors:    { mv: 0, mev: 0, mavLow: 0, mavHigh: 6,  mrv: 10 },
  abductors:    { mv: 0, mev: 0, mavLow: 0, mavHigh: 6,  mrv: 10 },
  rotator_cuff: { mv: 0, mev: 0, mavLow: 2, mavHigh: 6,  mrv: 10 },
  neck:         { mv: 0, mev: 0, mavLow: 2, mavHigh: 6,  mrv: 10 },
};
```

- [ ] **Step 4: Update scoreVolume in volume.ts to accept optional style**

In `src/lib/analysis/volume.ts`, update imports and `scoreVolume`:

```ts
import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, MuscleVolumeResult, Severity, TrainingStyle } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS, STRENGTH_VOLUME_LANDMARKS, STRENGTH_PRIMARY_MUSCLES } from "./thresholds";
import { mapMuscleExpanded, getEffectiveSets } from "./muscles";

// ... (countWeeklyVolume unchanged) ...

export function scoreVolume(
  volumes: Map<MuscleGroup, number>,
  style?: TrainingStyle,
): MuscleVolumeResult[] {
  return ALL_MUSCLE_GROUPS.map((muscle) => {
    const sets = volumes.get(muscle) ?? 0;
    const landmarks = getLandmarks(muscle, style);
    const { severity, label } = classifyVolume(sets, landmarks);
    return { muscle, effectiveSets: Math.round(sets * 10) / 10, severity, label, landmarks };
  });
}

function getLandmarks(muscle: MuscleGroup, style?: TrainingStyle): (typeof VOLUME_LANDMARKS)[MuscleGroup] {
  if (
    (style === "strength" || style === "olympic_lifting" || style === "powerbuilding") &&
    STRENGTH_PRIMARY_MUSCLES.has(muscle)
  ) {
    return STRENGTH_VOLUME_LANDMARKS[muscle];
  }
  return VOLUME_LANDMARKS[muscle];
}

function classifyVolume(
  sets: number,
  lm: (typeof VOLUME_LANDMARKS)[MuscleGroup],
): { severity: Severity; label: string } {
  if (sets === 0) return { severity: "green", label: "Not trained" };
  if (sets < lm.mv) return { severity: "red", label: "Below maintenance" };
  if (sets < lm.mev) return { severity: "yellow", label: "Maintenance only" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/lib/analysis/volume.test.ts --no-coverage
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/thresholds.ts src/lib/analysis/volume.ts src/lib/analysis/volume.test.ts
git commit -m "feat: add STRENGTH_VOLUME_LANDMARKS and goal-conditional scoreVolume"
```

---

### Task 10: Wire style detection into analyzeProgram

**Files:**
- Modify: `src/lib/analysis/analyze.ts`
- Modify: `src/lib/analysis/analyze.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/analysis/analyze.test.ts`:

```ts
import { strengthProgram } from "./fixtures";

// (below existing tests)
it("includes style in AnalysisResult", () => {
  const result = analyzeProgram(balancedProgram);
  expect(result.style).toBeDefined();
  expect(result.style.primary).toBeTruthy();
  expect(typeof result.style.confidence).toBe("number");
});

it("detects strength style for strengthProgram", () => {
  const result = analyzeProgram(strengthProgram);
  expect(result.style.primary).toBe("strength");
});

it("respects program.trainingStyle override when set", () => {
  const overriddenProgram = { ...balancedProgram, trainingStyle: "strength" as const };
  const result = analyzeProgram(overriddenProgram);
  expect(result.style.primary).toBe("strength");
  expect(result.style.confidence).toBe(1.0);  // user override = full confidence
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/analyze.test.ts --no-coverage
```

Expected: `style` undefined tests fail; TypeScript errors on `result.style`.

- [ ] **Step 3: Update analyze.ts to wire style detection**

Replace `src/lib/analysis/analyze.ts`:

```ts
import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult, MuscleGroup, StyleDetection } from "./types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { analyzeSessions } from "./session";
import { analyzeBalance } from "./balance";
import { analyzePeriodization } from "./periodization";
import { detectStyle } from "./detectStyle";
import {
  computeOverallScore,
  scoreVolumeDimension,
  scoreSessionDimension,
  scoreBalanceDimension,
  scorePeriodizationDimension,
} from "./score";

function mergeMaxVolumes(maps: Map<MuscleGroup, number>[]): Map<MuscleGroup, number> {
  const result = new Map<MuscleGroup, number>();
  for (const map of maps)
    for (const [muscle, sets] of map)
      result.set(muscle, Math.max(result.get(muscle) ?? 0, sets));
  return result;
}

export function analyzeProgram(program: ProgramDocument): AnalysisResult {
  const days = getRenderableDays(program);

  // Resolve training style: user override takes precedence over inference
  const style: StyleDetection = program.trainingStyle
    ? { primary: program.trainingStyle, confidence: 1.0 }
    : detectStyle(days);

  const weekNums = [...new Set(days.map((d) => d.weekNumber ?? 1))];
  const weeklyVolume = mergeMaxVolumes(weekNums.map((w) => countWeeklyVolume(days, w)));
  const muscleVolumes = scoreVolume(weeklyVolume, style.primary);
  const sessions = analyzeSessions(days);
  const balance = analyzeBalance(days);
  const periodization = analyzePeriodization(days);

  const dimensions = {
    volume: scoreVolumeDimension(muscleVolumes),
    session: scoreSessionDimension(sessions),
    balance: scoreBalanceDimension(balance),
    periodization: scorePeriodizationDimension(periodization),
  };

  const overall = computeOverallScore(dimensions);

  const warnings = [
    ...muscleVolumes
      .filter((r) => r.severity !== "green")
      .map((r) => ({
        severity: r.severity,
        dimension: "volume" as const,
        message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
      })),
    ...sessions.flatMap((s) => s.warnings),
    ...balance.warnings,
    ...periodization.warnings,
  ];

  return { overall, style, dimensions, muscleVolumes, sessions, balance, periodization, warnings };
}

function formatMuscleName(muscle: string): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 4: Run all analysis tests**

```bash
npx jest src/lib/analysis/ --no-coverage
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/analyze.ts src/lib/analysis/analyze.test.ts
git commit -m "feat: wire style detection into analyzeProgram; apply goal-conditional volume landmarks"
```

---

### Task 11: Olympic lifting catalog enrichment (snatch / C&J)

**Files:**
- Modify: `src/lib/catalog/exercises.generated.json`

Snatch and C&J variants currently have empty or wrong `movementPatterns` and `tags`, so OL programs show their primary competition movements as absent from movement pattern coverage.

- [ ] **Step 1: Identify all snatch and C&J entries**

```bash
python3 -c "
import json
with open('src/lib/catalog/exercises.generated.json') as f:
    data = json.load(f)
keywords = ['snatch', 'clean', 'jerk']
for ex in data:
    name = ex.get('name','').lower()
    if any(k in name for k in keywords):
        print(ex.get('id'), '|', ex.get('movementPatterns'), '|', ex.get('tags'))
"
```

Review the output. For each entry, determine the appropriate patterns:
- Snatch variants: `movementPatterns` should include `["hip_hinge", "vertical_pull"]`; add `"squat"` for squat-style snatch (power snatch does NOT squat under). `tags` should include `["compound"]`.
- Clean variants: `movementPatterns`: `["hip_hinge", "vertical_pull"]`. `tags`: `["compound"]`.
- Jerk variants: `movementPatterns`: `["vertical_push"]`. `tags`: `["compound"]`.
- Clean and Jerk combined: `movementPatterns`: `["hip_hinge", "vertical_pull", "vertical_push"]`. `tags`: `["compound"]`.

- [ ] **Step 2: Update each entry**

For each entry identified, update `movementPatterns` and `tags` in `src/lib/catalog/exercises.generated.json`. Example for `snatch`:

```json
{
  "id": "snatch",
  "movementPatterns": ["hip_hinge", "vertical_pull"],
  "tags": ["compound", "strength", "expert"]
}
```

Example for `power-snatch`:
```json
{
  "id": "power-snatch",
  "movementPatterns": ["hip_hinge", "vertical_pull"],
  "tags": ["compound", "strength", "expert"]
}
```

Example for `clean-and-jerk`:
```json
{
  "id": "clean-and-jerk",
  "movementPatterns": ["hip_hinge", "vertical_pull", "vertical_push"],
  "tags": ["compound", "strength", "expert"]
}
```

- [ ] **Step 3: Verify with a quick check**

```bash
python3 -c "
import json
with open('src/lib/catalog/exercises.generated.json') as f:
    data = json.load(f)
keywords = ['snatch', 'clean', 'jerk']
for ex in data:
    name = ex.get('name','').lower()
    if any(k in name for k in keywords):
        mp = ex.get('movementPatterns', [])
        tags = ex.get('tags', [])
        if not mp or 'compound' not in tags:
            print('STILL MISSING:', ex.get('id'), '|', mp, '|', tags)
        else:
            print('OK:', ex.get('id'))
"
```

Expected: all entries print OK.

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/analysis/ --no-coverage
```

Expected: all pass (catalog changes only affect catalog lookups, no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/exercises.generated.json
git commit -m "fix: add movementPatterns and tags to snatch/clean/jerk catalog entries"
```

---

### Task 12: TrainingStyle selector UI in ProgramDetailClient

**Files:**
- Modify: `src/components/workout/ProgramDetailClient.tsx`

Adds a compact style selector below the program title. When changed, persists `trainingStyle` to the program document and triggers re-analysis.

- [ ] **Step 1: Update ProgramDetailClient.tsx**

Replace `src/components/workout/ProgramDetailClient.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Map } from "lucide-react";
import { getRenderableDays } from "@/lib/programs/overrides";
import type { ProgramDocument, TrainingStyle } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";
import { WorkoutView } from "./WorkoutView";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { RoutineAnalysisCard } from "@/components/analysis/RoutineAnalysisCard";
import { LlmAnalysisSheet } from "@/components/analysis/LlmAnalysisSheet";

const STYLE_OPTIONS: { value: TrainingStyle | "auto"; label: string }[] = [
  { value: "auto",            label: "Auto-detect" },
  { value: "strength",        label: "Strength / Powerlifting" },
  { value: "hypertrophy",     label: "Hypertrophy" },
  { value: "olympic_lifting", label: "Olympic Lifting" },
  { value: "powerbuilding",   label: "Powerbuilding" },
  { value: "mixed",           label: "Mixed / General" },
];

export function ProgramDetailClient({ id }: { id: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  const handleStyleChange = useCallback(
    async (value: TrainingStyle | "auto") => {
      if (!program) return;
      const updated: ProgramDocument = {
        ...program,
        trainingStyle: value === "auto" ? undefined : value,
        updatedAt: new Date().toISOString(),
      };
      await programRepo.put(updated);
      setProgram(updated);
    },
    [program],
  );

  const displayAnalysis = useMemo(() => {
    if (!program) return null;
    const start = performance.now();
    const result = analyzeProgram(program);
    const durationMs = Math.round(performance.now() - start);
    return toDisplayAnalysis(result, durationMs);
  }, [program]);

  if (!program) return <p className="muted">Program not found locally.</p>;

  const days = getRenderableDays(program);
  const currentStyle = program.trainingStyle ?? "auto";

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Link
          to="/programs"
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--fg-3)", textDecoration: "none",
          }}
        >
          <ChevronLeft size={12} /> Routines
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{program.title}</h1>
          <p className="muted">{days.length} rendered day(s)</p>
        </div>
        <div className="flex gap-2">
          <Link className="button secondary" to={`/programs/${id}/edit`}>Edit</Link>
          <Link to={`/programs/${id}/map`} className="button"
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Map size={14} aria-hidden /> Map
          </Link>
          <Link className="button" to={`/programs/${id}/log`}>Log</Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor="training-style-select"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", whiteSpace: "nowrap" }}
        >
          Analysis style
        </label>
        <select
          id="training-style-select"
          value={currentStyle}
          onChange={(e) => handleStyleChange(e.target.value as TrainingStyle | "auto")}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            background: "var(--surface-2)", color: "var(--fg-1)",
            border: "1px solid var(--border)", borderRadius: 4,
            padding: "3px 6px", cursor: "pointer",
          }}
        >
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {displayAnalysis && (
        <>
          <RoutineAnalysisCard analysis={displayAnalysis} onOpenPrompt={() => setPromptOpen(true)} />
          <LlmAnalysisSheet
            open={promptOpen} onClose={() => setPromptOpen(false)}
            analysis={displayAnalysis} programTitle={program.title}
          />
        </>
      )}

      {days.map((day) => (
        <WorkoutView key={day.id} program={program} day={day} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 3: Run the app and test manually**

Start the dev server:
```bash
npm run dev
```

Open a program's detail page. Verify:
- The "Analysis style" selector appears below the program title
- Changing from "Auto-detect" to "Strength / Powerlifting" causes the analysis card to re-render
- On a program with no leg/arm work: switching to strength style should change biceps from yellow/red to the "Not trained" display
- The selection persists on page reload

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/ProgramDetailClient.tsx
git commit -m "feat: add training style selector to program detail page"
```

---

### Task 13: Frequency analysis (informational)

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/analyze.ts`
- Modify: `src/lib/analysis/toDisplayAnalysis.ts`

Adds per-muscle training frequency (distinct days per week) to `AnalysisResult` as informational metadata with no score impact.

- [ ] **Step 1: Add MuscleFrequency to types**

In `src/lib/analysis/types.ts`, add to `AnalysisResult`:

```ts
export type AnalysisResult = {
  overall: DimensionScore;
  style: StyleDetection;
  muscleFrequency: Partial<Record<MuscleGroup, number>>;  // add this
  dimensions: { ... };
  // ... rest unchanged
};
```

- [ ] **Step 2: Implement computeMuscleFrequency in analyze.ts**

Add a new function and wire it in:

```ts
function computeMuscleFrequency(days: ProgramDay[]): Partial<Record<MuscleGroup, number>> {
  // Count distinct day IDs per muscle per week
  // We use week 1 (or first detected week) as the representative week
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
  const firstWeek = weeks[0];
  const weekDays = days.filter((d) => (d.weekNumber ?? 1) === firstWeek);

  const muscleDays = new Map<MuscleGroup, Set<string>>();

  for (const day of weekDays) {
    for (const section of day.sections)
      for (const group of section.groups)
        for (const exercise of group.exercises)
          for (const label of exercise.tags.primary) {
            const muscles = mapMuscleExpanded(label);
            for (const muscle of muscles) {
              if (!muscleDays.has(muscle)) muscleDays.set(muscle, new Set());
              muscleDays.get(muscle)!.add(day.id);
            }
          }
  }

  const result: Partial<Record<MuscleGroup, number>> = {};
  for (const [muscle, daySet] of muscleDays) result[muscle] = daySet.size;
  return result;
}
```

In `analyzeProgram`, add:
```ts
const muscleFrequency = computeMuscleFrequency(days);
// ... (add mapMuscleExpanded to imports)
return { overall, style, muscleFrequency, dimensions, muscleVolumes, sessions, balance, periodization, warnings };
```

Add import: `import { mapMuscleExpanded, ... } from "./muscles";` (already imported via volume — check it's available or add directly).

- [ ] **Step 3: Surface frequency in toDisplayAnalysis (informational note)**

In `src/lib/analysis/toDisplayAnalysis.ts`, update `MuscleDisplay` usage to attach frequency:

In `types.ts`, add `frequencyPerWeek?: number` to `MuscleDisplay`:
```ts
export type MuscleDisplay = {
  group: string;
  sets: number;
  mev: number;
  mavLo: number;
  mavHi: number;
  mrv: number;
  status: "green" | "yellow" | "red";
  flag?: string;
  frequencyPerWeek?: number;  // add this
};
```

In `toDisplayAnalysis.ts`, update the `muscles` mapping:
```ts
const muscles: MuscleDisplay[] = result.muscleVolumes.map((mv): MuscleDisplay => ({
  group: MUSCLE_LABEL[mv.muscle] ?? capitalize(mv.muscle.replace(/_/g, " ")),
  sets: mv.effectiveSets,
  mev: mv.landmarks.mev,
  mavLo: mv.landmarks.mavLow,
  mavHi: mv.landmarks.mavHigh,
  mrv: mv.landmarks.mrv,
  status: mv.severity,
  flag: mv.effectiveSets > mv.landmarks.mrv ? "above_mrv"
      : mv.effectiveSets < mv.landmarks.mev && mv.effectiveSets > 0 ? "below_mev"
      : undefined,
  frequencyPerWeek: result.muscleFrequency[mv.muscle],
}));
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/analyze.ts src/lib/analysis/toDisplayAnalysis.ts
git commit -m "feat: add per-muscle training frequency to AnalysisResult"
```

---

### Task 14: Expanded periodization pattern detection

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/periodization.ts`
- Modify: `src/lib/analysis/score.ts`
- Modify: `src/lib/analysis/periodization.test.ts`

Adds detection of block, DUP, and conjugate periodization. Suppresses the static-volume penalty when block periodization is detected.

- [ ] **Step 1: Add periodizationStyle to PeriodizationResult**

In `src/lib/analysis/types.ts`, update `PeriodizationResult`:

```ts
export type PeriodizationStyle =
  | "linear"
  | "wave"
  | "block_intensity"  // volume stable, intensity increases
  | "dup"              // multiple rep ranges for same muscle in a week
  | "conjugate"        // max effort + dynamic effort sections present
  | "static"
  | "unknown";

export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  periodizationStyle: PeriodizationStyle;
  deloadDetected: boolean;
  peakWeekDetected: boolean;
  warnings: Warning[];
};
```

- [ ] **Step 2: Write failing tests**

Add to `src/lib/analysis/periodization.test.ts`:

```ts
it("detects linear periodization in multiWeekProgram", () => {
  const result = analyzePeriodization(multiWeekProgram.days);
  // multiWeekProgram has weeks 1→2→3 increasing then week 4 deload
  expect(["linear", "wave"]).toContain(result.periodizationStyle);
});

it("detects block_intensity when volume stable but load increases", () => {
  // Build a 3-week program with constant set count but increasing %1RM
  const blockProgram: ProgramDay[] = [
    {
      id: "b1", dayNumber: 1, weekNumber: 1, title: "W1",
      sections: [{ id: "s1", type: "strength", name: "Main", groups: [{
        id: "g1", type: "single", exercises: [{
          id: "e1", name: "Squat", sets: 4, reps: "5", load: "75% 1RM",
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      }] }],
    },
    {
      id: "b2", dayNumber: 1, weekNumber: 2, title: "W2",
      sections: [{ id: "s2", type: "strength", name: "Main", groups: [{
        id: "g2", type: "single", exercises: [{
          id: "e2", name: "Squat", sets: 4, reps: "3", load: "82% 1RM",
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      }] }],
    },
    {
      id: "b3", dayNumber: 1, weekNumber: 3, title: "W3",
      sections: [{ id: "s3", type: "strength", name: "Main", groups: [{
        id: "g3", type: "single", exercises: [{
          id: "e3", name: "Squat", sets: 4, reps: "1", load: "90% 1RM",
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      }] }],
    },
  ];
  const result = analyzePeriodization(blockProgram);
  expect(result.periodizationStyle).toBe("block_intensity");
});

it("block_intensity does not receive static volume warning", () => {
  const blockDays: ProgramDay[] = [
    {
      id: "b1", dayNumber: 1, weekNumber: 1, title: "W1",
      sections: [{ id: "s1", type: "strength", name: "Main", groups: [{
        id: "g1", type: "single", exercises: [{
          id: "e1", name: "Squat", sets: 4, reps: "5", load: "75% 1RM",
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      }] }],
    },
    {
      id: "b2", dayNumber: 1, weekNumber: 2, title: "W2",
      sections: [{ id: "s2", type: "strength", name: "Main", groups: [{
        id: "g2", type: "single", exercises: [{
          id: "e2", name: "Squat", sets: 4, reps: "3", load: "82% 1RM",
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      }] }],
    },
  ];
  const result = analyzePeriodization(blockDays);
  const staticWarning = result.warnings.find((w) => w.message.includes("flat"));
  expect(staticWarning).toBeUndefined();
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/lib/analysis/periodization.test.ts --no-coverage
```

Expected: new tests fail.

- [ ] **Step 4: Update analyzePeriodization in periodization.ts**

Add the `detectPeriodizationStyle` function and `periodizationStyle` field. Key logic:

```ts
function detectPeriodizationStyle(
  weeklyVolumes: number[],
  weeklyIntensity: { avgPct: number | null; avgRpe: number | null; avgReps: number | null }[],
  days: ProgramDay[],
): PeriodizationStyle {
  if (weeklyVolumes.length <= 1) return "unknown";

  // DUP: multiple rep ranges for same muscle within a single week
  const isDup = detectDup(days);
  if (isDup) return "dup";

  // Conjugate: both "strength" (max effort) and "power"/"explosive" (dynamic effort) sections present
  const sectionTypes = new Set(days.flatMap((d) => d.sections.map((s) => s.type)));
  if (sectionTypes.has("strength") && (sectionTypes.has("power") || sectionTypes.has("explosive"))) {
    return "conjugate";
  }

  // Block intensity: volume stable (all diffs < 2 sets) but average %1RM or avg reps are progressing
  const volDiffs = weeklyVolumes.slice(1).map((v, i) => Math.abs(v - weeklyVolumes[i]));
  const volumeStable = volDiffs.every((d) => d <= 2);
  if (volumeStable && weeklyVolumes.length >= 2) {
    const pcts = weeklyIntensity.map((w) => w.avgPct).filter((p): p is number => p !== null);
    const reps = weeklyIntensity.map((w) => w.avgReps).filter((r): r is number => r !== null);
    const pctIncreasing = pcts.length >= 2 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]);
    const repsDecreasing = reps.length >= 2 && reps.every((r, i) => i === 0 || r <= reps[i - 1]);
    if (pctIncreasing || repsDecreasing) return "block_intensity";
  }

  // Linear: consistent volume increase
  const allIncrease = weeklyVolumes.slice(1).every((v, i) => v >= weeklyVolumes[i]);
  if (allIncrease) return "linear";

  const allDecrease = weeklyVolumes.slice(1).every((v, i) => v <= weeklyVolumes[i]);
  if (allDecrease) return "static";  // decreasing pattern is separate, handled by volumePattern

  return "wave";
}

function detectDup(days: ProgramDay[]): boolean {
  // Within each week, check if the same primary muscle appears with different rep ranges
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))];
  for (const wk of weeks) {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    const muscleRepMids = new Map<string, Set<number>>();
    for (const day of weekDays)
      for (const section of day.sections)
        for (const group of section.groups)
          for (const exercise of group.exercises) {
            const mid = repMidpoint(exercise.reps);
            if (mid === null) continue;
            for (const label of exercise.tags.primary) {
              if (!muscleRepMids.has(label)) muscleRepMids.set(label, new Set());
              muscleRepMids.get(label)!.add(mid);
            }
          }
    for (const [, mids] of muscleRepMids) {
      if (mids.size >= 2) return true;
    }
  }
  return false;
}
```

Call this in `analyzePeriodization` and include in the return. Also update the static-volume warning to be suppressed for `block_intensity` and `conjugate`:

```ts
if (
  volumePattern === "static" &&
  weeks.length > 1 &&
  periodizationStyle !== "block_intensity" &&
  periodizationStyle !== "conjugate"
) {
  warnings.push({ ... "Volume is flat..." ... });
}
```

Return value:
```ts
return { weeksDetected: weeks.length, volumePattern, periodizationStyle, deloadDetected, peakWeekDetected, warnings };
```

- [ ] **Step 5: Update scorePeriodizationDimension to suppress static penalty for block_intensity**

In `src/lib/analysis/score.ts`:

```ts
export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  let score = 100;
  if (!result.deloadDetected && !result.peakWeekDetected && result.weeksDetected >= 4) score -= 20;
  if (
    result.volumePattern === "static" &&
    result.weeksDetected > 1 &&
    result.periodizationStyle !== "block_intensity" &&
    result.periodizationStyle !== "conjugate"
  ) {
    score -= 20;
  }
  score -= result.warnings.filter((w) => w.severity === "red").length * 15;
  score -= result.warnings.filter((w) => w.severity === "yellow").length * 5;
  score = Math.max(0, Math.min(100, score));
  return { name: "Periodization", score, grade: scoreToGrade(score) };
}
```

- [ ] **Step 6: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/periodization.ts src/lib/analysis/score.ts src/lib/analysis/periodization.test.ts
git commit -m "feat: add periodization style detection (block, DUP, conjugate, linear); suppress static penalty for block/conjugate"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Remove movement pattern severity warnings | Task 1 |
| Fix front-squat catalog entry | Task 2 |
| Remove single-week -30 penalty | Task 3 |
| Zero-set muscles → "Not trained", excluded from score | Task 4 |
| Fuzzy load parser (parseLoad) | Task 5 |
| Peak week detection using load + reps | Task 6 |
| peakWeekDetected in PeriodizationResult | Task 6 |
| TrainingStyle type + ProgramDocument field | Task 7 |
| StyleDetection in AnalysisResult | Task 7 |
| detectStyle utility | Task 8 |
| STRENGTH_VOLUME_LANDMARKS | Task 9 |
| Goal-conditional scoreVolume | Task 9 |
| Wire style into analyzeProgram | Task 10 |
| User override respects program.trainingStyle | Task 10 |
| Snatch/C&J catalog enrichment | Task 11 |
| trainingStyle UI selector | Task 12 |
| Frequency analysis (muscleFrequency) | Task 13 |
| Expanded periodization detection (block/DUP/conjugate) | Task 14 |
| Static-volume penalty suppressed for block/conjugate | Task 14 |

All spec requirements are covered. ✓

### Type consistency check

- `parseLoad` returns `ParsedLoad` — used in `periodization.ts` and `detectStyle.ts` ✓
- `scoreVolume(volumes, style?)` — style is `TrainingStyle | undefined`, passed from `analyzeProgram` as `style.primary` ✓
- `PeriodizationResult.peakWeekDetected` — added in Task 6, read in `score.ts` Task 14 ✓
- `PeriodizationResult.periodizationStyle` — added in Task 14, read in `score.ts` Task 14 ✓
- `AnalysisResult.style` — added in Task 7, set in Task 10 ✓
- `AnalysisResult.muscleFrequency` — added in Task 13 ✓
- `MuscleDisplay.frequencyPerWeek` — added in Task 13 ✓
- `TrainingStyle` defined in `programs/types.ts`, re-exported from `analysis/types.ts` — used in `ProgramDetailClient.tsx` via programs import ✓
