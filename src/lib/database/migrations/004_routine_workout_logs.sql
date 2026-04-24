-- Migration: 004_routine_workout_logs
-- Description: SQLite set-level workout logging for routines (MVP)

CREATE TABLE IF NOT EXISTS routine_workout_logs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  workout_date TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_routine_workout_logs_routine_id
  ON routine_workout_logs(routine_id);

CREATE INDEX IF NOT EXISTS idx_routine_workout_logs_date
  ON routine_workout_logs(workout_date DESC);
