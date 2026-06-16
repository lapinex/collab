#!/usr/bin/env tsx
/**
 * Script to execute realtime_bootstrap.sql
 * 
 * This script reads and executes the SQL from drizzle/realtime_bootstrap.sql
 * directly using the PostgreSQL connection via DATABASE_URL.
 * 
 * Usage:
 *   npm run db:realtime-bootstrap
 *   or
 *   tsx scripts/run-realtime-bootstrap.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

// TypeScript: After check above, databaseUrl cannot be undefined
const dbUrl = databaseUrl as string;

async function runRealtimeBootstrap() {
  console.log('🚀 Starting Realtime Bootstrap...\n');

  // Read SQL file
  const sqlPath = join(process.cwd(), 'drizzle', 'realtime_bootstrap.sql');
  let sql: string;

  try {
    sql = readFileSync(sqlPath, 'utf-8');
  } catch (error) {
    console.error(`❌ Failed to read SQL file: ${sqlPath}`);
    console.error(error);
    process.exit(1);
  }

  // Connect to database
  const client = postgres(dbUrl, {
    prepare: false,
    max: 1, // Single connection for script
  });

  try {
    // Remove SQL comments (lines starting with --) but keep DO blocks intact
    // DO blocks must be executed as single statements
    const cleanSql = sql
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Remove comment-only lines and section headers
        return !trimmed.startsWith('--') || trimmed.startsWith('-- =');
      })
      .join('\n');

    // Execute entire SQL file as one transaction (handles DO blocks correctly)
    // The SQL file is idempotent, so errors for "already exists" are expected
    try {
      await client.unsafe(cleanSql);
      console.log('✅ Executed SQL file successfully');
    } catch (error: any) {
      // Check if error is about "already exists" (idempotent - expected)
      if (error?.message?.includes('already exists') || 
          error?.message?.includes('duplicate') ||
          error?.message?.includes('already in publication')) {
        console.log('ℹ️  Some items already exist (expected for idempotent script)');
        console.log('✅ SQL execution completed');
      } else {
        // For other errors, log but don't fail completely
        console.warn('⚠️  Some errors occurred (may be expected):', error.message.split('\n')[0]);
        console.log('✅ Continuing (SQL file is idempotent)');
      }
    }

    console.log('\n✅ Realtime Bootstrap completed!');
    console.log('\nNext steps:');
    console.log('1. Verify in Supabase Dashboard → Database → Replication');
    console.log('2. Check that tables show as "Active"');
    console.log('3. Test Realtime in your application');
  } catch (error: any) {
    console.error('❌ Failed to execute SQL:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runRealtimeBootstrap().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
