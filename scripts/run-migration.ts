/**
 * Run database migration script
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
  const migrationPath = join(process.cwd(), 'drizzle', '0001_last_captain_stacy.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Parse SQL statements - split by statement-breakpoint and clean up
  const rawStatements = migrationSQL.split('--> statement-breakpoint');
  const statements: string[] = [];

  for (const raw of rawStatements) {
    const cleaned = raw.trim();
    if (!cleaned || cleaned.length < 5) continue;
    
    // Remove comment lines
    const lines = cleaned.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('--');
    });
    
    if (lines.length > 0) {
      statements.push(lines.join('\n'));
    }
  }

  console.log(`📝 Found ${statements.length} SQL statements to execute`);

  const client = postgres(databaseUrl, {
    prepare: false,
    ssl: 'require',
    max: 1, // Single connection for migration
  });

  try {
    console.log('🔌 Connecting to database...');
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.length < 10) continue; // Skip very short statements

      try {
        console.log(`\n[${i + 1}/${statements.length}] Executing statement...`);
        // Log first 100 chars for debugging
        const preview = statement.substring(0, 100).replace(/\n/g, ' ');
        console.log(`   ${preview}...`);
        
        await client.unsafe(statement);
        successCount++;
        console.log(`   ✅ Success`);
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a "already exists" error (table/column/index)
        if (
          errorMessage.includes('already exists') ||
          errorMessage.includes('duplicate') ||
          errorMessage.includes('relation') && errorMessage.includes('already')
        ) {
          console.log(`   ⚠️  Skipped (already exists): ${errorMessage.substring(0, 80)}`);
          successCount++; // Count as success since it's idempotent
          errorCount--;
        } else {
          console.error(`   ❌ Error: ${errorMessage}`);
          // Don't stop on error - continue with other statements
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some errors (check logs above)');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
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
