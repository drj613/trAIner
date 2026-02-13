import { NextResponse } from 'next/server';
import { getRoutineById, parseRoutinePayload } from '@/lib/database/routines';

/**
 * GET /api/routines/:id
 * Returns stored routine document by ID. Same structure as POST request body.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const routine = await getRoutineById(id);

    if (!routine) {
      return NextResponse.json(
        { ok: false, error: 'not_found', message: 'Routine not found' },
        { status: 404 }
      );
    }

    const payload = parseRoutinePayload(routine);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: 'internal_error', message: 'Routine payload is invalid JSON' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...payload,
      routine_id: routine.id,
    });
  } catch (err) {
    console.error('GET /api/routines/:id error:', err);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
