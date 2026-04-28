export type ISODate = string;
export type ID = string;

export type ProgramScope = "base" | "week" | "day";

export type SectionType =
  | "warmup"
  | "explosive"
  | "strength"
  | "power"
  | "hypertrophy"
  | "accessory"
  | "metcon"
  | "cardio"
  | "conditioning"
  | "rehab"
  | "mobility"
  | "cooldown"
  | "training";

export type ProfileDocument = {
  id: "local-profile";
  name: string;
  goals: string[];
  equipment: string[];
  constraints: string[];
  trainingAge: string;
  defaultDaysPerWeek: number;
  updatedAt: ISODate;
};

export type ProgramDocument = {
  id: ID;
  title: string;
  description?: string;
  source: "import" | "manual" | "backup";
  active: boolean;
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
  canonicalExerciseId?: ID;
  sets: WorkoutSetLog[];
};

export type WorkoutSetLog = {
  setNumber: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  notes?: string;
};

export type AliasDocument = {
  id: ID;
  alias: string;
  normalizedAlias: string;
  canonicalExerciseId: ID;
  createdAt: ISODate;
};

export type ImportWarning = {
  path: string;
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
