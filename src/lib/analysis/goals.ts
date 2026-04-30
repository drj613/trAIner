import type { ProgramDay } from "@/lib/programs/types";
import type { GoalArchetype, GoalSignature } from "./types";
import { GOAL_SECTION_WEIGHTS, GOAL_REP_RANGES, GOAL_COMPOUND_RATIO } from "./thresholds";
import { repMidpoint, isCompound, lookupCatalogExercise, getEffectiveSets } from "./muscles";

const ALL_GOALS: GoalArchetype[] = [
  "hypertrophy", "strength", "olympic_weightlifting",
  "general_fitness", "crossfit", "rehab",
];

export function inferGoal(days: ProgramDay[]): GoalSignature {
  const scores = new Map<GoalArchetype, number>();
  for (const goal of ALL_GOALS) scores.set(goal, 0);

  scoreSectionTypes(days, scores);
  scoreRepRanges(days, scores);
  scoreCompoundRatio(days, scores);
  scoreTagSignals(days, scores);

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = sorted[0];
  const [secondary] = sorted.length > 1 ? sorted[1] : [null];
  const secondaryScore = sorted[1]?.[1] ?? 0;
  const confidence = primaryScore / (primaryScore + secondaryScore || 1);

  const hasSecondary = secondary !== null && secondaryScore >= primaryScore * 0.7;
  const fingerprint = buildFingerprint(primary, hasSecondary ? (secondary as GoalArchetype) : null, days);

  return {
    primary,
    secondary: hasSecondary ? (secondary as GoalArchetype) : null,
    confidence: Math.round(confidence * 100) / 100,
    fingerprint,
  };
}

function scoreSectionTypes(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  for (const day of days) {
    for (const section of day.sections) {
      for (const goal of ALL_GOALS) {
        const weight = GOAL_SECTION_WEIGHTS[goal][section.type] ?? 0;
        scores.set(goal, (scores.get(goal) ?? 0) + weight);
      }
    }
  }
}

function scoreRepRanges(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  let heavy = 0, moderate = 0, light = 0, total = 0;

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const mid = repMidpoint(exercise.reps);
          if (mid === null) continue;
          const sets = getEffectiveSets(exercise);
          total += sets;
          if (mid <= 5) heavy += sets;
          else if (mid <= 12) moderate += sets;
          else light += sets;
        }
      }
    }
  }

  if (total === 0) return;
  const dist = { heavy: heavy / total, moderate: moderate / total, light: light / total };

  for (const goal of ALL_GOALS) {
    const target = GOAL_REP_RANGES[goal];
    const similarity = 1 - (
      Math.abs(dist.heavy - target.heavy) +
      Math.abs(dist.moderate - target.moderate) +
      Math.abs(dist.light - target.light)
    ) / 2;
    scores.set(goal, (scores.get(goal) ?? 0) + similarity * 3);
  }
}

function scoreCompoundRatio(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  let compound = 0, isolation = 0;

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const catalogItem = lookupCatalogExercise(exercise);
          if (isCompound(exercise, catalogItem)) compound++;
          else isolation++;
        }
      }
    }
  }

  const total = compound + isolation;
  if (total === 0) return;
  const ratio = compound / total;

  for (const goal of ALL_GOALS) {
    const target = GOAL_COMPOUND_RATIO[goal];
    const mid = (target.min + target.max) / 2;
    const distance = Math.abs(ratio - mid);
    const score = Math.max(0, 1 - distance * 3);
    scores.set(goal, (scores.get(goal) ?? 0) + score * 2);
  }
}

function scoreTagSignals(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  const tagCounts = new Map<string, number>();
  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          for (const mod of exercise.tags.modifiers) {
            tagCounts.set(mod.toLowerCase(), (tagCounts.get(mod.toLowerCase()) ?? 0) + 1);
          }
        }
      }
    }
  }

  if (tagCounts.has("explosive") || tagCounts.has("plyometrics")) {
    scores.set("olympic_weightlifting", (scores.get("olympic_weightlifting") ?? 0) + (tagCounts.get("explosive") ?? 0) * 0.5);
    scores.set("crossfit", (scores.get("crossfit") ?? 0) + (tagCounts.get("explosive") ?? 0) * 0.3);
  }
  if (tagCounts.has("pump")) {
    scores.set("hypertrophy", (scores.get("hypertrophy") ?? 0) + (tagCounts.get("pump") ?? 0) * 0.5);
  }
  if (tagCounts.has("prehab") || tagCounts.has("activation")) {
    scores.set("rehab", (scores.get("rehab") ?? 0) + ((tagCounts.get("prehab") ?? 0) + (tagCounts.get("activation") ?? 0)) * 0.5);
  }
}

function buildFingerprint(primary: GoalArchetype, secondary: GoalArchetype | null, days: ProgramDay[]): string {
  const goalLabels: Record<GoalArchetype, string> = {
    hypertrophy: "Hypertrophy-focused",
    strength: "Strength-focused",
    olympic_weightlifting: "Olympic weightlifting",
    general_fitness: "General fitness",
    crossfit: "CrossFit-style",
    rehab: "Rehab/mobility-focused",
  };

  let desc = goalLabels[primary];
  if (secondary) desc += ` with ${goalLabels[secondary].toLowerCase()} component`;

  const dayCount = days.length;
  if (dayCount <= 3) desc += ` (${dayCount}-day)`;
  else if (dayCount <= 5) desc += ` (${dayCount}-day split)`;
  else desc += ` (${dayCount}-day high-frequency)`;

  return desc;
}
