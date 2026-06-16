/**
 * Run only server_invitations table migration
 * This is a minimal migration for the invitations feature
 */

import postgres from 'postgres';

async function runInvitationsMigration() {
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

  // Only the critical statements for server_invitations
  const criticalStatements = [
    // Create server_invitations table
    `CREATE TABLE IF NOT EXISTS "server_invitations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "server_id" uuid NOT NULL,
      "code" text NOT NULL,
      "created_by" uuid NOT NULL,
      "expires_at" timestamp,
      "max_uses" integer,
      "uses" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "server_invitations_code_unique" UNIQUE("code")
    )`,
    
    // Add foreign keys
    `DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'server_invitations_server_id_servers_id_fk'
      ) THEN
        ALTER TABLE "server_invitations" 
        ADD CONSTRAINT "server_invitations_server_id_servers_id_fk" 
        FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") 
        ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$`,
    
    `DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'server_invitations_created_by_users_id_fk'
      ) THEN
        ALTER TABLE "server_invitations" 
        ADD CONSTRAINT "server_invitations_created_by_users_id_fk" 
        FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") 
        ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$`,
    
    // Create indexes
    `CREATE UNIQUE INDEX IF NOT EXISTS "server_invitations_code_idx" 
     ON "server_invitations" USING btree ("code")`,
    
    `CREATE INDEX IF NOT EXISTS "server_invitations_server_id_idx" 
     ON "server_invitations" USING btree ("server_id")`,
  ];

  console.log(`📝 Executing ${criticalStatements.length} critical statements for server_invitations...`);

  // Use pooler URL if available, fallback to direct
  let connectionUrl = databaseUrl;
  
  // If using direct connection (db.*.supabase.co), try to use pooler instead
  if (databaseUrl.includes('db.') && databaseUrl.includes('.supabase.co:5432')) {
    // Replace db. with aws-1-eu-west-1.pooler. for pooler connection
    connectionUrl = databaseUrl.replace('db.', 'aws-1-eu-west-1.pooler.');
    console.log('🔄 Using pooler connection instead of direct...');
  }

  // Helper function to retry connection on transient errors
  async function connectWithRetry(maxRetries = 3): Promise<postgres.Sql> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = postgres(connectionUrl, {
          prepare: false,
          ssl: 'require',
          max: 1,
          connect_timeout: 30,
        });
        
        // Test connection
        await client`SELECT 1`;
        return client;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTransient = 
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('CONNECTION_ENDED') ||
          (error instanceof Error && 'code' in error && 
           (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'));
        
        if (isTransient && attempt < maxRetries) {
          console.log(`⚠️  Connection attempt ${attempt} failed (${errorMessage}), retrying in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Failed to connect after retries');
  }

  let client: postgres.Sql | null = null;

  try {
    console.log('🔌 Connecting to database...');
    
    // Connect with retry
    client = await connectWithRetry();
    console.log('✅ Connected successfully\n');
    
    if (!client) {
      throw new Error('Failed to establish database connection');
    }
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < criticalStatements.length; i++) {
      const statement = criticalStatements[i];

      if (!statement) {
        continue;
      }

      try {
        console.log(`[${i + 1}/${criticalStatements.length}] Executing...`);
        const preview = statement.substring(0, 80).replace(/\n/g, ' ');
        console.log(`   ${preview}...`);
        
        await client.unsafe(statement);
        successCount++;
        console.log(`   ✅ Success\n`);
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a "already exists" error
        if (
          errorMessage.includes('already exists') ||
          errorMessage.includes('duplicate') ||
          (errorMessage.includes('relation') && errorMessage.includes('already')) ||
          errorMessage.includes('constraint') && errorMessage.includes('already')
        ) {
          console.log(`   ⚠️  Already exists (skipped)\n`);
          successCount++;
          errorCount--;
        } else {
          console.error(`   ❌ Error: ${errorMessage}\n`);
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('✅ server_invitations table is ready to use');
    } else {
      console.log('\n⚠️  Migration completed with some errors (check logs above)');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run migration
runInvitationsMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
