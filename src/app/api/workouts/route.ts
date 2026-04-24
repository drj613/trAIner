import { NextResponse } from 'next/server';
import { createWorkoutLog, type WorkoutLogPayload } from '@/lib/database/workoutLogs';
import { getRoutineById } from '@/lib/database/routines';

interface ValidationDetail {
  path: string;
  code: string;
  message: string;
}

function validateWorkoutPayload(body: unknown): { valid: boolean; errors: ValidationDetail[]; payload: WorkoutLogPayload | null } {
  const errors: ValidationDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: [{ path: '', code: 'invalid_type', message: 'Body must be a JSON object' }], payload: null };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.routine_id !== 'string' || b.routine_id.trim() === '') {
    errors.push({ path: 'routine_id', code: 'invalid', message: 'routine_id is required and must be a non-empty string' });
  }

  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    errors.push({ path: 'date', code: 'invalid', message: 'date is required and must be YYYY-MM-DD format' });
  }

  if (!Array.isArray(b.exercises) || b.exercises.length === 0) {
    errors.push({ path: 'exercises', code: 'invalid', message: 'exercises is required and must be a non-empty array' });
  } else {
    (b.exercises as unknown[]).forEach((ex, i) => {
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
        errors.push({ path: `exercises[${i}]`, code: 'invalid_type', message: 'Exercise must be an object' });
        return;
      }
      const e = ex as Record<string, unknown>;
      if (typeof e.exercise_id !== 'string' || (e.exercise_id as string).trim() === '') {
        errors.push({ path: `exercises[${i}].exercise_id`, code: 'invalid', message: 'exercise_id is required' });
      }
      if (!Array.isArray(e.sets) || e.sets.length === 0) {
        errors.push({ path: `exercises[${i}].sets`, code: 'invalid', message: 'sets is required and must be a non-empty array' });
      } else {
        (e.sets as unknown[]).forEach((s, j) => {
          if (!s || typeof s !== 'object' || Array.isArray(s)) {
            errors.push({ path: `exercises[${i}].sets[${j}]`, code: 'invalid_type', message: 'Set must be an object' });
            return;
          }
          const set = s as Record<string, unknown>;
          if (typeof set.set_number !== 'number') {
            errors.push({ path: `exercises[${i}].sets[${j}].set_number`, code: 'invalid', message: 'set_number is required' });
          }
          if (typeof set.reps !== 'number') {
            errors.push({ path: `exercises[${i}].sets[${j}].reps`, code: 'invalid', message: 'reps is required' });
          }
        });
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, payload: null };
  }

  return { valid: true, errors: [], payload: body as WorkoutLogPayload };
}

/**
 * POST /api/workouts
 * Logs a workout session with set-level data. See ROUTINE_API_JSON_SPEC.md §6.
 */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'validation_failed',
          message: 'Invalid JSON body',
          details: [{ path: '', code: 'invalid_json', message: 'Request body must be valid JSON' }],
        },
        { status: 400 }
      );
    }

    const result = validateWorkoutPayload(body);
    if (!result.valid || !result.payload) {
      return NextResponse.json(
        {
          ok: false,
          error: 'validation_failed',
          message: 'Validation failed',
          details: result.errors,
        },
        { status: 400 }
      );
    }

    // Verify routine exists
    const routine = await getRoutineById(result.payload.routine_id);
    if (!routine) {
      return NextResponse.json(
        { ok: false, error: 'not_found', message: 'Routine not found' },
        { status: 404 }
      );
    }

    const log = await createWorkoutLog(
      result.payload.routine_id,
      result.payload.date,
      result.payload
    );

    if (!log) {
      return NextResponse.json(
        { ok: false, error: 'internal_error', message: 'Failed to save workout log' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        workout_log_id: log.id,
        routine_id: log.routine_id,
        date: log.workout_date,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/workouts error:', err);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
