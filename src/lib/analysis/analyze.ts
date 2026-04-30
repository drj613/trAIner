import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult } from "./types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { analyzeSessions } from "./session";
import { analyzeBalance } from "./balance";
import { inferGoal } from "./goals";
import { analyzePeriodization } from "./periodization";
import {
  computeOverallScore,
  scoreVolumeDimension,
  scoreSessionDimension,
  scoreBalanceDimension,
  scoreGoalCoherence,
  scorePeriodizationDimension,
} from "./score";

export function analyzeProgram(program: ProgramDocument): AnalysisResult {
  const days = getRenderableDays(program);

  const weeklyVolume = countWeeklyVolume(days, 1);
  const muscleVolumes = scoreVolume(weeklyVolume);
  const sessions = analyzeSessions(days);
  const balance = analyzeBalance(days);
  const goal = inferGoal(days);
  const periodization = analyzePeriodization(days);

  const dimensions = {
    volume: scoreVolumeDimension(muscleVolumes),
    session: scoreSessionDimension(sessions),
    balance: scoreBalanceDimension(balance),
    goalCoherence: scoreGoalCoherence(goal),
    periodization: scorePeriodizationDimension(periodization),
  };

  const overall = computeOverallScore(dimensions);

  const warnings = [
    ...muscleVolumes.filter((r) => r.severity !== "green").map((r) => ({
      severity: r.severity,
      dimension: "volume" as const,
      message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
    })),
    ...sessions.flatMap((s) => s.warnings),
    ...balance.warnings,
    ...periodization.warnings,
  ];

  return { overall, dimensions, muscleVolumes, sessions, balance, goal, periodization, warnings };
}

function formatMuscleName(muscle: string): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
