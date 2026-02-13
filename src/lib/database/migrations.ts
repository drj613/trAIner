import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  'src',
  'lib',
  'database',
  'migrations'
);

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b));
}

export function applySqlMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT name FROM schema_migrations')
    .all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));
  const pending = listMigrationFiles().filter((file) => !applied.has(file));

  if (pending.length === 0) {
    return;
  }

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );

  const applyOne = db.transaction((fileName: string) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
    db.exec(sql);
    insertMigration.run(fileName, new Date().toISOString());
  });

  for (const fileName of pending) {
    applyOne(fileName);
  }
}
