/**
 * Validates routine document per ROUTINE_API_JSON_SPEC.md.
 * Returns validation errors with path, code, message and optional warnings.
 */

import { type RoutineDocument, SUPPORTED_SCHEMA_VERSION } from './types';

export interface ValidationDetail {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationDetail[];
  warnings: string[];
}

function addError(
  errors: ValidationDetail[],
  path: string,
  code: string,
  message: string
): void {
  errors.push({ path, code, message });
}

function _addWarning(warnings: string[], message: string): void {
  warnings.push(message);
}

function validateSet(set: unknown, path: string, errors: ValidationDetail[]): void {
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    addError(errors, path, 'invalid_type', 'Set must be an object');
    return;
  }
  const s = set as Record<string, unknown>;
  if (typeof s.set_number !== 'number' || s.set_number < 1) {
    addError(errors, `${path}.set_number`, 'invalid', 'set_number is required and must be 1-based integer');
  }
  if (typeof s.reps !== 'number') {
    addError(errors, `${path}.reps`, 'invalid', 'reps is required and must be a number');
  }
}

function validateExercise(
  ex: unknown,
  path: string,
  exerciseIds: Set<string>,
  errors: ValidationDetail[]
): void {
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
    addError(errors, path, 'invalid_type', 'Exercise must be an object');
    return;
  }
  const e = ex as Record<string, unknown>;
  const id = e.exercise_id;
  if (id === undefined || id === null) {
    addError(errors, `${path}.exercise_id`, 'missing', 'exercise_id is required');
  } else if (typeof id !== 'string' || id.trim() === '') {
    addError(errors, `${path}.exercise_id`, 'invalid', 'exercise_id must be a non-empty string');
  } else if (exerciseIds.has(id)) {
    addError(errors, `${path}.exercise_id`, 'duplicate', 'exercise_id must be unique within routine');
  } else {
    exerciseIds.add(id);
  }
  if (typeof e.name !== 'string' || (e.name as string).trim() === '') {
    addError(errors, `${path}.name`, 'invalid', 'name is required and must be non-empty');
  }
  const sets = e.sets;
  if (!Array.isArray(sets) || sets.length === 0) {
    addError(errors, `${path}.sets`, 'invalid', 'sets is required and must be a non-empty array');
  } else {
    sets.forEach((set, i) => validateSet(set, `${path}.sets[${i}]`, errors));
  }
}

function validateDay(day: unknown, path: string, exerciseIds: Set<string>, errors: ValidationDetail[]): void {
  if (!day || typeof day !== 'object' || Array.isArray(day)) {
    addError(errors, path, 'invalid_type', 'Day must be an object');
    return;
  }
  const d = day as Record<string, unknown>;
  if (typeof d.day_number !== 'number' || d.day_number < 1) {
    addError(errors, `${path}.day_number`, 'invalid', 'day_number is required and must be 1-based integer');
  }
  if (typeof d.title !== 'string' || (d.title as string).trim() === '') {
    addError(errors, `${path}.title`, 'invalid', 'title is required and must be non-empty');
  }
  const exercises = d.exercises;
  if (!Array.isArray(exercises) || exercises.length === 0) {
    addError(errors, `${path}.exercises`, 'invalid', 'exercises is required and must be a non-empty array');
  } else {
    exercises.forEach((ex, i) => validateExercise(ex, `${path}.exercises[${i}]`, exerciseIds, errors));
  }
}

function validateWeek(week: unknown, path: string, exerciseIds: Set<string>, errors: ValidationDetail[]): void {
  if (!week || typeof week !== 'object' || Array.isArray(week)) {
    addError(errors, path, 'invalid_type', 'Week must be an object');
    return;
  }
  const w = week as Record<string, unknown>;
  if (typeof w.week_number !== 'number' || w.week_number < 1) {
    addError(errors, `${path}.week_number`, 'invalid', 'week_number is required and must be 1-based integer');
  }
  const days = w.days;
  if (!Array.isArray(days) || days.length === 0) {
    addError(errors, `${path}.days`, 'invalid', 'days is required and must be a non-empty array');
  } else {
    days.forEach((day, i) => validateDay(day, `${path}.days[${i}]`, exerciseIds, errors));
  }
}

export function validateRoutineDocument(doc: unknown): ValidationResult {
  const errors: ValidationDetail[] = [];
  const warnings: string[] = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: [{ path: '', code: 'invalid_type', message: 'Body must be a JSON object' }], warnings };
  }

  const d = doc as Record<string, unknown>;

  const schemaVersion = d.schema_version;
  if (schemaVersion === undefined || schemaVersion === null) {
    addError(errors, 'schema_version', 'missing', 'schema_version is required');
  } else if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    addError(
      errors,
      'schema_version',
      'invalid_schema_version',
      `Unsupported schema_version. Supported: "${SUPPORTED_SCHEMA_VERSION}"`
    );
  }

  if (typeof d.title !== 'string' || (d.title as string).trim() === '') {
    addError(errors, 'title', 'invalid', 'title is required and must be non-empty');
  }

  if (typeof d.duration_weeks !== 'number' || d.duration_weeks < 1) {
    addError(errors, 'duration_weeks', 'invalid', 'duration_weeks is required and must be >= 1');
  }

  if (typeof d.days_per_week !== 'number' || d.days_per_week < 1) {
    addError(errors, 'days_per_week', 'invalid', 'days_per_week is required and must be >= 1');
  }

  const weeks = d.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    addError(errors, 'weeks', 'invalid', 'weeks is required and must be a non-empty array');
  } else {
    const exerciseIds = new Set<string>();
    weeks.forEach((week, i) => validateWeek(week, `weeks[${i}]`, exerciseIds, errors));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Normalize body: if envelope (has payload), return payload; else return body as routine doc. */
export function normalizeRoutineBody(body: unknown): RoutineDocument | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.payload !== undefined && b.payload !== null && typeof b.payload === 'object' && !Array.isArray(b.payload)) {
    return b.payload as RoutineDocument;
  }
  if (b.schema_version !== undefined && b.weeks !== undefined) {
    return body as RoutineDocument;
  }
  return null;
}
