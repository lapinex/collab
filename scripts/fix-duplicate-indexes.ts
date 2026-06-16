/**
 * Исправление дублирующихся индексов
 * 
 * Удаляет обычные индексы, которые дублируют UNIQUE constraints.
 * Оставляет UNIQUE constraints, так как они обеспечивают целостность данных.
 * 
 * Проблема:
 * - developer_codes: developer_codes_code_idx (дублирует developer_codes_code_unique)
 * - email_whitelist: email_whitelist_email_idx (дублирует email_whitelist_email_unique)
 * - users: users_email_idx (дублирует users_email_unique)
 * - server_invitations: server_invitations_code_idx (дублирует server_invitations_code_unique)
 * 
 * Запуск: npm run db:fix-indexes
 * или: tsx scripts/fix-duplicate-indexes.ts
 */

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

// Индексы для удаления (обычные индексы, которые дублируют UNIQUE constraints)
const indexesToDrop = [
  { table: 'developer_codes', index: 'developer_codes_code_idx' },
  { table: 'email_whitelist', index: 'email_whitelist_email_idx' },
  { table: 'users', index: 'users_email_idx' },
  { table: 'server_invitations', index: 'server_invitations_code_idx' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Create .env.local or set DATABASE_URL.');
    process.exit(1);
  }

  console.log('🔧 Исправление дублирующихся индексов...\n');

  const sql = postgres(databaseUrl, { prepare: false, ssl: 'require' });

  try {
    // Проверяем существование индексов перед удалением
    console.log('📋 Проверка существующих индексов...\n');

    const existingIndexes: Array<{ table: string; index: string }> = [];

    for (const { table, index } of indexesToDrop) {
      const result = await sql.unsafe(`
        SELECT 
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = $1
          AND indexname = $2
      `, [table, index]) as Array<{ indexname: string; indexdef: string }>;

      if (result.length > 0) {
        existingIndexes.push({ table, index });
        console.log(`✅ Найден индекс: ${index} на таблице ${table}`);
        console.log(`   Определение: ${result[0]!.indexdef}\n`);
      } else {
        console.log(`⏭️  Индекс ${index} не найден на таблице ${table} (возможно, уже удалён)\n`);
      }
    }

    if (existingIndexes.length === 0) {
      console.log('✅ Все дублирующиеся индексы уже удалены. Ничего делать не нужно.\n');
      await sql.end();
      return;
    }

    // Проверяем, что UNIQUE constraints существуют (чтобы не сломать структуру)
    console.log('🔍 Проверка UNIQUE constraints...\n');

    const uniqueConstraints = [
      { table: 'developer_codes', constraint: 'developer_codes_code_unique' },
      { table: 'email_whitelist', constraint: 'email_whitelist_email_unique' },
      { table: 'users', constraint: 'users_email_unique' },
      { table: 'server_invitations', constraint: 'server_invitations_code_unique' },
    ];

    const missingConstraints: string[] = [];

    for (const { table, constraint } of uniqueConstraints) {
      const result = await sql.unsafe(`
        SELECT 
          conname,
          pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND conname = $2
      `, [`public.${table}`, constraint]) as Array<{ conname: string; definition: string }>;

      if (result.length > 0) {
        console.log(`✅ UNIQUE constraint найден: ${constraint} на таблице ${table}`);
        console.log(`   Определение: ${result[0]!.definition}\n`);
      } else {
        console.log(`⚠️  UNIQUE constraint не найден: ${constraint} на таблице ${table}`);
        missingConstraints.push(`${table}.${constraint}`);
      }
    }

    if (missingConstraints.length > 0) {
      console.error('\n❌ ОШИБКА: Отсутствуют UNIQUE constraints!');
      console.error('   Нельзя удалять индексы без UNIQUE constraints.');
      console.error(`   Отсутствующие constraints: ${missingConstraints.join(', ')}\n`);
      process.exit(1);
    }

    // Удаляем индексы
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗑️  УДАЛЕНИЕ ДУБЛИРУЮЩИХСЯ ИНДЕКСОВ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let dropped = 0;
    let failed = 0;

    for (const { table, index } of existingIndexes) {
      try {
        await sql.unsafe(`DROP INDEX IF EXISTS public.${index}`);
        console.log(`✅ Удалён индекс: ${index} (таблица: ${table})`);
        dropped++;
      } catch (error: any) {
        console.error(`❌ Ошибка при удалении индекса ${index}: ${error.message}`);
        failed++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ИТОГИ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Удалено индексов: ${dropped}`);
    if (failed > 0) {
      console.log(`❌ Ошибок: ${failed}`);
    }
    console.log(`✅ UNIQUE constraints сохранены (целостность данных не нарушена)`);
    console.log('\n✅ Исправление завершено!\n');

    // Финальная проверка
    console.log('🔍 Финальная проверка...\n');
    for (const { table, index } of indexesToDrop) {
      const result = await sql.unsafe(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = $1
          AND indexname = $2
      `, [table, index]) as Array<{ indexname: string }>;

      if (result.length === 0) {
        console.log(`✅ Индекс ${index} успешно удалён`);
      } else {
        console.log(`⚠️  Индекс ${index} всё ещё существует`);
      }
    }

  } catch (e: any) {
    console.error('\n❌ Ошибка при исправлении индексов:', e.message);
    if (e.code) {
      console.error(`   Код ошибки: ${e.code}`);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
