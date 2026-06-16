/**
 * Диагностика проблем с отображением сообщений в чате
 * 
 * Системный анализ:
 * 1. UI/Визуальный слой
 * 2. Состояние (State Management)
 * 3. Получение данных (Data Fetching)
 * 4. База данных и бэкенд
 * 5. Realtime подписки
 * 
 * Запуск: npm run diagnose:messages
 * или: tsx scripts/diagnose-messages.ts
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

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Create .env.local or set DATABASE_URL.');
    process.exit(1);
  }

  console.log('🔍 Диагностика проблем с отображением сообщений\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sql = postgres(databaseUrl, { prepare: false, ssl: 'require', max: 1 });

  try {
    // 1. Проверка структуры таблицы messages
    console.log('1. СТРУКТУРА ТАБЛИЦЫ messages');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const columns = await sql.unsafe(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'messages'
      ORDER BY ordinal_position
    `) as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>;
    
    if (columns.length > 0) {
      console.log('✅ Таблица messages существует\n');
      console.log('Колонки:');
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  • ${col.column_name}: ${col.data_type} ${nullable}${defaultValue}`);
      });
    } else {
      console.log('❌ Таблица messages не найдена!\n');
      await sql.end();
      return;
    }
    console.log('');

    // 2. Проверка наличия сообщений
    console.log('2. ПРОВЕРКА НАЛИЧИЯ СООБЩЕНИЙ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const totalMessages = await sql.unsafe(`
      SELECT COUNT(*) as count
      FROM public.messages
    `) as Array<{ count: string }>;
    
    console.log(`Всего сообщений в базе: ${totalMessages[0]?.count || 0}\n`);
    
    // Проверка по каналам
    const messagesByChannel = await sql.unsafe(`
      SELECT 
        c.id as channel_id,
        c.name as channel_name,
        c.server_id,
        COUNT(m.id) as message_count
      FROM public.channels c
      LEFT JOIN public.messages m ON m.channel_id = c.id
      GROUP BY c.id, c.name, c.server_id
      ORDER BY message_count DESC
      LIMIT 10
    `) as Array<{ channel_id: string; channel_name: string; server_id: string; message_count: string }>;
    
    console.log('Сообщения по каналам (топ 10):');
    messagesByChannel.forEach(ch => {
      console.log(`  • ${ch.channel_name} (${ch.channel_id.slice(0, 8)}...): ${ch.message_count} сообщений`);
    });
    console.log('');

    // 3. Проверка последних сообщений
    console.log('3. ПОСЛЕДНИЕ СООБЩЕНИЯ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const recentMessages = await sql.unsafe(`
      SELECT 
        m.id,
        m.channel_id,
        m.user_id,
        LEFT(m.content, 50) as content_preview,
        m.created_at,
        c.name as channel_name,
        u.name as user_name
      FROM public.messages m
      JOIN public.channels c ON c.id = m.channel_id
      JOIN public.users u ON u.id = m.user_id
      ORDER BY m.created_at DESC
      LIMIT 5
    `) as Array<{
      id: string;
      channel_id: string;
      user_id: string;
      content_preview: string;
      created_at: Date;
      channel_name: string;
      user_name: string;
    }>;
    
    if (recentMessages.length > 0) {
      console.log('Последние 5 сообщений:');
      recentMessages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.channel_name}] ${msg.user_name}: "${msg.content_preview}..."`);
        console.log(`     ID: ${msg.id.slice(0, 8)}..., Channel: ${msg.channel_id.slice(0, 8)}..., Created: ${msg.created_at}`);
      });
    } else {
      console.log('⚠️  Сообщений в базе нет');
    }
    console.log('');

    // 4. Проверка удалённых сообщений
    console.log('4. УДАЛЁННЫЕ СООБЩЕНИЯ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const deletedMessages = await sql.unsafe(`
      SELECT COUNT(*) as count
      FROM public.messages
      WHERE deleted_at IS NOT NULL
    `) as Array<{ count: string }>;
    
    console.log(`Удалённых сообщений: ${deletedMessages[0]?.count || 0}\n`);

    // 5. Проверка индексов
    console.log('5. ИНДЕКСЫ НА ТАБЛИЦЕ messages');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const indexes = await sql.unsafe(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' 
        AND tablename = 'messages'
    `) as Array<{ indexname: string; indexdef: string }>;
    
    if (indexes.length > 0) {
      indexes.forEach(idx => {
        console.log(`  • ${idx.indexname}`);
      });
    } else {
      console.log('⚠️  Индексы не найдены');
    }
    console.log('');

    // 6. Проверка связей (foreign keys)
    console.log('6. ПРОВЕРКА СВЯЗЕЙ (FOREIGN KEYS)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const foreignKeys = await sql.unsafe(`
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'public.messages'::regclass
        AND contype = 'f'
    `) as Array<{ constraint_name: string; constraint_definition: string }>;
    
    if (foreignKeys.length > 0) {
      foreignKeys.forEach(fk => {
        console.log(`  • ${fk.constraint_name}`);
        console.log(`    ${fk.constraint_definition}`);
      });
    } else {
      console.log('⚠️  Foreign keys не найдены');
    }
    console.log('');

    // 7. Проверка сообщений с проблемами
    console.log('7. ПРОВЕРКА ПРОБЛЕМНЫХ СООБЩЕНИЙ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Сообщения без канала
    const orphanMessages = await sql.unsafe(`
      SELECT COUNT(*) as count
      FROM public.messages m
      LEFT JOIN public.channels c ON c.id = m.channel_id
      WHERE c.id IS NULL
    `) as Array<{ count: string }>;
    
    console.log(`Сообщений без канала (orphan): ${orphanMessages[0]?.count || 0}`);
    
    // Сообщения без пользователя
    const messagesWithoutUser = await sql.unsafe(`
      SELECT COUNT(*) as count
      FROM public.messages m
      LEFT JOIN public.users u ON u.id = m.user_id
      WHERE u.id IS NULL
    `) as Array<{ count: string }>;
    
    console.log(`Сообщений без пользователя: ${messagesWithoutUser[0]?.count || 0}`);
    
    // Сообщения с пустым контентом
    const emptyMessages = await sql.unsafe(`
      SELECT COUNT(*) as count
      FROM public.messages
      WHERE content IS NULL OR TRIM(content) = ''
    `) as Array<{ count: string }>;
    
    console.log(`Сообщений с пустым контентом: ${emptyMessages[0]?.count || 0}\n`);

    // 8. Рекомендации
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 РЕКОМЕНДАЦИИ ПО ДИАГНОСТИКЕ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Проверьте консоль браузера (F12):');
    console.log('   - Откройте DevTools → Console');
    console.log('   - Ищите логи с префиксом [useMessages]');
    console.log('   - Проверьте наличие ошибок (красные сообщения)');
    console.log('');
    console.log('2. Проверьте Network tab:');
    console.log('   - Откройте DevTools → Network');
    console.log('   - Фильтр: XHR или Fetch');
    console.log('   - Найдите запрос к /api/messages?channelId=...');
    console.log('   - Проверьте статус ответа (должен быть 200)');
    console.log('   - Откройте Response и проверьте структуру данных');
    console.log('');
    console.log('3. Проверьте React DevTools:');
    console.log('   - Установите расширение React DevTools');
    console.log('   - Найдите компонент MessageList');
    console.log('   - Проверьте пропс messages - должен быть массив');
    console.log('');
    console.log('4. Проверьте Broadcast Channel:');
    console.log('   - В консоли ищите логи [Broadcast]');
    console.log('   - Должно быть: ✅ SUBSCRIBED to chat:...');
    console.log('');
    console.log('5. SQL для проверки конкретного канала:');
    console.log('   SELECT m.*, c.name as channel_name, u.name as user_name');
    console.log('   FROM messages m');
    console.log('   JOIN channels c ON c.id = m.channel_id');
    console.log('   JOIN users u ON u.id = m.user_id');
    console.log('   WHERE m.channel_id = \'YOUR_CHANNEL_ID\'');
    console.log('   ORDER BY m.created_at DESC;');
    console.log('');

  } catch (e: any) {
    console.error('❌ Ошибка при диагностике:', e.message);
    if (e.code) {
      console.error(`   Код ошибки: ${e.code}`);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
