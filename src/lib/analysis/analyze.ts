import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult, MuscleGroup } from "./types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { analyzeSessions } from "./session";
import { analyzeBalance } from "./balance";
import { analyzePeriodization } from "./periodization";
import { deriveCoverage } from "./coverage";
import {
  computeOverallScore,
  scoreVolumeDimension,
  scoreSessionDimension,
  scoreBalanceDimension,
  scorePeriodizationDimension,
} from "./score";

function mergeMaxVolumes(maps: Map<MuscleGroup, number>[]): Map<MuscleGroup, number> {
  const result = new Map<MuscleGroup, number>();
  for (const map of maps) {
    for (const [muscle, sets] of map) {
      result.set(muscle, Math.max(result.get(muscle) ?? 0, sets));
    }
  }
  return result;
}

export function analyzeProgram(program: ProgramDocument): AnalysisResult {
  const days = getRenderableDays(program);

  const weekNums = [...new Set(days.map((d) => d.weekNumber ?? 1))];
  const weeklyVolume = mergeMaxVolumes(weekNums.map((w) => countWeeklyVolume(days, w)));
  const muscleVolumes = scoreVolume(weeklyVolume);
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
    ...muscleVolumes.filter((r) => r.severity !== "green").map((r) => ({
      severity: r.severity,
      dimension: "volume" as const,
      message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
    })),
    ...sessions.flatMap((s) => s.warnings),
    ...balance.warnings,
    ...periodization.warnings,
  ];

  const coverage = deriveCoverage(muscleVolumes, balance);

  return { overall, dimensions, muscleVolumes, sessions, balance, periodization, warnings, coverage };
}

function formatMuscleName(muscle: string): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
