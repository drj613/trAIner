import { createClient } from '@/lib/supabase/server';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Migration {
  id: string;
  name: string;
  sql: string;
  applied_at?: string;
}

export async function runMigrations() {
  const supabase = await createClient();

  // Create migrations table if it doesn't exist
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  });

  // Get list of applied migrations
  const { data: appliedMigrations } = await supabase
    .from('migrations')
    .select('id');

  const appliedIds = new Set(appliedMigrations?.map(m => m.id) || []);

  // Define migrations in order
  const migrations: Migration[] = [
    {
      id: '001',
      name: 'initial_schema',
      sql: readFileSync(
        join(process.cwd(), 'src/lib/database/migrations/001_initial_schema.sql'),
        'utf8'
      ),
    },
  ];

  // Run pending migrations
  for (const migration of migrations) {
    if (!appliedIds.has(migration.id)) {
      console.log(`Running migration ${migration.id}: ${migration.name}`);

      // Execute migration SQL
      await supabase.rpc('exec_sql', { sql: migration.sql });

      // Record migration as applied
      await supabase.from('migrations').insert({
        id: migration.id,
        name: migration.name,
      });

      console.log(`Migration ${migration.id} completed`);
    }
  }

  console.log('All migrations completed');
}