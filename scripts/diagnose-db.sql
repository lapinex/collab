-- ============================================
-- БЕЗОПАСНЫЕ SQL КОМАНДЫ ДЛЯ ДИАГНОСТИКИ БД
-- ============================================
-- Эти команды только читают данные, ничего не изменяют
-- Выполняйте их через psql, pgAdmin, или Supabase SQL Editor
-- ============================================

-- 1. ПРОВЕРКА СУЩЕСТВУЮЩИХ ТАБЛИЦ В ПУБЛИЧНОЙ СХЕМЕ
-- Показывает все таблицы в схеме public
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Альтернативный вариант: через information_schema
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema IN ('public', 'drizzle')
ORDER BY table_schema, table_name;

-- 2. ПРОВЕРКА СУЩЕСТВОВАНИЯ СХЕМЫ DRIZZLE
SELECT 
    schema_name,
    schema_owner
FROM information_schema.schemata
WHERE schema_name = 'drizzle';

-- 3. ПРОВЕРКА ТАБЛИЦЫ МИГРАЦИЙ __drizzle_migrations
-- Сначала проверяем, существует ли таблица
SELECT 
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema = 'drizzle' 
  AND table_name = '__drizzle_migrations';

-- Если таблица существует, смотрим её содержимое
SELECT 
    id,
    hash,
    created_at,
    TO_TIMESTAMP(created_at / 1000) as created_at_readable
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC;

-- 4. СТРУКТУРА ТАБЛИЦЫ audit_logs
-- Проверяем, существует ли таблица
SELECT 
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name = 'audit_logs';

-- Структура таблицы audit_logs (колонки, типы, ограничения)
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'audit_logs'
ORDER BY ordinal_position;

-- Индексы на таблице audit_logs
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'audit_logs';

-- Ограничения (constraints) на таблице audit_logs
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.audit_logs'::regclass;

-- 5. ПРОВЕРКА ВСЕХ СХЕМ В БАЗЕ
SELECT 
    nspname as schema_name,
    nspowner::regrole as owner
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'pg_toast', 'information_schema')
ORDER BY nspname;

-- 6. ПРОВЕРКА ПОДКЛЮЧЕНИЯ К БАЗЕ
-- Показывает текущую базу данных и пользователя
SELECT 
    current_database() as database_name,
    current_user as current_user,
    version() as postgres_version;

-- 7. ПРОВЕРКА ВСЕХ ТАБЛИЦ ВО ВСЕХ СХЕМАХ (кроме системных)
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename;

-- 8. ПРОВЕРКА ПОСЛЕДНИХ МИГРАЦИЙ (если таблица существует)
-- Показывает последние 10 применённых миграций
SELECT 
    id,
    LEFT(hash, 12) as hash_preview,
    created_at,
    TO_TIMESTAMP(created_at / 1000) as created_at_readable
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 10;

-- 9. ПРОВЕРКА КОЛИЧЕСТВА ЗАПИСЕЙ В audit_logs (если таблица существует)
SELECT 
    COUNT(*) as total_records
FROM public.audit_logs;

-- 10. ПРОВЕРКА СТРУКТУРЫ ВСЕХ ТАБЛИЦ В СХЕМЕ PUBLIC
SELECT 
    t.table_name,
    COUNT(c.column_name) as column_count
FROM information_schema.tables t
LEFT JOIN information_schema.columns c 
    ON t.table_schema = c.table_schema 
    AND t.table_name = c.table_name
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
GROUP BY t.table_name
ORDER BY t.table_name;
