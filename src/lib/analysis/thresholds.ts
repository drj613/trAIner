import type { MuscleGroup, VolumeLandmarks } from "./types";

export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest:       { mv: 3, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 24 },
  lats:        { mv: 5, mev: 7, mavLow: 10, mavHigh: 20, mrv: 30 },
  upper_back:  { mv: 5, mev: 7, mavLow: 10, mavHigh: 20, mrv: 30 },
  lower_back:  { mv: 2, mev: 3, mavLow: 4,  mavHigh: 10, mrv: 16 },
  front_delts: { mv: 1, mev: 1, mavLow: 4,  mavHigh: 8,  mrv: 12 },
  side_delts:  { mv: 4, mev: 7, mavLow: 8,  mavHigh: 24, mrv: 30 },
  rear_delts:  { mv: 2, mev: 2, mavLow: 4,  mavHigh: 12, mrv: 20 },
  biceps:      { mv: 7, mev: 9, mavLow: 14, mavHigh: 20, mrv: 26 },
  triceps:     { mv: 2, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 20 },
  forearms:    { mv: 0, mev: 1, mavLow: 2,  mavHigh: 8,  mrv: 12 },
  quads:       { mv: 3, mev: 5, mavLow: 6,  mavHigh: 14, mrv: 18 },
  hamstrings:  { mv: 1, mev: 3, mavLow: 4,  mavHigh: 8,  mrv: 14 },
  glutes:      { mv: 4, mev: 7, mavLow: 8,  mavHigh: 24, mrv: 30 },
  calves:      { mv: 3, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 24 },
  core:        { mv: 0, mev: 0, mavLow: 8,  mavHigh: 16, mrv: 20 },
  adductors:   { mv: 1, mev: 2, mavLow: 4,  mavHigh: 10, mrv: 16 },
  abductors:   { mv: 1, mev: 2, mavLow: 4,  mavHigh: 10, mrv: 16 },
  rotator_cuff:{ mv: 0, mev: 0, mavLow: 2,  mavHigh: 6,  mrv: 10 },
  neck:        { mv: 0, mev: 0, mavLow: 2,  mavHigh: 6,  mrv: 10 },
};

export const SESSION_LIMITS = {
  exercises: { greenMin: 4, greenMax: 8, yellowMax: 10 },
  totalSets: { greenMin: 10, greenMax: 25, yellowMax: 30 },
  setsPerMuscle: { greenMax: 8, yellowMax: 10 },
  durationMinutes: { greenMin: 30, greenMax: 75, yellowMax: 90 },
  setsPerExercise: { greenMin: 2, greenMax: 5 },
} as const;

export const BALANCE_TARGETS = {
  pushPull:  { idealMin: 0.67, idealMax: 1.0, warnMax: 1.5 },
  upperLower:{ idealMin: 0.8,  idealMax: 1.2, warnMax: 2.0 },
  quadHam:   { idealMin: 1.0,  idealMax: 1.67, warnMax: 2.0 },
  chestBack: { idealMin: 0.67, idealMax: 1.0, warnMax: 1.5 },
} as const;

export const CORE_MOVEMENT_PATTERNS = [
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "hip_hinge",
  "squat",
] as const;

export const DIMENSION_WEIGHTS = {
  volume:        0.353,
  session:       0.235,
  balance:       0.294,
  periodization: 0.118,
} as const;

export const DEFAULT_SETS = 3;

export const TRAINING_AGE_MULTIPLIER: Record<string, number> = {
  beginner:     0.7,
  intermediate: 1.0,
  advanced:     1.25,
};

