/**
 * Baseline migrations: mark existing migrations as applied without running them.
 * Use when the DB already has the schema (e.g. from db:push or manual setup)
 * and "drizzle-kit migrate" fails with "relation already exists".
 *
 * Run: npm run db:baseline
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

function loadEnv(file: string) {
  const path = resolve(process.cwd(), file);
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
loadEnv('.env.local');
loadEnv('.env');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Create .env.local or set DATABASE_URL.');
    process.exit(1);
  }

  const migrationsDir = resolve(process.cwd(), 'drizzle');
  const journalPath = resolve(migrationsDir, 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    console.error('❌ drizzle/meta/_journal.json not found.');
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
    entries: Array< { tag: string; when: number } >;
  };
  if (!journal.entries?.length) {
    console.error('❌ No migration entries in journal.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { prepare: false, ssl: 'require' });

  try {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const existing = await sql.unsafe(
      'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1'
    ) as Array<{ id: number; hash: string; created_at: string | number }>;

    const lastEntry = journal.entries[journal.entries.length - 1]!;
    const lastCreatedAt = lastEntry.when;
    const lastCreated = existing.length > 0 ? Number(existing[0]!.created_at) : -1;
    if (lastCreated >= lastCreatedAt) {
      console.log('✅ Migrations already baselined (last applied ≥ target). Nothing to do.');
      await sql.end();
      return;
    }

    const toInsert = journal.entries.filter((e) => e.when > lastCreated);
    for (const entry of toInsert) {
      const migrationPath = resolve(migrationsDir, `${entry.tag}.sql`);
      if (!existsSync(migrationPath)) {
        console.error(`❌ Migration file not found: ${entry.tag}.sql`);
        process.exit(1);
      }
      const content = readFileSync(migrationPath, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');
      await sql.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when})`
      );
      console.log(`   Baselined: ${entry.tag} (created_at: ${entry.when})`);
    }
    console.log(`✅ Baselined ${toInsert.length} migration(s). You can now run: npm run db:migrate-all`);
  } catch (e) {
    console.error('❌ Baseline failed:', e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
