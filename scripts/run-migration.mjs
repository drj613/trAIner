import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('🚀 Starting database setup...');
    
    const migrationSQL = readFileSync(
      join(__dirname, '../src/lib/database/migrations/001_initial_schema.sql'),
      'utf8'
    );

    console.log('📝 Migration SQL loaded, running via Supabase dashboard...');
    console.log('');
    console.log('⚠️  Please copy and paste the following SQL into your Supabase SQL Editor:');
    console.log('==========================================');
    console.log(migrationSQL);
    console.log('==========================================');
    console.log('');
    console.log('After running the SQL, the database schema will be ready!');
    
  } catch (error) {
    console.error('❌ Error reading migration file:', error);
    process.exit(1);
  }
}

runMigration();