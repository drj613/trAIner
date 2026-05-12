import type { BalanceResult, CoverageResult, MuscleVolumeResult } from "./types";

export function deriveCoverage(
  muscleVolumes: MuscleVolumeResult[],
  balance: BalanceResult,
): CoverageResult {
  return {
    patternsCovered: balance.movementPatternsCovered,
    patternsMissing: balance.movementPatternsMissing,
    musclesTrained: muscleVolumes.filter((r) => r.effectiveSets > 0).map((r) => r.muscle),
    musclesUntrained: muscleVolumes.filter((r) => r.effectiveSets === 0).map((r) => r.muscle),
  };
}
