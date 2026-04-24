import { NextResponse } from 'next/server';
import { createRoutine, listRoutines, parseRoutinePayload } from '@/lib/database/routines';
import { validateRoutineDocument, normalizeRoutineBody } from '@/lib/routines/validate';
import { SUPPORTED_SCHEMA_VERSION } from '@/lib/routines/types';

/**
 * POST /api/routines
 * Accepts routine document (or envelope with payload). Validates, stores, returns routine_id and warnings.
 * See ROUTINE_API_JSON_SPEC.md.
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

    const doc = normalizeRoutineBody(body);
    if (!doc) {
      return NextResponse.json(
        {
          ok: false,
          error: 'validation_failed',
          message: 'Missing routine document: provide either a routine object (schema_version, title, weeks, ...) or an envelope with "payload"',
          details: [{ path: '', code: 'missing_payload', message: 'Valid routine document or payload required' }],
        },
        { status: 400 }
      );
    }

    const result = validateRoutineDocument(doc);
    if (!result.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: result.errors.some((e) => e.code === 'invalid_schema_version')
            ? 'invalid_schema_version'
            : 'validation_failed',
          message:
            result.errors[0]?.code === 'invalid_schema_version'
              ? result.errors[0].message
              : 'Validation failed',
          details: result.errors,
        },
        { status: 400 }
      );
    }

    const routine = await createRoutine(doc);
    if (!routine) {
      return NextResponse.json(
        { ok: false, error: 'internal_error', message: 'Failed to store routine' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        routine_id: routine.id,
        schema_version: doc.schema_version ?? SUPPORTED_SCHEMA_VERSION,
        warnings: result.warnings,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/routines error:', err);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/routines
 * Returns imported routines for list view.
 */
export async function GET() {
  try {
    const rows = await listRoutines();
    const routines = rows
      .map((row) => {
        const payload = parseRoutinePayload(row);
        if (!payload) {
          return null;
        }
        return {
          id: row.id,
          title: payload.title,
          duration_weeks: payload.duration_weeks,
          days_per_week: payload.days_per_week,
          goals: payload.goals,
          created_at: row.created_at,
        };
      })
      .filter((routine): routine is NonNullable<typeof routine> => routine !== null);

    return NextResponse.json({ ok: true, routines });
  } catch (error) {
    console.error('GET /api/routines error:', error);
    return NextResponse.json(
      { ok: false, error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
