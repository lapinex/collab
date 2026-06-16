/**
 * Диагностика состояния базы данных PostgreSQL
 * 
 * Безопасные SQL запросы для проверки:
 * - Существующих таблиц
 * - Схемы drizzle
 * - Таблицы миграций __drizzle_migrations
 * - Структуры таблицы audit_logs
 * 
 * Запуск: npm run db:diagnose
 * или: tsx scripts/diagnose-db.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
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

  console.log('🔍 Диагностика базы данных...\n');
  console.log('📡 Подключение к базе данных...\n');

  const sql = postgres(databaseUrl, { 
    prepare: false, 
    ssl: 'require',
    max: 1,
  });

  try {
    // 1. Проверка подключения
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. ПРОВЕРКА ПОДКЛЮЧЕНИЯ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const dbInfo = await sql.unsafe(`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as postgres_version
    `) as Array<{ database_name: string; current_user: string; postgres_version: string }>;
    
    if (dbInfo.length > 0) {
      console.log(`✅ База данных: ${dbInfo[0]!.database_name}`);
      console.log(`✅ Пользователь: ${dbInfo[0]!.current_user}`);
      console.log(`✅ Версия: ${dbInfo[0]!.postgres_version.split('\n')[0]}\n`);
    }

    // 2. Проверка существующих таблиц в public
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2. ТАБЛИЦЫ В СХЕМЕ PUBLIC');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const publicTables = await sql.unsafe(`
      SELECT 
        tablename,
        tableowner
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `) as Array<{ tablename: string; tableowner: string }>;
    
    if (publicTables.length > 0) {
      console.log(`Найдено таблиц: ${publicTables.length}\n`);
      publicTables.forEach(t => {
        console.log(`  • ${t.tablename} (owner: ${t.tableowner})`);
      });
    } else {
      console.log('⚠️  Таблиц в схеме public не найдено');
    }
    console.log('');

    // 3. Проверка схемы drizzle
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3. СХЕМА DRIZZLE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const drizzleSchema = await sql.unsafe(`
      SELECT 
        schema_name,
        schema_owner
      FROM information_schema.schemata
      WHERE schema_name = 'drizzle'
    `) as Array<{ schema_name: string; schema_owner: string }>;
    
    if (drizzleSchema.length > 0) {
      console.log(`✅ Схема drizzle существует`);
      console.log(`   Owner: ${drizzleSchema[0]!.schema_owner}\n`);
    } else {
      console.log('⚠️  Схема drizzle не существует\n');
    }

    // 4. Проверка таблицы миграций
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('4. ТАБЛИЦА МИГРАЦИЙ __drizzle_migrations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const migrationsTable = await sql.unsafe(`
      SELECT 
        table_schema,
        table_name
      FROM information_schema.tables
      WHERE table_schema = 'drizzle' 
        AND table_name = '__drizzle_migrations'
    `) as Array<{ table_schema: string; table_name: string }>;
    
    if (migrationsTable.length > 0) {
      console.log('✅ Таблица __drizzle_migrations существует\n');
      
      // Смотрим содержимое
      const migrations = await sql.unsafe(`
        SELECT 
          id,
          hash,
          created_at,
          TO_TIMESTAMP(created_at / 1000) as created_at_readable
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 10
      `) as Array<{ id: number; hash: string; created_at: number | string; created_at_readable: Date }>;
      
      if (migrations.length > 0) {
        console.log(`Найдено миграций в базе: ${migrations.length}\n`);
        migrations.forEach(m => {
          const hashPreview = typeof m.hash === 'string' ? m.hash.slice(0, 12) : 'N/A';
          console.log(`  • ID: ${m.id}, Hash: ${hashPreview}..., Created: ${m.created_at_readable}`);
        });
        
        // Проверяем соответствие с журналом миграций
        const journalPath = resolve(process.cwd(), 'drizzle', 'meta', '_journal.json');
        if (existsSync(journalPath)) {
          const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
            entries: Array<{ tag: string; when: number }>;
          };
          
          console.log('\n📋 Сравнение с журналом миграций:');
          const appliedHashes = new Set(migrations.map(m => m.hash));
          
          for (const entry of journal.entries) {
            const migrationPath = resolve(process.cwd(), 'drizzle', `${entry.tag}.sql`);
            if (existsSync(migrationPath)) {
              const content = readFileSync(migrationPath, 'utf-8');
              const hash = createHash('sha256').update(content).digest('hex');
              const isApplied = appliedHashes.has(hash);
              console.log(`  ${isApplied ? '✅' : '⚠️ '} ${entry.tag} (${isApplied ? 'применена' : 'не применена'})`);
            }
          }
        }
        console.log('');
      } else {
        console.log('⚠️  Таблица пуста (миграции не применены)\n');
      }
    } else {
      console.log('⚠️  Таблица __drizzle_migrations не существует\n');
    }

    // 5. Проверка таблицы audit_logs
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('5. ТАБЛИЦА audit_logs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const auditLogsTable = await sql.unsafe(`
      SELECT 
        table_schema,
        table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
    `) as Array<{ table_schema: string; table_name: string }>;
    
    if (auditLogsTable.length > 0) {
      console.log('✅ Таблица audit_logs существует\n');
      
      // Структура таблицы
      const columns = await sql.unsafe(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = 'audit_logs'
        ORDER BY ordinal_position
      `) as Array<{
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
        column_default: string | null;
      }>;
      
      console.log('Структура таблицы:');
      columns.forEach(col => {
        const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  • ${col.column_name}: ${col.data_type}${maxLength} ${nullable}${defaultValue}`);
      });
      console.log('');
      
      // Индексы
      const indexes = await sql.unsafe(`
        SELECT 
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = 'audit_logs'
      `) as Array<{ indexname: string; indexdef: string }>;
      
      if (indexes.length > 0) {
        console.log('Индексы:');
        indexes.forEach(idx => {
          console.log(`  • ${idx.indexname}`);
        });
        console.log('');
      }
      
      // Количество записей
      const count = await sql.unsafe(`
        SELECT COUNT(*) as total
        FROM public.audit_logs
      `) as Array<{ total: string }>;
      
      console.log(`Количество записей: ${count[0]?.total || 0}\n`);
    } else {
      console.log('⚠️  Таблица audit_logs не существует\n');
    }

    // 6. Итоговая сводка
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('6. ИТОГОВАЯ СВОДКА');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Подключение к базе: успешно`);
    console.log(`✅ Таблиц в public: ${publicTables.length}`);
    console.log(`${drizzleSchema.length > 0 ? '✅' : '⚠️ '} Схема drizzle: ${drizzleSchema.length > 0 ? 'существует' : 'не существует'}`);
    console.log(`${migrationsTable.length > 0 ? '✅' : '⚠️ '} Таблица миграций: ${migrationsTable.length > 0 ? 'существует' : 'не существует'}`);
    console.log(`${auditLogsTable.length > 0 ? '✅' : '⚠️ '} Таблица audit_logs: ${auditLogsTable.length > 0 ? 'существует' : 'не существует'}`);
    console.log('');

    // Рекомендации
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 РЕКОМЕНДАЦИИ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (auditLogsTable.length > 0 && migrationsTable.length === 0) {
      console.log('⚠️  Таблица audit_logs существует, но таблица миграций отсутствует.');
      console.log('   Возможно, таблицы были созданы вручную или через db:push.');
      console.log('   Рекомендуется: запустить npm run db:baseline\n');
    }
    
    if (drizzleSchema.length === 0) {
      console.log('⚠️  Схема drizzle не существует.');
      console.log('   Она будет создана автоматически при первой миграции.\n');
    }
    
    if (migrationsTable.length > 0) {
      const migrations = await sql.unsafe(`
        SELECT COUNT(*) as count
        FROM drizzle.__drizzle_migrations
      `) as Array<{ count: string }>;
      
      if (parseInt(migrations[0]?.count || '0') === 0) {
        console.log('⚠️  Таблица миграций пуста.');
        console.log('   Рекомендуется: запустить npm run db:baseline\n');
      }
    }

  } catch (error: any) {
    console.error('❌ Ошибка при диагностике:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Проблема с подключением к Supabase:');
      console.error('   - Проверьте правильность DATABASE_URL в .env.local');
      console.error('   - Убедитесь, что используете правильный хост (не pooler, если нужен прямой доступ)');
      console.error('   - Проверьте настройки сети и файрвола\n');
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
