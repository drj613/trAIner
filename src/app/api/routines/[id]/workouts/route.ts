import { NextResponse } from 'next/server';
import { getRoutineById } from '@/lib/database/routines';
import { getWorkoutLogsByRoutine } from '@/lib/database/workoutLogs';

/**
 * GET /api/routines/:id/workouts
 * Returns historical workout logs for a routine.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify routine exists
    const routine = await getRoutineById(id);
    if (!routine) {
      return NextResponse.json(
        { ok: false, error: 'not_found', message: 'Routine not found' },
        { status: 404 }
      );
    }

    const logs = await getWorkoutLogsByRoutine(id);

    return NextResponse.json({
      ok: true,
      routine_id: id,
      workouts: logs.map((log) => ({
        workout_log_id: log.id,
        date: log.workout_date,
        ...(JSON.parse(log.payload) as Record<string, unknown>),
      })),
    });
  } catch (err) {
    console.error('GET /api/routines/:id/workouts error:', err);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
