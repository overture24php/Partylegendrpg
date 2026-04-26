#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { getSupabase } from '../src/lib/supabase.js';

const supabase = getSupabase();

async function main() {
  console.log('🔧 Checking Supabase connection...');

  // Test connection
  const { data: healthCheck, error: healthErr } = await supabase
    .from('profiles')
    .select('count')
    .limit(0);

  if (healthErr?.code === '42P01') {
    console.log('⚠️  Table "profiles" not found. Migration required.');
    console.log('\n📋 Copy and run this SQL in Supabase Dashboard > SQL Editor:\n');

    const sqlPath = join(process.cwd(), 'supabase/migrations/001_initial_schema.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));

    process.exit(1);
  }

  if (healthErr) {
    console.error('❌ Connection failed:', healthErr.message);
    process.exit(1);
  }

  console.log('✅ Database connected and ready!');

  // Check schema
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);

  if (error) {
    console.error('❌ Schema check failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Found ${profiles?.length || 0} profile(s)`);
  console.log('\n🎉 Setup complete!');
}

main().catch(console.error);
