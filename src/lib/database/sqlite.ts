import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applySqlMigrations } from './migrations';

let dbInstance: Database.Database | null = null;

function getDbPath(): string {
  const explicitPath = process.env.SQLITE_DB_PATH?.trim();
  if (explicitPath) {
    return path.isAbsolute(explicitPath)
      ? explicitPath
      : path.join(process.cwd(), explicitPath);
  }
  return path.join(process.cwd(), 'data', 'trainer.sqlite');
}

function ensureDbDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDbPath();
  ensureDbDirectory(dbPath);
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  applySqlMigrations(dbInstance);

  return dbInstance;
}

export function checkDatabaseHealth(): { ok: boolean; error?: string } {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}
