import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from './migrate.mjs';

function resolveDbPath() {
  const rawPath = process.env.SQLITE_DB_PATH || './data/trainer.sqlite';
  return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
    console.log(`Removed ${filePath}`);
  }
}

function resetDb() {
  const dbPath = resolveDbPath();
  removeIfExists(dbPath);
  removeIfExists(`${dbPath}-wal`);
  removeIfExists(`${dbPath}-shm`);
  runMigrations();
}

resetDb();
