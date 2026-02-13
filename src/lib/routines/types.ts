/**
 * Routine document types per ROUTINE_API_JSON_SPEC.md (schema version 1.0).
 * Used for API request/response and validation.
 */

export interface RoutineSet {
  set_number: number;
  reps: number;
  target_rpe?: number;
  target_weight?: number;
  rep_range?: string;
}

export interface RoutineExercise {
  exercise_id: string;
  name: string;
  movement_pattern?: string;
  primary_muscles?: string[];
  secondary_muscles?: string[];
  rest_seconds?: number;
  tempo?: string;
  notes?: string;
  alternatives?: string[];
  sets: RoutineSet[];
}

export interface RoutineDay {
  day_number: number;
  title: string;
  focus?: string[];
  exercises: RoutineExercise[];
}

export interface RoutineWeek {
  week_number: number;
  days: RoutineDay[];
}

export interface RoutineDocument {
  schema_version: string;
  routine_id?: string | null;
  title: string;
  duration_weeks: number;
  days_per_week: number;
  goals?: string[];
  equipment?: string[];
  notes?: string;
  weeks: RoutineWeek[];
}

/** Envelope for optional meta (payload + meta). */
export interface RoutineEnvelope {
  payload: RoutineDocument;
  meta?: {
    source?: string;
    persona_ids?: string[];
    schema_version?: string;
  };
}

export type RoutineRequestBody = RoutineDocument | RoutineEnvelope;

export const SUPPORTED_SCHEMA_VERSION = '1.0';
