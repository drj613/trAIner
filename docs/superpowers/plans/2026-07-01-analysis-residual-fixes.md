# Analysis Engine Residual Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five residual findings from the 2026-07-01 analysis-engine review: multi-week fingerprint mislabel, peak-week misclassification, full-body volume inflation, LLM-sheet/engine table divergence + unkept JSON promise, and two display-coherence gaps.

**Architecture:** All changes stay inside the existing deterministic analysis engine (`src/lib/analysis/`) and its one UI consumer (`src/components/analysis/LlmAnalysisSheet.tsx`). No new dependencies, no data-model changes. The only new file is `src/lib/analysis/sheetPrompt.ts`, which extracts the LLM prompt builder out of the component so it can be unit-tested and generated from `thresholds.ts` (single source of truth).

**Tech Stack:** TypeScript, React, Jest (run via `bun run test`), Vite. App must remain a serverless static build (GitHub Pages) — nothing here touches that.

**Context for the worker:**
- The engine analyzes a `ProgramDocument` (see `src/lib/programs/types.ts`). A program has `days`, each with a `weekNumber`; multi-week programs materialize a day entry per week.
- Test fixtures live in `src/lib/analysis/fixtures.ts` (`balancedProgram` = 3 days × 1 week; `multiWeekProgram` = 4 weeks × 1 day/week).
- Background (do NOT re-derive): `.reviews/2026-06-19/00-analysis-framework-evidence-audit.md`.
- Tests run with `bun run test <path>` (jest treats the positional arg as a path regex). Run `bun run lint` before each commit.
- NOTE: some existing test literals (e.g. `makeResult()` in `toDisplayAnalysis.test.ts`) omit required fields like `peakDetected` — jest transpiles without type-checking. New code you write must still satisfy `tsc` for the Vite build; verify with `bun run build` at the end.

---

### Task 1: Fingerprint shows days-per-week, not total days

**Problem:** `toDisplayAnalysis.ts` builds the fingerprint from `result.sessions.length`, which counts day entries across ALL weeks. A 4-week × 4-day program displays "16d/wk" / "16-day program".

**Files:**
- Modify: `src/lib/analysis/toDisplayAnalysis.ts` (fingerprint block, ~line 136)
- Test: `src/lib/analysis/toDisplayAnalysis.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `describe("toDisplayAnalysis", ...)` block in `src/lib/analysis/toDisplayAnalysis.test.ts`. `multiWeekProgram` is already exported from `./fixtures`; `analyzeProgram` is already imported in this file.

```ts
  it("fingerprint uses days per week, not total days across weeks", () => {
    // multiWeekProgram: 4 weeks × 1 day/week = 4 session entries, but 1 day/wk
    const d = toDisplayAnalysis(analyzeProgram(multiWeekProgram), 0);
    expect(d.fingerprint.primary).toBe("1d/wk");
    expect(d.fingerprint.label).toBe("1-day program");
  });

  it("fingerprint is unchanged for single-week programs", () => {
    const d = toDisplayAnalysis(analyzeProgram(imbalancedProgram), 0);
    expect(d.fingerprint.primary).toBe("2d/wk");
    expect(d.fingerprint.label).toBe("2-day program");
  });
```

Also add `multiWeekProgram` to the existing fixtures import:

```ts
import { imbalancedProgram, multiWeekProgram } from "./fixtures";
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun run test src/lib/analysis/toDisplayAnalysis.test.ts`
Expected: the multi-week test FAILS with received `"4d/wk"`; the single-week test passes.

- [ ] **Step 3: Implement the fix**

In `src/lib/analysis/toDisplayAnalysis.ts`, inside `toDisplayAnalysis`, replace the fingerprint block:

```ts
  // sessions has one entry per day across ALL weeks; divide by detected weeks
  // to report training days per week. weeksDetected is always >= 1.
  const daysPerWeek = Math.max(
    1,
    Math.round(result.sessions.length / Math.max(1, result.periodization.weeksDetected)),
  );

  return {
    durationMs,
    overall: { score: result.overall.score, grade: result.overall.grade },
    fingerprint: {
      primary: `${daysPerWeek}d/wk`,
      secondary: null,
      label: `${daysPerWeek}-day program`,
    },
```

(Only the `fingerprint` object and the new `daysPerWeek` const change; the rest of the return stays as-is.)

- [ ] **Step 4: Run the file's tests — all pass**

Run: `bun run test src/lib/analysis/toDisplayAnalysis.test.ts`
Expected: PASS (all tests, including the pre-existing "maps fingerprint" test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/toDisplayAnalysis.ts src/lib/analysis/toDisplayAnalysis.test.ts
git commit -m "fix(analysis): fingerprint reports days/week, not total days across weeks"
```

---

### Task 2: Peak-week detection weighs sets, and explicit light loads veto the low-rep heuristic

**Problem (2 parts):**
1. `weekIsHeavy` (`src/lib/analysis/periodization.ts:25-29`) requires ≥50% of *exercises* to be heavy. A realistic peak week (2 heavy main lifts + 3 light accessories) is 40% by exercise count → misclassified as a deload. Sets are the right denominator: in a volume-dropped final week the heavy main lifts dominate set count.
2. `exerciseIsHeavy` falls through to "rep midpoint ≤ 3 → heavy" even when the load string explicitly says the weight is light. A deload prescribed as "3×3 @ 60%" reads as heavy. An explicit sub-85% `%1RM` should veto the reps-only fallback.

**Files:**
- Modify: `src/lib/analysis/periodization.ts:15-29`
- Test: `src/lib/analysis/periodization.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/analysis/periodization.test.ts`. First add a multi-exercise week builder next to the existing `squatWeek` helper (same file, top level):

```ts
type ExSpec = { name: string; sets: number; reps: string; load?: string };

function weekOf(weekNumber: number, exercises: ExSpec[]): ProgramDay {
  return {
    id: `w${weekNumber}`, dayNumber: 1, weekNumber, title: `Week ${weekNumber}`,
    sections: [{
      id: `s${weekNumber}`, type: "strength", name: "Main",
      groups: exercises.map((e, i) => ({
        id: `g${weekNumber}-${i}`, type: "single" as const,
        exercises: [{
          id: `e${weekNumber}-${i}`, name: e.name, sets: e.sets, reps: e.reps, load: e.load,
          tags: { primary: ["quads", "glutes"], secondary: [], incidental: [], modifiers: [] },
        }],
      })),
    }],
  };
}
```

Then the tests:

```ts
  it("classifies a peak week as peak when heavy SETS dominate but heavy exercises are a minority", () => {
    const build = (wk: number) => weekOf(wk, [
      { name: "Back Squat", sets: 5, reps: "5", load: "75%" },
      { name: "Bench Press", sets: 5, reps: "5", load: "72%" },
      { name: "Leg Press", sets: 4, reps: "10-12" },
      { name: "Leg Curl", sets: 4, reps: "10-12" },
      { name: "Calf Raise", sets: 4, reps: "12-15" },
    ]);
    const peakWeek = weekOf(4, [
      // 15 total sets (build weeks have 22, so volume "dropped": 15 <= 22×0.7).
      // 9 heavy sets across 2 of 5 exercises: 40% of exercises (old code says
      // deload) but 60% of sets (new code says peak).
      { name: "Back Squat", sets: 5, reps: "1-2", load: "92%" },
      { name: "Bench Press", sets: 4, reps: "1-2", load: "90%" },
      { name: "Leg Press", sets: 2, reps: "10-12" },
      { name: "Leg Curl", sets: 2, reps: "10-12" },
      { name: "Calf Raise", sets: 2, reps: "12-15" },
    ]);
    const r = analyzePeriodization([build(1), build(2), build(3), peakWeek]);
    expect(r.peakDetected).toBe(true);
    expect(r.deloadDetected).toBe(false);
  });

  it("classifies light triples in a final week as a deload, not a peak", () => {
    const build = (wk: number, sets: number) => weekOf(wk, [
      { name: "Back Squat", sets, reps: "5", load: "75%" },
      { name: "Bench Press", sets, reps: "5", load: "72%" },
    ]);
    const deloadWeek = weekOf(4, [
      // explicit 60% load must veto the "reps <= 3 means heavy" fallback
      { name: "Back Squat", sets: 3, reps: "3", load: "60%" },
      { name: "Bench Press", sets: 3, reps: "3", load: "60%" },
    ]);
    const r = analyzePeriodization([build(1, 5), build(2, 5), build(3, 5), deloadWeek]);
    expect(r.deloadDetected).toBe(true);
    expect(r.peakDetected).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/analysis/periodization.test.ts`
Expected: both new tests FAIL (first: `peakDetected` received `false`; second: `deloadDetected` received `false`). All pre-existing tests still pass.

- [ ] **Step 3: Implement the fix**

In `src/lib/analysis/periodization.ts`, first add `getEffectiveSets` availability — it is already imported at the top of the file (`import { getEffectiveSets, repMidpoint } from "./muscles";`). Replace `exerciseIsHeavy` and `weekIsHeavy`:

```ts
function exerciseIsHeavy(exercise: ProgramExercise): boolean {
  const load = parseLoad(exercise.load);
  if (load.pct1rm !== undefined && load.pct1rm >= 85) return true;
  if (load.repMax !== undefined && load.repMax <= 3) return true;
  if (load.rpe !== undefined && load.rpe >= 9) return true;
  // An explicit sub-85% load means not heavy even at low reps —
  // light triples in a deload must not read as heavy singles.
  if (load.pct1rm !== undefined) return false;
  const mid = repMidpoint(exercise.reps);
  if (mid !== null && mid <= 3) return true;
  return false;
}

function weekIsHeavy(weekDays: ProgramDay[]): boolean {
  // Weigh by sets, not exercise count: in a volume-cut final week the heavy
  // main lifts carry most sets even when accessories outnumber them.
  let totalSets = 0;
  let heavySets = 0;
  for (const exercise of weekExercises(weekDays)) {
    const sets = getEffectiveSets(exercise);
    totalSets += sets;
    if (exerciseIsHeavy(exercise)) heavySets += sets;
  }
  if (totalSets === 0) return false;
  return heavySets / totalSets >= 0.5;
}
```

- [ ] **Step 4: Run the file's tests — all pass**

Run: `bun run test src/lib/analysis/periodization.test.ts`
Expected: PASS, including the pre-existing "classifies a heavy low-volume final week as a peak" and "detects deload week" tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/periodization.ts src/lib/analysis/periodization.test.ts
git commit -m "fix(analysis): peak detection weighs sets not exercises; explicit light %1RM vetoes low-rep heuristic"
```

---

### Task 3: Discount "full body" muscle expansion in volume counting

**Problem:** `mapMuscleExpanded("full body")` (`src/lib/analysis/muscles.ts:54-61`) expands to 6 muscles, and `addMuscleVolume` (`src/lib/analysis/volume.ts:30-42`) credits each at the full tier weight. One 3-set thruster tagged `primary: ["full body"]` generates 18 effective sets. Credit expanded full-body muscles at half the tier weight.

**Files:**
- Modify: `src/lib/analysis/volume.ts:30-42`
- Test: `src/lib/analysis/volume.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `describe("countWeeklyVolume", ...)` block in `src/lib/analysis/volume.test.ts`. Add the import at the top:

```ts
import type { ProgramDay } from "@/lib/programs/types";
```

Then the test:

```ts
  it("credits 'full body' expansion at half the tier weight", () => {
    const fullBodyDay: ProgramDay = {
      id: "fb-1", dayNumber: 1, weekNumber: 1, title: "Conditioning",
      sections: [{
        id: "fb-s1", type: "conditioning", name: "Metcon",
        groups: [{
          id: "fb-g1", type: "single",
          exercises: [{
            id: "fb-e1", name: "Thruster", sets: 4, reps: "10",
            tags: { primary: ["full body"], secondary: [], incidental: [], modifiers: [] },
          }],
        }],
      }],
    };
    const volumes = countWeeklyVolume([fullBodyDay], 1);
    // 4 sets × 1.0 primary × 0.5 full-body discount = 2 per expanded muscle
    expect(volumes.get("quads")).toBe(2);
    expect(volumes.get("core")).toBe(2);
    expect(volumes.get("lats")).toBe(2);
  });
```

(`"conditioning"` is a valid `SectionType` — see `SECTION_TYPES` in `src/lib/programs/types.ts:6`.)

- [ ] **Step 2: Run tests to verify it fails**

Run: `bun run test src/lib/analysis/volume.test.ts`
Expected: FAIL with received `4` (full credit) instead of `2`.

- [ ] **Step 3: Implement the fix**

In `src/lib/analysis/volume.ts`, replace `addMuscleVolume`:

```ts
const FULL_BODY_DISCOUNT = 0.5;

function addMuscleVolume(
  volumes: Map<MuscleGroup, number>,
  muscles: string[],
  sets: number,
  weight: number,
): void {
  for (const label of muscles) {
    const canonicals = mapMuscleExpanded(label);
    // "full body" expands to 6 muscles; full tier credit for each would let one
    // exercise generate 6× its sets in volume. Halve the credit per muscle.
    const effectiveWeight =
      canonicals.length > 1 ? weight * FULL_BODY_DISCOUNT : weight;
    for (const canonical of canonicals) {
      volumes.set(canonical, (volumes.get(canonical) ?? 0) + sets * effectiveWeight);
    }
  }
}
```

(`canonicals.length > 1` is currently only true for "full body" — every other label maps to exactly one muscle or none. Keying on the expansion rather than the string keeps the discount if more multi-muscle labels are added to `mapMuscleExpanded` later.)

- [ ] **Step 4: Run the analysis suite — all pass**

Run: `bun run test src/lib/analysis`
Expected: PASS. If any `analyze.test.ts` or `score.test.ts` expectation fails, inspect it: none of the shipped fixtures use "full body" tags, so failures here mean an implementation mistake, not a fixture recalibration.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/volume.ts src/lib/analysis/volume.test.ts
git commit -m "fix(analysis): halve volume credit for 'full body' muscle expansion"
```

---

### Task 4: LLM sheet prompt — single source of truth, honest output request

**Problem (3 parts):**
1. `LlmAnalysisSheet.tsx` hardcodes an 11-muscle landmark table that contradicts the engine (`thresholds.ts`): e.g. sheet says Biceps MEV 6–8, engine flags below-MEV at 9. The card and the prompt next to it can disagree on the same screen.
2. The prompt's "Return JSON … for app to consume" section and the "Output schema — JSON for app to consume" grid chip promise ingestion that does not exist anywhere in the app.
3. The "Your profile — Goals · experience · constraints" grid chip is also false: `buildPrompt` includes no profile data.

**Fix:** extract the prompt builder to `src/lib/analysis/sheetPrompt.ts`, generate all reference tables from `thresholds.ts`, replace the JSON request with a plain-markdown response request, and fix the grid copy.

**Files:**
- Create: `src/lib/analysis/sheetPrompt.ts`
- Create: `src/lib/analysis/sheetPrompt.test.ts`
- Modify: `src/lib/analysis/toDisplayAnalysis.ts` (export `MUSCLE_LABEL`, currently module-private at ~line 14)
- Modify: `src/components/analysis/LlmAnalysisSheet.tsx` (delete inline `buildPrompt` + `PROMPT_GRID_ITEMS`, import from lib)

- [ ] **Step 1: Export MUSCLE_LABEL**

In `src/lib/analysis/toDisplayAnalysis.ts`, change `const MUSCLE_LABEL` to `export const MUSCLE_LABEL` (no other change).

- [ ] **Step 2: Write the failing tests**

Create `src/lib/analysis/sheetPrompt.test.ts`:

```ts
import { buildSheetPrompt, SHEET_PROMPT_GRID_ITEMS } from "./sheetPrompt";
import { toDisplayAnalysis } from "./toDisplayAnalysis";
import { analyzeProgram } from "./analyze";
import { balancedProgram } from "./fixtures";
import { VOLUME_LANDMARKS } from "./thresholds";
import { ALL_MUSCLE_GROUPS } from "./types";

const displayAnalysis = () => toDisplayAnalysis(analyzeProgram(balancedProgram), 0);

describe("buildSheetPrompt", () => {
  it("generates the landmark table from thresholds.ts (engine values, all muscles)", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    const b = VOLUME_LANDMARKS.biceps;
    expect(prompt).toContain(`| Biceps | ${b.mv} | ${b.mev} | ${b.mavLow} | ${b.mavHigh} | ${b.mrv} |`);
    const g = VOLUME_LANDMARKS.glutes;
    expect(prompt).toContain(`| Glutes | ${g.mv} | ${g.mev} | ${g.mavLow} | ${g.mavHigh} | ${g.mrv} |`);
    // one row per canonical muscle group — no more 11-muscle subset
    const rows = prompt.match(/^\| [A-Z]/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(ALL_MUSCLE_GROUPS.length);
  });

  it("does not promise machine ingestion", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).not.toContain("Return JSON");
    expect(prompt).not.toMatch(/for app to consume/i);
    expect(prompt).toContain("What to return");
  });

  it("includes the program title and computed scores", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).toContain("Test Program");
    expect(prompt).toMatch(/Volume: [A-F] \(\d+\/100\)/);
  });

  it("grid items no longer advertise JSON output or profile data", () => {
    const flat = SHEET_PROMPT_GRID_ITEMS.flat().join(" ");
    expect(flat).not.toMatch(/JSON for app to consume/i);
    expect(flat).not.toMatch(/profile/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test src/lib/analysis/sheetPrompt.test.ts`
Expected: FAIL — module `./sheetPrompt` does not exist.

- [ ] **Step 4: Create the prompt module**

Create `src/lib/analysis/sheetPrompt.ts`:

```ts
import type { DisplayAnalysis } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS, SESSION_LIMITS, BALANCE_TARGETS } from "./thresholds";
import { MUSCLE_LABEL } from "./toDisplayAnalysis";

export const SHEET_PROMPT_GRID_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["Volume landmarks", `${ALL_MUSCLE_GROUPS.length} muscle groups · MV/MEV/MAV/MRV`],
  ["Session limits", "Exercise count · set count · duration"],
  ["Balance targets", "Push:pull · upper:lower · quad:ham"],
  ["Pattern coverage", "6 movement patterns"],
  ["Computed scores", "For LLM to validate / dispute"],
  ["Requested output", "Verdict · corrections · top changes"],
];

function landmarkTable(): string {
  const header =
    "| Muscle | MV | MEV | MAV-Lo | MAV-Hi | MRV |\n|---|---|---|---|---|---|";
  const rows = ALL_MUSCLE_GROUPS.map((m) => {
    const lm = VOLUME_LANDMARKS[m];
    const label = MUSCLE_LABEL[m] ?? m;
    return `| ${label} | ${lm.mv} | ${lm.mev} | ${lm.mavLow} | ${lm.mavHigh} | ${lm.mrv} |`;
  });
  return [header, ...rows].join("\n");
}

export function buildSheetPrompt(analysis: DisplayAnalysis, programTitle: string): string {
  const s = SESSION_LIMITS;
  const bt = BALANCE_TARGETS;
  return `# Workout Routine Analysis: ${programTitle}

You are an evidence-based strength coach. Analyze this routine using the reference data below. The reference values are calibrated for general/hypertrophy training — if the routine clearly targets another goal (strength, powerlifting, endurance), say so and judge it by that goal's standards instead.

## Reference: Volume Landmarks (effective sets/muscle/week)
${landmarkTable()}

Volume counting: primary muscles = 1.0 set, secondary = 0.5, incidental = 0.25; "full body" tags credit each covered muscle at half weight.

## Reference: Session Constraints
- ${s.exercises.greenMin}–${s.exercises.greenMax} exercises per session (${s.exercises.yellowMax + 1}+ excessive)
- ${s.totalSets.greenMin}–${s.totalSets.greenMax} productive sets per session
- Max ~${s.setsPerMuscle.greenMax} direct sets per muscle per session
- Duration ≈ (sets × 3) + 10 minutes; ${s.durationMinutes.greenMin}–${s.durationMinutes.greenMax} min preferred

## Reference: Balance Targets (set-count ratios — volume-balance nudges, not injury metrics)
- Push:Pull ${bt.pushPull.idealMin}–${bt.pushPull.idealMax} (flag above ${bt.pushPull.warnMax})
- Upper:Lower ${bt.upperLower.idealMin}–${bt.upperLower.idealMax}
- Quad:Ham ${bt.quadHam.idealMin}–${bt.quadHam.idealMax}
- Chest:Back ${bt.chestBack.idealMin}–${bt.chestBack.idealMax}
- 6 movement patterns: horizontal/vertical push, horizontal/vertical pull, hinge, squat

## Computed Scores (validate or dispute)
${analysis.dimensions.map((d) => `- ${d.label}: ${d.grade} (${d.score}/100) — ${d.note}`).join("\n")}

## Muscle Volumes
${analysis.muscles.map((m) => `- ${m.group}: ${m.sets} eff. sets (MEV ${m.mev}, MAV ${m.mavLo}–${m.mavHi}, MRV ${m.mrv}) [${m.status}]`).join("\n")}

## Balance Ratios
${analysis.ratios.map((r) => `- ${r.label}: ${r.value} (target ${r.target}) [${r.verdict}]`).join("\n")}

## Sessions
${analysis.sessions.map((sn) => `- ${sn.day}: ${sn.exercises} exercises, ${sn.sets} sets, ~${sn.durationMin} min [${sn.status}]`).join("\n")}

## What to return
Plain markdown — this app does not ingest a machine-readable response:
1. **Verdict** — 2–3 sentences on overall quality for the goal this routine appears to target.
2. **Corrections** — where you disagree with the computed scores above, and why.
3. **Top changes** — up to 5, prioritized, each with the specific edit and rationale.
4. **What's already good** — brief.`;
}
```

- [ ] **Step 5: Run tests — pass**

Run: `bun run test src/lib/analysis/sheetPrompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Rewire the component**

In `src/components/analysis/LlmAnalysisSheet.tsx`:
1. Delete the module-level `PROMPT_GRID_ITEMS` array (lines ~6–14) and the entire inline `buildPrompt` function (lines ~16–68).
2. Add the import:

```ts
import { buildSheetPrompt, SHEET_PROMPT_GRID_ITEMS } from "@/lib/analysis/sheetPrompt";
```

3. In the component body, change `const prompt = buildPrompt(analysis, programTitle);` to:

```ts
const prompt = buildSheetPrompt(analysis, programTitle);
```

4. In the JSX grid render, change `...PROMPT_GRID_ITEMS,` to `...SHEET_PROMPT_GRID_ITEMS,`.

- [ ] **Step 7: Full test suite, lint, and build**

Run: `bun run test && bun run lint && bun run build`
Expected: all pass. The build step matters here — it type-checks the component change (jest does not). If e2e specs assert on the sheet's grid text (search: `grep -rn "JSON for app to consume\|Output schema" e2e/`), update those assertions to the new copy.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analysis/sheetPrompt.ts src/lib/analysis/sheetPrompt.test.ts src/lib/analysis/toDisplayAnalysis.ts src/components/analysis/LlmAnalysisSheet.tsx
git commit -m "fix(analysis): generate LLM sheet prompt from engine thresholds; drop unkept JSON/profile promises"
```

---

### Task 5: Display coherence — session red status + live mavLow label

**Problem (2 parts):**
1. `toDisplayAnalysis.ts` (~line 123) maps any session warning to `status: "warn"` — a red session warning never shows as "bad" in the sessions table.
2. `mavLow` is displayed in the muscle bars but plays no role in classification (`classifyVolume` in `src/lib/analysis/volume.ts` uses only mev/mavHigh/mrv). Give it a label-only role: sets in [mev, mavLow) stay green but read "Productive — lower end". Severity must NOT change (landmark recalibration is explicitly deferred; see the 2026-06-19 audit).

**Files:**
- Modify: `src/lib/analysis/toDisplayAnalysis.ts` (session status mapping)
- Modify: `src/lib/analysis/volume.ts` (`classifyVolume`)
- Test: `src/lib/analysis/toDisplayAnalysis.test.ts`, `src/lib/analysis/volume.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/analysis/toDisplayAnalysis.test.ts`:

```ts
  it("maps sessions with red warnings to 'bad' status", () => {
    const r = makeResult();
    const result = {
      ...r,
      sessions: [{
        ...r.sessions[0],
        warnings: [{ severity: "red" as const, dimension: "session", message: "too long" }],
      }],
    };
    const d = toDisplayAnalysis(result, 0);
    expect(d.sessions[0].status).toBe("bad");
  });
```

In `src/lib/analysis/volume.test.ts` (`describe("scoreVolume", ...)`), adding this import at the top of the file:

```ts
import type { MuscleGroup } from "./types";
```

```ts
  it("labels sets between MEV and MAV-low as lower-end productive, still green", () => {
    // chest: mev 5, mavLow 6 — 5.5 sets sits in the gap
    const volumes = new Map<MuscleGroup, number>([["chest", 5.5]]);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(chest.severity).toBe("green");
    expect(chest.label).toBe("Productive — lower end");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/analysis/toDisplayAnalysis.test.ts src/lib/analysis/volume.test.ts`
Expected: both new tests FAIL (session status received `"warn"`; label received `"Productive range"`).

- [ ] **Step 3: Implement both fixes**

In `src/lib/analysis/toDisplayAnalysis.ts`, in the `sessions` mapping, replace the `status` line:

```ts
    status: s.warnings.some((w) => w.severity === "red") ? "bad"
          : s.warnings.length > 0 ? "warn"
          : "good",
```

In `src/lib/analysis/volume.ts`, replace `classifyVolume`:

```ts
function classifyVolume(
  sets: number,
  lm: (typeof VOLUME_LANDMARKS)[MuscleGroup],
): { severity: Severity; label: string } {
  if (sets < lm.mv) return { severity: "red", label: "Below maintenance" };
  if (sets < lm.mev) return { severity: "yellow", label: "Maintenance only" };
  if (sets < lm.mavLow) return { severity: "green", label: "Productive — lower end" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
```

- [ ] **Step 4: Run the full analysis suite — all pass**

Run: `bun run test src/lib/analysis`
Expected: PASS. (Severities are unchanged, so no score-level test should move; only the two new label/status assertions are new behavior.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/toDisplayAnalysis.ts src/lib/analysis/volume.ts src/lib/analysis/toDisplayAnalysis.test.ts src/lib/analysis/volume.test.ts
git commit -m "fix(analysis): red session warnings show as bad; mavLow gets a live label role"
```

---

### Task 6: Final verification and docs

**Files:**
- Modify: `.reviews/2026-06-19/00-analysis-framework-evidence-audit.md` (append an update note)

- [ ] **Step 1: Full suite + lint + build**

Run: `bun run test && bun run lint && bun run build`
Expected: everything green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Run e2e if the sheet copy changed assertions**

Run: `grep -rn "Output schema\|JSON for app to consume\|11 muscles" e2e/ src/` — expect no hits outside git history. If e2e specs referenced the old copy, run `bun run test:e2e` after updating them.

- [ ] **Step 3: Append an update note to the audit doc**

Add directly below the existing `> **UPDATE — 2026-06-19 …**` block in `.reviews/2026-06-19/00-analysis-framework-evidence-audit.md`:

```markdown
> **UPDATE — 2026-07-01:** Five residual findings from the 2026-07-01 review are fixed on master:
> fingerprint reports days/week (was total days across weeks); peak-week detection weighs sets not
> exercises, and an explicit sub-85% %1RM vetoes the low-rep "heavy" fallback; "full body" muscle
> expansion credits each muscle at half the tier weight; the LLM sheet prompt is generated from
> `thresholds.ts` (single source of truth — the divergent inline table and the unkept "JSON for app
> to consume"/profile promises are gone, builder extracted to `src/lib/analysis/sheetPrompt.ts`);
> red session warnings display as "bad" and `mavLow` now drives a "Productive — lower end" label
> (severity unchanged). Plan: `docs/superpowers/plans/2026-07-01-analysis-residual-fixes.md`.
```

- [ ] **Step 4: Commit**

```bash
git add .reviews/2026-06-19/00-analysis-framework-evidence-audit.md
git commit -m "docs(analysis): record 2026-07-01 residual fixes in evidence audit"
```

---

## Out of scope (deliberately)

- **Goal-aware engine** (per-goal landmarks/grade, style fingerprint, frequency dimension) — deferred to its own brainstorm; see the audit.
- **Landmark value recalibration** (biceps MEV 9 etc.) — the generation prompt in `src/lib/prompts/builder.ts` now shares these values, so recalibration should be done once, deliberately, for both consumers.
- **Dimension reweighting** (balance 0.294 vs session 0.235) — methodology decision, not a bug fix.
- **Wiring profile data into the sheet prompt** — desirable, but requires a repo dependency in the component; do it when the goal-aware work lands.
