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

export type GoalArchetype =
  | "hypertrophy" | "strength" | "olympic_weightlifting"
  | "general_fitness" | "crossfit" | "rehab";

export type Severity = "green" | "yellow" | "red";
export type Grade = "A" | "B" | "C" | "D" | "F";

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

export type GoalSignature = {
  primary: GoalArchetype;
  secondary: GoalArchetype | null;
  confidence: number;
  fingerprint: string;
};

export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  deloadDetected: boolean;
  warnings: Warning[];
};

export type DimensionScore = {
  name: string;
  score: number;
  grade: Grade;
};

export type AnalysisResult = {
  overall: DimensionScore;
  dimensions: {
    volume: DimensionScore;
    session: DimensionScore;
    balance: DimensionScore;
    goalCoherence: DimensionScore;
    periodization: DimensionScore;
  };
  muscleVolumes: MuscleVolumeResult[];
  sessions: SessionResult[];
  balance: BalanceResult;
  goal: GoalSignature;
  periodization: PeriodizationResult;
  warnings: Warning[];
};

export type DimensionDisplay = {
  id: string;
  label: string;
  score: number;
  grade: Grade;
  status: "good" | "warn" | "bad";
  note: string;
};

export type MuscleDisplay = {
  group: string;
  sets: number;
  mev: number;
  mavLo: number;
  mavHi: number;
  mrv: number;
  status: "green" | "yellow" | "red";
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
  fingerprint: { primary: string; secondary: string | null; label: string; confidence: number };
  dimensions: DimensionDisplay[];
  muscles: MuscleDisplay[];
  ratios: RatioDisplay[];
  patterns: { covered: string[]; missing: string[] };
  sessions: SessionDisplay[];
  warnings: FindingDisplay[];
  strengths: string[];
};
