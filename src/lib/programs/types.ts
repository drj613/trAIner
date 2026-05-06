export type ISODate = string;
export type ID = string;

export type ProgramScope = "base" | "week" | "day";

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

export type ProgramDocument = {
  id: ID;
  title: string;
  description?: string;
  source: "import" | "manual" | "backup";
  active: boolean;
  status?: "active" | "draft" | "archived";
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
  entries: WorkoutLogEntry[];
  notes?: string;
};

export type WorkoutLogEntry = {
  exerciseId: ID;
  exerciseName?: string;
  canonicalExerciseId?: ID;
  sets: WorkoutSetLog[];
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
};

export type ExerciseSuggestion = {
  exerciseId: ID;
  name: string;
  score: number;
};

export type BackupDocument = {
  version: 1;
  exportedAt: ISODate;
  profile?: ProfileDocument;
  programs: ProgramDocument[];
  logs: WorkoutLogDocument[];
  aliases: AliasDocument[];
};

export const emptyTags = (): ProgramExercise["tags"] => ({
  primary: [],
  secondary: [],
  incidental: [],
  modifiers: []
});
