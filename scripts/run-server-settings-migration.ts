/**
 * Run server settings migration
 * Executes SQL from migration file directly
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  let databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  // Strip any accidental "DATABASE_URL=" prefix if present
  if (databaseUrl.startsWith('DATABASE_URL=')) {
    databaseUrl = databaseUrl.substring('DATABASE_URL='.length);
    console.log('⚠️  Stripped DATABASE_URL= prefix from environment variable');
  }

  // Validate URL format
  try {
    new URL(databaseUrl);
  } catch (urlError) {
    console.error('❌ Invalid DATABASE_URL format:', databaseUrl.substring(0, 50) + '...');
    console.error('   Error:', urlError instanceof Error ? urlError.message : String(urlError));
    process.exit(1);
  }

  console.log('📦 Reading migration file...');
  const migrationPath = join(process.cwd(), 'drizzle', '0004_add_server_settings_fields.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  const client = postgres(databaseUrl, {
    prepare: false,
    ssl: 'require',
    max: 1, // Single connection for migration
  });

  try {
    console.log('🔌 Connecting to database...');
    
    // Execute the entire migration SQL
    console.log('📝 Executing migration...');
    await client.unsafe(migrationSQL);
    
    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a "already exists" error
    if (
      errorMessage.includes('already exists') ||
      errorMessage.includes('duplicate') ||
      (errorMessage.includes('relation') && errorMessage.includes('already'))
    ) {
      console.log('⚠️  Some objects already exist (this is OK if migration was partially applied)');
      console.log('   Error details:', errorMessage.substring(0, 200));
    } else {
      console.error('❌ Migration failed:', errorMessage);
      process.exit(1);
    }
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
