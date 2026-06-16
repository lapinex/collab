/**
 * Синхронизация миграций: проверяет все миграции из журнала
 * и помечает недостающие как применённые.
 * 
 * Используйте когда:
 * - Таблицы уже существуют (созданы через db:push)
 * - В базе применена только часть миграций
 * - Нужно синхронизировать состояние миграций с реальной БД
 * 
 * Запуск: npm run db:sync-migrations
 * или: tsx scripts/sync-migrations.ts
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
    entries: Array<{ tag: string; when: number }>;
  };
  if (!journal.entries?.length) {
    console.error('❌ No migration entries in journal.');
    process.exit(1);
  }

  console.log('🔄 Синхронизация миграций...\n');
  console.log(`📋 Найдено миграций в журнале: ${journal.entries.length}\n`);

  const sql = postgres(databaseUrl, { prepare: false, ssl: 'require' });

  try {
    // Создаём схему и таблицу если нужно
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // Получаем все применённые миграции
    const applied = await sql.unsafe(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'
    ) as Array<{ hash: string; created_at: number | string }>;

    const appliedHashes = new Set(applied.map(m => m.hash));
    console.log(`✅ Применённых миграций в базе: ${applied.length}\n`);

    // Обрабатываем каждую миграцию из журнала
    let added = 0;
    let skipped = 0;

    for (const entry of journal.entries) {
      const migrationPath = resolve(migrationsDir, `${entry.tag}.sql`);
      if (!existsSync(migrationPath)) {
        console.log(`⚠️  Файл миграции не найден: ${entry.tag}.sql`);
        continue;
      }

      const content = readFileSync(migrationPath, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');

      if (appliedHashes.has(hash)) {
        console.log(`⏭️  Пропущено: ${entry.tag} (уже применена)`);
        skipped++;
        continue;
      }

      // Проверяем, нет ли миграции с таким же created_at
      const existingByTime = applied.find(m => Number(m.created_at) === entry.when);
      if (existingByTime) {
        console.log(`⚠️  Миграция с таким же created_at уже существует: ${entry.tag}`);
        console.log(`   Применённая hash: ${existingByTime.hash.slice(0, 12)}...`);
        console.log(`   Текущая hash: ${hash.slice(0, 12)}...`);
        console.log(`   ⚠️  Hash не совпадает! Возможно, миграция была изменена.`);
        skipped++;
        continue;
      }

      // Добавляем миграцию
      await sql.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when})`
      );
      console.log(`✅ Добавлено: ${entry.tag} (hash: ${hash.slice(0, 12)}..., created_at: ${entry.when})`);
      added++;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ИТОГИ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Добавлено новых миграций: ${added}`);
    console.log(`⏭️  Пропущено (уже применены): ${skipped}`);
    console.log(`📋 Всего в журнале: ${journal.entries.length}`);
    console.log(`📋 Всего в базе: ${applied.length + added}`);

    if (added > 0) {
      console.log('\n✅ Синхронизация завершена! Теперь можно запустить: npm run db:migrate');
    } else {
      console.log('\n✅ Все миграции уже синхронизированы.');
    }

  } catch (e: any) {
    console.error('❌ Ошибка при синхронизации:', e.message);
    if (e.code) {
      console.error(`   Код ошибки: ${e.code}`);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
