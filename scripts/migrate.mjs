import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';

function resolveDbPath() {
  const rawPath = process.env.SQLITE_DB_PATH || './data/trainer.sqlite';
  return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

function listMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b));
}

export function runMigrations() {
  try {
    const dbPath = resolveDbPath();
    const migrationsDir = path.join(
      process.cwd(),
      'src',
      'lib',
      'database',
      'migrations'
    );
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      db.query('SELECT name FROM schema_migrations').all().map((row) => row.name)
    );
    const pending = listMigrationFiles(migrationsDir).filter((name) => !applied.has(name));

    if (pending.length === 0) {
      console.log('No pending migrations');
      db.close();
      return;
    }

    const insertStmt = db.query(
      'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
    );
    const applyOne = db.transaction((name) => {
      const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
      db.exec(sql);
      insertStmt.run(name, new Date().toISOString());
    });

    for (const name of pending) {
      applyOne(name);
      console.log(`Applied migration: ${name}`);
    }

    db.close();
    console.log(`Database ready at: ${dbPath}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
