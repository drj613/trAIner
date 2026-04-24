import { getDb } from './sqlite';

export interface RoutineWorkoutLog {
  id: string;
  routine_id: string;
  workout_date: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

export interface WorkoutLogPayload {
  routine_id: string;
  date: string;
  exercises: Array<{
    exercise_id: string;
    sets: Array<{
      set_number: number;
      reps: number;
      weight?: number;
      rpe?: number;
      notes?: string;
    }>;
  }>;
}

export async function createWorkoutLog(
  routineId: string,
  date: string,
  payload: WorkoutLogPayload
): Promise<RoutineWorkoutLog | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    db.query(
      `INSERT INTO routine_workout_logs (id, routine_id, workout_date, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, routineId, date, JSON.stringify(payload), now, now);
  } catch (error) {
    console.error('createWorkoutLog error:', error);
    return null;
  }

  const row = db
    .query(
      `SELECT id, routine_id, workout_date, payload, created_at, updated_at
       FROM routine_workout_logs
       WHERE id = ?`
    )
    .get(id) as RoutineWorkoutLog | undefined;

  return row ?? null;
}

export async function getWorkoutLogsByRoutine(
  routineId: string
): Promise<RoutineWorkoutLog[]> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, routine_id, workout_date, payload, created_at, updated_at
       FROM routine_workout_logs
       WHERE routine_id = ?
       ORDER BY workout_date DESC, created_at DESC`
    )
    .all(routineId) as RoutineWorkoutLog[];

  return rows;
}
