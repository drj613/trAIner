const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveDbPath() {
  const rawPath = process.env.SQLITE_DB_PATH || './data/trainer.sqlite';
  return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
    console.log(`🗑️  Removed ${filePath}`);
  }
}

function resetDb() {
  const dbPath = resolveDbPath();
  removeIfExists(dbPath);
  removeIfExists(`${dbPath}-wal`);
  removeIfExists(`${dbPath}-shm`);

  const result = spawnSync('node', ['scripts/migrate.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

resetDb();
