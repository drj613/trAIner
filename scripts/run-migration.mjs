import { spawnSync } from 'child_process';
import 'dotenv/config';

function runMigration() {
  const result = spawnSync('node', ['scripts/migrate.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runMigration();