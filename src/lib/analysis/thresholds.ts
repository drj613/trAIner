import type { GoalArchetype, MuscleGroup, VolumeLandmarks } from "./types";

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
  hamstrings:  { mv: 1, mev: 3, mavLow: 2,  mavHigh: 8,  mrv: 14 },
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
  volume:         0.30,
  session:        0.20,
  balance:        0.25,
  goalCoherence:  0.15,
  periodization:  0.10,
} as const;

export const DEFAULT_SETS = 3;

export const TRAINING_AGE_MULTIPLIER: Record<string, number> = {
  beginner:     0.7,
  intermediate: 1.0,
  advanced:     1.25,
};

export type GoalSectionWeights = Record<string, number>;

export const GOAL_SECTION_WEIGHTS: Record<GoalArchetype, GoalSectionWeights> = {
  hypertrophy:           { hypertrophy: 1.0, accessory: 0.7, strength: 0.3 },
  strength:              { strength: 1.0, power: 0.7, explosive: 0.2 },
  olympic_weightlifting: { explosive: 1.0, power: 0.9, strength: 0.7, mobility: 0.5 },
  general_fitness:       { conditioning: 0.7, cardio: 0.5, strength: 0.5, metcon: 0.5 },
  crossfit:              { metcon: 1.0, conditioning: 0.8, explosive: 0.5, strength: 0.4 },
  rehab:                 { rehab: 1.0, mobility: 0.8, warmup: 0.3 },
};

export const GOAL_COMPOUND_RATIO: Record<GoalArchetype, { min: number; max: number }> = {
  hypertrophy:           { min: 0.55, max: 0.75 },
  strength:              { min: 0.85, max: 0.95 },
  olympic_weightlifting: { min: 0.90, max: 1.00 },
  general_fitness:       { min: 0.75, max: 0.90 },
  crossfit:              { min: 0.85, max: 0.95 },
  rehab:                 { min: 0.40, max: 0.70 },
};

export const GOAL_REP_RANGES: Record<GoalArchetype, { heavy: number; moderate: number; light: number }> = {
  hypertrophy:           { heavy: 0.15, moderate: 0.55, light: 0.30 },
  strength:              { heavy: 0.50, moderate: 0.35, light: 0.15 },
  olympic_weightlifting: { heavy: 0.70, moderate: 0.20, light: 0.10 },
  general_fitness:       { heavy: 0.20, moderate: 0.45, light: 0.35 },
  crossfit:              { heavy: 0.25, moderate: 0.25, light: 0.50 },
  rehab:                 { heavy: 0.05, moderate: 0.30, light: 0.65 },
};
