import type { ProfileDocument, ProgramDocument, ProgramDay } from "@/lib/programs/types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { getEffectiveSets } from "./muscles";

export function buildLlmAnalysisPrompt(
  program: ProgramDocument,
  profile?: ProfileDocument,
): string {
  const days = getRenderableDays(program);
  return [
    HEADER,
    VOLUME_REFERENCE,
    SESSION_REFERENCE,
    BALANCE_REFERENCE,
    GOAL_REFERENCE,
    formatProfile(profile),
    formatRoutine(program.title, days),
    ANALYSIS_INSTRUCTIONS,
  ].join("\n\n");
}

const HEADER = `# Workout Routine Analysis

You are an evidence-based strength and conditioning coach. Analyze the following
workout routine using the reference data and guidelines provided below.`;

const VOLUME_REFERENCE = `## Reference Data: Volume Landmarks

Weekly sets per muscle group thresholds (intermediate lifters).
Count using tiered weights: primary muscles = 1.0 set, secondary = 0.5 set, incidental = 0.25 set.

| Muscle Group | Maintenance | Min Effective | Optimal Low | Optimal High | Max Recoverable |
|---|---|---|---|---|---|
| Chest | 3 | 5 | 6 | 16 | 24 |
| Back (lats) | 5 | 7 | 10 | 20 | 30 |
| Upper Back | 5 | 7 | 10 | 20 | 30 |
| Quads | 3 | 5 | 6 | 14 | 18 |
| Hamstrings | 1 | 3 | 2 | 8 | 14 |
| Glutes | 4 | 7 | 8 | 24 | 30 |
| Biceps | 7 | 9 | 14 | 20 | 26 |
| Triceps | 2 | 5 | 6 | 16 | 20 |
| Side Delts | 4 | 7 | 8 | 24 | 30 |
| Rear Delts | 2 | 2 | 4 | 12 | 20 |
| Front Delts | 1 | 1 | 4 | 8 | 12 |
| Calves | 3 | 5 | 6 | 16 | 24 |`;

const SESSION_REFERENCE = `## Reference Data: Session Constraints

- Exercises per session: 4-8 is productive; 11+ is too many
- Total working sets per session: 10-25 is productive; 31+ is excessive
- Sets per muscle per session: 1-8 is productive; 11+ is junk volume
- Estimated session duration: (total_sets × 3) + 10 minutes
- Productive session window: 30-75 minutes`;

const BALANCE_REFERENCE = `## Reference Data: Balance Targets

- Push:Pull weekly volume ratio: 1:1 to 1:1.5 (slightly pull-biased is healthier)
- Upper:Lower weekly volume ratio: roughly 1:1
- Quad:Hamstring ratio: 1:1 to 1.67:1 (quads slightly higher is normal)
- Chest:Back ratio: 0.67:1 to 1:1
- All 6 core movement patterns should be represented weekly:
  horizontal push, horizontal pull, vertical push, vertical pull, hip hinge, squat`;

const GOAL_REFERENCE = `## Reference Data: Goal Signatures

- Hypertrophy: 6-12 rep range dominant, 55-75% compound, high variety, 12-20 sets/muscle/week
- Strength: 1-5 rep range dominant, 85-95% compound, high specificity, long rest
- Olympic WL: 1-3 reps on main lifts, explosive tags, snatch/clean/jerk variations
- General fitness: mixed rep ranges, all movement patterns, conditioning included
- CrossFit: varied reps, metcon sections, concurrent strength + conditioning`;

function formatProfile(profile?: ProfileDocument): string {
  if (!profile) return "## User Profile\nNo profile available.";
  const lines = ["## User Profile"];
  lines.push(`- Name: ${profile.name}`);
  if (profile.trainingAge) lines.push(`- Training age: ${profile.trainingAge}`);
  if (profile.defaultDaysPerWeek) lines.push(`- Days per week: ${profile.defaultDaysPerWeek}`);
  if (profile.goals?.length) lines.push(`- Goals: ${profile.goals.join(", ")}`);
  if (profile.equipment?.length) lines.push(`- Equipment: ${profile.equipment.join(", ")}`);
  if (profile.constraints?.length) lines.push(`- Constraints: ${profile.constraints.join(", ")}`);
  return lines.join("\n");
}

function formatRoutine(title: string, days: ProgramDay[]): string {
  const lines: string[] = [`## The Routine: ${title}`, ""];

  for (const day of days) {
    const week = day.weekNumber && day.weekNumber > 1 ? ` (Week ${day.weekNumber})` : "";
    lines.push(`### Day ${day.dayNumber}${week}: ${day.title}`, "");

    for (const section of day.sections) {
      lines.push(`**${section.name}** (${section.type})`);

      for (const group of section.groups) {
        const groupLabel = group.type !== "single" ? ` [${group.type}]` : "";

        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          const reps = exercise.reps ?? "?";
          const rest = exercise.rest ? `, rest ${exercise.rest}` : "";
          const primary = exercise.tags.primary.join(", ");
          const secondary =
            exercise.tags.secondary.length > 0
              ? ` | Secondary: ${exercise.tags.secondary.join(", ")}`
              : "";
          lines.push(`- ${exercise.name}${groupLabel}: ${sets}×${reps}${rest}`);
          lines.push(`  Primary: ${primary}${secondary}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

const ANALYSIS_INSTRUCTIONS = `## Analysis Instructions

Please analyze this routine and provide:

### 1. Program Fingerprint
What kind of program is this? Identify the primary and secondary training goals
based on the structure.

### 2. Volume Analysis
For each muscle group, calculate the weekly effective sets (using the tiered
weighting). Compare against the volume landmarks table. Flag any muscle groups
below Minimum Effective Volume or above Maximum Recoverable Volume.

### 3. Session-by-Session Review
For each training day: count exercises and sets, estimate duration, identify
per-session volume issues or exercise ordering concerns.

### 4. Balance Assessment
Calculate push:pull ratio, upper:lower ratio, and movement pattern coverage.
Note any concerning imbalances.

### 5. Structural Observations
Is there periodization? Are rest periods appropriate? Is the compound:isolation
ratio suitable for the inferred goal?

### 6. Top 3 Strengths
What does this routine do well?

### 7. Top 3 Issues
What are the most impactful things to fix? Be specific.

Format your response with clear headers and use tables for volume calculations.`;
