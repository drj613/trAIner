import type { RoutineDocument } from '@/lib/routines/types';
import { getDb } from './sqlite';

export interface RoutineRecord {
  id: string;
  schema_version: string;
  title: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

function mapRoutine(row: RoutineRecord | undefined): RoutineRecord | null {
  return row ?? null;
}

export function parseRoutinePayload(
  routine: Pick<RoutineRecord, 'payload'>
): RoutineDocument | null {
  try {
    return JSON.parse(routine.payload) as RoutineDocument;
  } catch {
    return null;
  }
}

export async function createRoutine(doc: RoutineDocument): Promise<RoutineRecord | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = (doc.routine_id && doc.routine_id.trim()) || crypto.randomUUID();

  try {
    db.query(
      `INSERT INTO routines (id, schema_version, title, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, doc.schema_version ?? '1.0', doc.title, JSON.stringify(doc), now, now);
  } catch (error) {
    console.error('createRoutine error:', error);
    return null;
  }

  return getRoutineById(id);
}

export async function getRoutineById(
  routineId: string
): Promise<RoutineRecord | null> {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, schema_version, title, payload, created_at, updated_at
       FROM routines
       WHERE id = ?`
    )
    .get(routineId) as RoutineRecord | undefined;

  return mapRoutine(row);
}

export async function listRoutines(): Promise<RoutineRecord[]> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, schema_version, title, payload, created_at, updated_at
       FROM routines
       ORDER BY created_at DESC`
    )
    .all() as RoutineRecord[];

  return rows;
}
