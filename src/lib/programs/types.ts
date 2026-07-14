export type ISODate = string;
export type ID = string;

export type ProgramScope = "base" | "week" | "day";

export const TRAINING_GOALS = ["general", "hypertrophy", "strength", "endurance", "other"] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const SECTION_TYPES = [
  "warmup", "explosive", "strength", "power", "hypertrophy",
  "accessory", "metcon", "cardio", "conditioning", "rehab",
  "mobility", "cooldown", "training",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export type ProfileDocument = {
  id: "local-profile";
  name: string;
  goals: string[];
  primaryGoal?: TrainingGoal;
  equipment: string[];
  constraints: string[];
  trainingAge: string;
  defaultDaysPerWeek: number;
  updatedAt: ISODate;
  // Extended profile fields (optional so stored profiles without them still load)
  body?: {
    age?: string;
    height?: string;
    weight?: string;
    bodyfat?: string;
  };
  history?: string[];
  injuries?: string[];
  schedule?: string[];
  preferences?: string[];
};

export type ProgressionRule = {
  applies: string;
  rule: string;
};

export type ProgramDocument = {
  id: ID;
  title: string;
  description?: string;
  progression?: ProgressionRule[];
  source: "import" | "manual" | "backup";
  active: boolean;
  status?: "active" | "draft" | "archived";
  goal?: TrainingGoal;
  daysPerWeek?: number;
  lengthWeeks?: number;
  lastRunAt?: ISODate | null;
  streakWeeks?: number;
  completion?: number;
  origin?: string;
  days: ProgramDay[];
  overrides: ProgramOverride[];
  import?: {
    rawJson: unknown;
    warnings: ImportWarning[];
  };
  profileSnapshot?: ProfileDocument;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type ProgramDay = {
  id: ID;
  dayNumber: number;
  weekNumber?: number;
  // The EXPLICIT week this day declared at import time (`day.week`/
  // `day.weekNumber` in the raw payload), distinct from `weekNumber` above.
  // `weekNumber` gets overwritten by expandDays with the week a day was
  // expanded INTO; `templateWeek` is never touched by expansion and stays
  // undefined for a template-less base day even after cloning. It is the
  // stable identity import warning/resolution paths are keyed on — see
  // src/lib/import/paths.ts.
  templateWeek?: number;
  title: string;
  sections: ProgramSection[];
};

export type ProgramSection = {
  id: ID;
  type: SectionType;
  name: string;
  groups: ProgramGroup[];
};

export type ProgramGroup = {
  id: ID;
  type: "single" | "superset" | "circuit" | "giant-set";
  notes?: string;
  exercises: ProgramExercise[];
};

export type ProgramExercise = {
  id: ID;
  name: string;
  canonicalExerciseId?: ID;
  sets?: number;
  reps?: string;
  load?: string;
  rest?: string;
  tempo?: string;
  notes?: string;
  countsTowardVolume?: boolean;
  tags: {
    primary: string[];
    secondary: string[];
    incidental: string[];
    modifiers: string[];
  };
};

export type ProgramOverride = {
  id: ID;
  scope: Exclude<ProgramScope, "base">;
  programId: ID;
  weekNumber?: number;
  dayId?: ID;
  replacement: ProgramDay | ProgramDay[];
  reason?: string;
  createdAt: ISODate;
};

export type WorkoutLogDocument = {
  id: ID;
  programId: ID;
  dayId: ID;
  performedAt: ISODate;
  // Local calendar date (YYYY-MM-DD) the session belongs to, captured in the
  // user's timezone at save time. performedAt is UTC, so its date component
  // can disagree with the local date near midnight; this field is the source
  // of truth for "which day's session is this". Optional because legacy logs
  // predate it (v7 migration backfills, reads fall back via logLocalDate).
  performedDate?: string;
  // Set only when the user taps "Finish workout". Autosave preserves this
  // field without writing it. The day resolver uses it to advance past
  // completed days; absence means the workout is still in progress.
  completedAt?: ISODate;
  skippedAt?: ISODate;
  skipReason?: string;
  dayNote?: string;
  entries: WorkoutLogEntry[];
  notes?: string;
};

export type WorkoutLogEntry = {
  exerciseId: ID;
  exerciseName?: string;
  canonicalExerciseId?: ID;
  sets: WorkoutSetLog[];
  notes?: string;
};

export type WorkoutSetLog = {
  setNumber: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  notes?: string;
  rawCell?: string;
};

export type AliasDocument = {
  id: ID;
  alias: string;
  normalizedAlias: string;
  canonicalExerciseId: ID;
  createdAt: ISODate;
};

export type UserExerciseDocument = {
  id: ID;
  name: string;
  createdAt: ISODate;
};

export type ImportWarning = {
  path: string;
  rawName?: string;
  message: string;
  suggestions?: ExerciseSuggestion[];
  sectionType?: string;
};

export type ExerciseSuggestion = {
  exerciseId: ID;
  name: string;
  score: number;
};

export type BodyweightEntry = {
  id: ISODate;
  value: number;
  unit: "kg" | "lb";
  recordedAt: ISODate;
};

export type BackupDocument = {
  version: 1;
  exportedAt: ISODate;
  profile?: ProfileDocument;
  programs: ProgramDocument[];
  logs: WorkoutLogDocument[];
  aliases: AliasDocument[];
  userExercises?: UserExerciseDocument[];
  bodyweight?: BodyweightEntry[];
};

export const emptyTags = (): ProgramExercise["tags"] => ({
  primary: [],
  secondary: [],
  incidental: [],
  modifiers: []
});
