import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult, MuscleGroup, Warning, DimensionKey } from "./types";
import { DIMENSION_KEYS } from "./types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { analyzeSessions } from "./session";
import { analyzeBalance } from "./balance";
import { analyzePeriodization } from "./periodization";
import { deriveCoverage } from "./coverage";
import { GOAL_GATE_PROFILES } from "./thresholds";
import {
  computeOverallScore,
  scoreVolumeDimension,
  scoreSessionDimension,
  scoreBalanceDimension,
  scorePeriodizationDimension,
} from "./score";

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

export function analyzeProgram(program: ProgramDocument): AnalysisResult {
  const days = getRenderableDays(program);

  const weekNums = [...new Set(days.map((d) => d.weekNumber ?? 1))];
  const weeklyVolume = typicalWeeklyVolumes(weekNums.map((w) => countWeeklyVolume(days, w)));
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

  const goal = program.goal ?? "general";
  const gradedDimensions = GOAL_GATE_PROFILES[goal];
  const graded = new Set<DimensionKey>(gradedDimensions);

  const overall = computeOverallScore(dimensions, gradedDimensions);

  const volumeWarnings: Warning[] = muscleVolumes
    .filter((r) => r.severity !== "green" && r.effectiveSets > 0)
    .map((r) => ({
      severity: r.severity,
      dimension: "volume" as const,
      message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
    }));

  const warnings = [
    ...(graded.has("volume") ? volumeWarnings : []),
    ...(graded.has("session") ? sessions.flatMap((s) => s.warnings) : []),
    ...(graded.has("balance") ? balance.warnings : []),
    ...(graded.has("periodization") ? periodization.warnings : []),
  ];

  const coverage = deriveCoverage(muscleVolumes, balance);

  return {
    overall, dimensions, muscleVolumes, sessions, balance, periodization, warnings, coverage,
    goalScope: { goal, partial: gradedDimensions.length < DIMENSION_KEYS.length, gradedDimensions: [...gradedDimensions] },
  };
}

function formatMuscleName(muscle: string): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
