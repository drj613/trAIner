import type { TrainingGoal } from "@/lib/programs/types";

export type MuscleGroup =
  | "chest" | "lats" | "upper_back" | "lower_back"
  | "front_delts" | "side_delts" | "rear_delts"
  | "biceps" | "triceps" | "forearms"
  | "quads" | "hamstrings" | "glutes" | "calves"
  | "core" | "adductors" | "abductors"
  | "rotator_cuff" | "neck";

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest", "lats", "upper_back", "lower_back",
  "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves",
  "core", "adductors", "abductors",
  "rotator_cuff", "neck",
];

export type Severity = "green" | "yellow" | "red";
export type Grade = "A" | "B" | "C" | "D" | "F";

export const DIMENSION_KEYS = ["volume", "session", "balance", "periodization"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type GoalScope = {
  goal: TrainingGoal;
  partial: boolean;
  gradedDimensions: DimensionKey[];
};

export type AnalysisNote = { area: string; msg: string };

export type Warning = {
  severity: Severity;
  dimension: string;
  message: string;
};

export type VolumeLandmarks = {
  mv: number;
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
};

export type MuscleVolumeResult = {
  muscle: MuscleGroup;
  effectiveSets: number;
  severity: Severity;
  label: string;
  landmarks: VolumeLandmarks;
};

export type SessionResult = {
  dayId: string;
  dayTitle: string;
  exerciseCount: number;
  totalSets: number;
  workingSets: number;
  estimatedMinutes: number;
  muscleSetCounts: Partial<Record<MuscleGroup, number>>;
  warnings: Warning[];
};

export type BalanceResult = {
  pushPullRatio: number | null;
  upperLowerRatio: number | null;
  quadHamRatio: number | null;
  chestBackRatio: number | null;
  movementPatternsCovered: string[];
  movementPatternsMissing: string[];
  warnings: Warning[];
};

export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  deloadDetected: boolean;
  peakDetected: boolean;
  intensityProgression: "rising" | "flat" | "unknown";
  warnings: Warning[];
};

export type DimensionScore = {
  name: string;
  score: number;
  grade: Grade;
};

export type CoverageResult = {
  patternsCovered: string[];
  patternsMissing: string[];
  musclesTrained: MuscleGroup[];
  musclesUntrained: MuscleGroup[];
};

export type AnalysisResult = {
  overall: DimensionScore;
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
  coverage: CoverageResult;
  goalScope: GoalScope;
  notes: AnalysisNote[];
};

export type DimensionDisplay = {
  id: string;
  label: string;
  score: number;
  grade: Grade;
  status: "good" | "warn" | "bad";
  note: string;
  graded: boolean;
};

export type MuscleDisplay = {
  group: string;
  sets: number;
  mev: number;
  mavLo: number;
  mavHi: number;
  mrv: number;
  status: "green" | "yellow" | "red" | "untrained";
  flag?: string;
};

export type RatioDisplay = {
  id: string;
  label: string;
  value: string;
  verdict: "good" | "warn" | "bad";
  target: string;
  detail?: string;
};

export type SessionDisplay = {
  day: string;
  exercises: number;
  sets: number;
  workingSets: number;
  durationMin: number;
  status: "good" | "warn" | "bad";
  flag?: string;
};

export type FindingDisplay = {
  severity: "good" | "warn" | "bad" | "info";
  area: string;
  msg: string;
};

export type DisplayAnalysis = {
  durationMs: number;
  overall: { score: number; grade: string };
  goalScope: GoalScope;
  fingerprint: { primary: string; secondary: string | null; label: string };
  dimensions: DimensionDisplay[];
  muscles: MuscleDisplay[];
  ratios: RatioDisplay[];
  patterns: { covered: string[]; missing: string[] };
  sessions: SessionDisplay[];
  warnings: FindingDisplay[];
  strengths: string[];
};
