/**
 * Generic Drizzle migration runner
 *
 * Runs all pending migrations from drizzle/meta/_journal.json in order.
 * Uses drizzle-orm's migrate() so applied migrations are tracked in the DB.
 *
 * Usage:
 *   npm run db:migrate-all
 *   # or with explicit env:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migrate.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

async function runMigrations() {
  loadEnvLocal();

  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  if (databaseUrl.startsWith('DATABASE_URL=')) {
    databaseUrl = databaseUrl.substring('DATABASE_URL='.length);
    console.log('⚠️  Stripped DATABASE_URL= prefix from environment variable');
  }

  try {
    new URL(databaseUrl);
  } catch (urlError) {
    console.error('❌ Invalid DATABASE_URL format:', databaseUrl.substring(0, 50) + '...');
    console.error('   Error:', urlError instanceof Error ? urlError.message : String(urlError));
    process.exit(1);
  }

  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  if (!existsSync(migrationsFolder)) {
    console.error('❌ Migrations folder not found:', migrationsFolder);
    process.exit(1);
  }

  const maxRetries = 3;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = postgres(databaseUrl, {
      prepare: false,
      ssl: 'require',
      max: 1,
      connect_timeout: 15,
      idle_timeout: 30,
      max_lifetime: 60 * 5,
    });

    try {
      console.log('🔌 Connecting to database...');
      const db = drizzle(client);
      console.log('📂 Running migrations from', migrationsFolder);
      await migrate(db, { migrationsFolder });
      await client.end().catch(() => {});
      // Use write + callback so output is flushed before process exits (avoids lost output under npm)
      process.stdout.write('🎉 Migrations completed successfully.\n', () => {
        process.stdout.write('Done.\n', () => process.exit(0));
      });
      return;
    } catch (error) {
      const err = error as { cause?: { code?: string }; code?: string; message?: string };
      const code = err.cause?.code ?? err.code;
      const msg = (err.cause as Error)?.message ?? err.message ?? '';
      const isTransient =
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'CONNECTION_ENDED' ||
        String(msg).includes('ECONNRESET') ||
        String(msg).includes('ECONNREFUSED');

      await client.end().catch(() => {});

      if (isTransient && attempt < maxRetries) {
        console.warn(
          `⚠️  Connection error (${code ?? 'unknown'}), retry ${attempt}/${maxRetries} in ${retryDelayMs}ms...`
        );
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }

      console.error('❌ Migration failed:', error);
      const cause = (error as { cause?: { code?: string }; message?: string })?.cause;
      const pgCode = (cause as { code?: string })?.code;
      const errMsg = String((cause as Error)?.message ?? (error as Error)?.message ?? '');
      if (pgCode === '42P07' || errMsg.includes('already exists')) {
        console.error('\n💡 If the DB already has the schema (e.g. from db:push or manual setup), run:');
        console.error('   npm run db:baseline');
        console.error('   Then run db:migrate-all again for future migrations.');
      }
      process.exit(1);
    }
  }
}

runMigrations().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
