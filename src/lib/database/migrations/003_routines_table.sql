-- Migration: 003_routines_table
-- Description: SQLite routines table for MVP routine ingestion (JSON schema 1.0)

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routines_created_at
  ON routines(created_at DESC);
