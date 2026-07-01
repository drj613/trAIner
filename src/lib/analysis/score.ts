import type { DimensionScore, Grade, MuscleVolumeResult, SessionResult, BalanceResult, PeriodizationResult, DimensionKey } from "./types";
import { DIMENSION_KEYS } from "./types";
import { DIMENSION_WEIGHTS } from "./thresholds";

export function computeOverallScore(
  dimensions: {
    volume: DimensionScore;
    session: DimensionScore;
    balance: DimensionScore;
    periodization: DimensionScore;
  },
  graded: readonly DimensionKey[] = DIMENSION_KEYS,
): DimensionScore {
  const w = DIMENSION_WEIGHTS;
  let weighted = 0;
  let totalWeight = 0;
  for (const key of graded) {
    weighted += dimensions[key].score * w[key];
    totalWeight += w[key];
  }
  const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  return { name: "Overall", score, grade: scoreToGrade(score) };
}

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

export function scoreSessionDimension(results: SessionResult[]): DimensionScore {
  if (results.length === 0) return { name: "Session Structure", score: 0, grade: "F" };
  const sessionScores = results.map((session) => {
    let s = 100;
    const reds = session.warnings.filter((w) => w.severity === "red").length;
    const yellows = session.warnings.filter((w) => w.severity === "yellow").length;
    s -= reds * 20;
    s -= yellows * 8;
    return Math.max(0, Math.min(100, s));
  });
  const avg = Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length);
  return { name: "Session Structure", score: avg, grade: scoreToGrade(avg) };
}

export function scoreBalanceDimension(result: BalanceResult): DimensionScore {
  let score = 100;
  score -= result.warnings.filter((w) => w.severity === "red").length * 20;
  score -= result.warnings.filter((w) => w.severity === "yellow").length * 8;
  score = Math.max(0, Math.min(100, score));
  return { name: "Balance", score, grade: scoreToGrade(score) };
}

export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  // Periodization is scored by explicit conditions below — each issue is penalized
  // exactly once. The matching warnings (in periodization.ts) are the user-facing
  // mirror of these conditions, NOT a second deduction, so we do not also count them
  // here (doing so previously double-counted no-deload/static and over-penalized).
  let score = 100;
  if (!result.deloadDetected && !result.peakDetected && result.weeksDetected >= 4) score -= 20;
  if (
    result.volumePattern === "static" &&
    result.weeksDetected > 1 &&
    result.intensityProgression !== "rising"
  ) {
    score -= 20;
  }
  score = Math.max(0, Math.min(100, score));
  return { name: "Periodization", score, grade: scoreToGrade(score) };
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}
