# LLM Analysis Prompt — Conversational Routine Analysis

> ⚠️ **Status (2026-06-19): this describes DESIGN INTENT, not the shipped engine.** The "Building the Prompt in JS" code here documents the DELETED `llmPrompt.ts`. The live builder is the inline `buildPrompt(analysis: DisplayAnalysis, programTitle)` in `src/components/analysis/LlmAnalysisSheet.tsx`, which takes the already-computed DisplayAnalysis (not raw program/catalog/profile) and does no template substitution. Shipped behavior + the design-vs-shipped delta: see `.reviews/2026-06-19/00-analysis-framework-evidence-audit.md`.

## Concept

Two-tier analysis system:

1. **Offline algorithmic analyzer** (client-side JS) — runs automatically on import and on-demand. Produces scorecard, fingerprint, and warnings. Fast, deterministic, works offline.

2. **LLM analysis prompt** (copy-pasteable) — stitches together the full routine, research-backed reference data, and a structured analysis request. User pastes into any LLM (Claude, ChatGPT, etc.) for a deep conversational analysis with follow-up questions.

The LLM prompt is the "second opinion" — it can do things the algorithmic analyzer can't:
- Explain *why* something is a problem in plain language
- Suggest specific exercise substitutions
- Consider the user's goals and constraints holistically
- Answer follow-up questions ("what if I add a fourth training day?")

## Prompt Structure

The generated prompt should have these sections:

### 1. System Context (research knowledge)

Embed a condensed version of our research findings so the LLM doesn't rely on its potentially outdated or inconsistent training knowledge. This makes the analysis consistent regardless of which LLM the user pastes it into.

### 2. The Routine (structured data)

The full program in a readable format — days, sections, exercises with sets/reps/rest.

### 3. Exercise Metadata (from catalog)

For each exercise in the routine, include the catalog metadata (primary/secondary muscles, movement patterns, tags). This prevents the LLM from guessing which muscles an exercise targets.

### 4. User Profile (if available)

Training age, goals, equipment, constraints, days per week.

### 5. Analysis Request

Structured instructions for what to analyze and how to format the response.

---

## Prompt Template

```markdown
# Workout Routine Analysis

You are an evidence-based strength and conditioning coach. Analyze the following
workout routine using the reference data and guidelines provided below.

## Reference Data: Volume Landmarks

Weekly sets per muscle group thresholds (for intermediate lifters):

| Muscle Group | Maintenance | Min Effective | Optimal Low | Optimal High | Max Recoverable |
|---|---|---|---|---|---|
| Chest | 2-4 | 4-6 | 6 | 16 | 16-24 |
| Back (total) | 4-6 | 6-8 | 10 | 20 | 20-30 |
| Quads | 2-4 | 4-6 | 6 | 14 | 14-18 |
| Hamstrings | 0-2 | 2-4 | 2 | 8 | 8-14 |
| Glutes | 2-6 | 6-8 | 8 | 24 | 24-30 |
| Biceps | 6-8 | 8-10 | 14 | 20 | 20-26 |
| Triceps | 0-4 | 4-6 | 6 | 16 | 16-20 |
| Side Delts | 2-6 | 6-8 | 8 | 24 | 24-30 |
| Rear Delts | 0-4 | 0-4 | 4 | 12 | 12-20 |
| Front Delts | 0-2 | 0-2 | 4 | 8 | 8-12 |
| Calves | 2-4 | 4-6 | 6 | 16 | 16-24 |

Volume counting uses tiered weights: primary muscles = 1.0 set, secondary = 0.5 set,
incidental = 0.25 set per exercise set performed.

## Reference Data: Session Constraints

- Exercises per session: 4-8 is productive; 11+ is too many
- Total working sets per session: 10-25 is productive; 31+ is excessive
- Sets per muscle per session: 1-8 is productive; 11+ is junk volume
- Estimated session duration: (total_sets × 3) + 10 minutes
- Productive session window: 30-75 minutes

## Reference Data: Balance Targets

- Push:Pull weekly volume ratio: 1:1 to 1:1.5 (slightly pull-biased is healthier)
- Upper:Lower weekly volume ratio: roughly 1:1
- Quad:Hamstring ratio: 1:1 to 1.67:1 (quads slightly higher is normal)
- Chest:Back ratio: 0.67:1 to 1:1
- All 6 core movement patterns should be represented weekly:
  horizontal push, horizontal pull, vertical push, vertical pull, hip hinge, squat

## Reference Data: Goal Signatures

- Hypertrophy: 6-12 rep range dominant, 55-75% compound, high variety, 12-20 sets/muscle/week
- Strength: 1-5 rep range dominant, 85-95% compound, high specificity, long rest
- Olympic WL: 1-3 reps on main lifts, explosive tags, snatch/clean/jerk variations
- General fitness: mixed rep ranges, all movement patterns, conditioning included
- CrossFit: varied reps, metcon sections, concurrent strength + conditioning

{{USER_PROFILE}}

## The Routine

{{ROUTINE_JSON}}

## Exercise Metadata

{{EXERCISE_METADATA}}

## Analysis Instructions

Please analyze this routine and provide:

### 1. Program Fingerprint
What kind of program is this? (e.g., "Hypertrophy-focused upper/lower split with
moderate conditioning"). Identify the primary and secondary training goals based
on the structure.

### 2. Volume Analysis
For each muscle group, calculate the weekly effective sets (using the tiered
weighting: primary=1.0, secondary=0.5, incidental=0.25). Compare against the
volume landmarks table. Flag any muscle groups below Minimum Effective Volume
or above Maximum Recoverable Volume.

### 3. Session-by-Session Review
For each training day:
- Count total exercises and total working sets
- Estimate session duration
- Identify any per-session volume issues (too many exercises, too many sets for one muscle)
- Note exercise ordering issues (isolation before compounds, etc.)

### 4. Balance Assessment
Calculate and report:
- Push:Pull ratio
- Upper:Lower ratio
- Movement pattern coverage (which of the 6 core patterns are present/missing?)
- Any concerning muscle group imbalances

### 5. Structural Observations
- Is there periodization across weeks, or is it the same week repeated?
- Are rest periods appropriate for the apparent goal?
- Is the compound:isolation ratio appropriate for the inferred goal?
- Any exercises that seem misplaced or redundant?

### 6. Top 3 Strengths
What does this routine do well?

### 7. Top 3 Issues
What are the most impactful things to fix? Be specific — name the muscle groups,
exercises, or structural changes.

Format your response with clear headers and use tables where appropriate for
volume calculations.
```

## Implementation Notes

### Building the Prompt in JS

```ts
function buildAnalysisPrompt(
  program: ProgramDocument,
  catalog: ExerciseCatalogItem[],
  profile?: ProfileDocument,
): string {
  // 1. Build user profile section
  const profileSection = profile
    ? `## User Profile\n${formatProfile(profile)}`
    : "## User Profile\nNo profile available.";

  // 2. Build routine section (readable format, not raw JSON)
  const routineSection = formatRoutineReadable(program);

  // 3. Build exercise metadata section
  // For each unique exercise in the program, include catalog data
  const exerciseIds = extractUniqueExerciseIds(program);
  const metadataSection = exerciseIds
    .map(id => {
      const exercise = catalog.find(e => e.id === id);
      if (!exercise) return null;
      return formatExerciseMetadata(exercise);
    })
    .filter(Boolean)
    .join("\n");

  // 4. Stitch together with the template
  return PROMPT_TEMPLATE
    .replace("{{USER_PROFILE}}", profileSection)
    .replace("{{ROUTINE_JSON}}", routineSection)
    .replace("{{EXERCISE_METADATA}}", metadataSection);
}
```

### Formatting the Routine for Readability

Don't dump raw JSON — format it for LLM consumption:

```
## Day 1: Upper Pull and Press (Monday)

### Section: Warm-Up
- Band Pull-Aparts: 2×15 (shoulders, rear delts)
- Face Pulls: 2×15 (rear delts, rotator cuff)

### Section: Strength
- Barbell Bench Press: 4×5 @ 80% 1RM, rest 3:00
  Primary: chest, front delts | Secondary: triceps
- Weighted Pull-Ups: 4×5, rest 3:00
  Primary: lats, biceps | Secondary: rear delts, forearms

### Section: Hypertrophy
- Incline DB Press: 3×8-10, rest 2:00
  Primary: upper chest, front delts | Secondary: triceps
- Cable Rows: 3×10-12, rest 1:30
  Primary: middle back, lats | Secondary: biceps, rear delts
[superset with]
- Lateral Raises: 3×12-15, rest 1:00
  Primary: side delts
```

### Formatting Exercise Metadata

```
### Barbell Bench Press
- Primary muscles: chest, front delts
- Secondary muscles: triceps
- Movement patterns: horizontal press, compound
- Tags: compound, strength, push
- Equipment: barbell, bench
```

### Size Considerations

The full prompt with a typical 4-day program will be roughly 3,000-5,000 tokens — well within any LLM's context window. For very large programs (6+ days, multi-week), consider:
- Summarizing repeated weeks ("Weeks 1-3 are identical; Week 4 is a deload")
- Only including metadata for exercises that differ from common knowledge (skip "Barbell Bench Press" metadata, include obscure exercises)

## UI Integration

The prompt should be accessible via a "Get AI Analysis" or "Analyze with AI" button on the routine detail page. Clicking it:

1. Builds the prompt using the current program + catalog + profile
2. Copies to clipboard
3. Shows a toast: "Analysis prompt copied! Paste into Claude, ChatGPT, or any AI assistant."

Optionally, display the prompt in a modal with a textarea (like the existing prompt builder at `/prompts`) so users can preview and edit before copying.

## Sources

- All research from files 01-07 in this directory
- Existing prompt builder pattern: `src/lib/prompts/builder.ts` *(this is the **workout-generation** prompt builder, NOT the analysis-prompt builder — the analysis prompt lives in `LlmAnalysisSheet.tsx`)*
- Existing prompt builder UI: `src/components/prompts/PromptBuilderClient.tsx` *(workout-generation UI, not analysis)*
