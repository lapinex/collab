-- ============================================
-- ИСПРАВЛЕНИЕ ДУБЛИРУЮЩИХСЯ ИНДЕКСОВ
-- ============================================
-- Удаляет обычные индексы, которые дублируют UNIQUE constraints.
-- Оставляет UNIQUE constraints для обеспечения целостности данных.
-- ============================================

-- 1. ПРОВЕРКА СУЩЕСТВУЮЩИХ ИНДЕКСОВ
-- Проверяем, какие индексы существуют на проблемных таблицах

-- developer_codes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'developer_codes'
  AND indexname IN ('developer_codes_code_idx', 'developer_codes_code_unique');

-- email_whitelist
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'email_whitelist'
  AND indexname IN ('email_whitelist_email_idx', 'email_whitelist_email_unique');

-- users
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'users'
  AND indexname IN ('users_email_idx', 'users_email_unique');

-- server_invitations
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'server_invitations'
  AND indexname IN ('server_invitations_code_idx', 'server_invitations_code_unique');

-- 2. ПРОВЕРКА UNIQUE CONSTRAINTS
-- Убеждаемся, что UNIQUE constraints существуют (они должны остаться)

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.developer_codes'::regclass
  AND conname = 'developer_codes_code_unique';

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.email_whitelist'::regclass
  AND conname = 'email_whitelist_email_unique';

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND conname = 'users_email_unique';

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.server_invitations'::regclass
  AND conname = 'server_invitations_code_unique';

-- 3. УДАЛЕНИЕ ДУБЛИРУЮЩИХСЯ ИНДЕКСОВ
-- Удаляем обычные индексы (оставляем UNIQUE constraints)

-- Удаление developer_codes_code_idx (если существует)
DROP INDEX IF EXISTS public.developer_codes_code_idx;

-- Удаление email_whitelist_email_idx (если существует)
DROP INDEX IF EXISTS public.email_whitelist_email_idx;

-- Удаление users_email_idx (если существует)
DROP INDEX IF EXISTS public.users_email_idx;

-- Удаление server_invitations_code_idx (если существует)
DROP INDEX IF EXISTS public.server_invitations_code_idx;

-- 4. ФИНАЛЬНАЯ ПРОВЕРКА
-- Проверяем, что индексы удалены, а constraints остались

SELECT 
    'developer_codes' as table_name,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'developer_codes'
  AND indexname LIKE '%code%'
UNION ALL
SELECT 
    'email_whitelist' as table_name,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'email_whitelist'
  AND indexname LIKE '%email%'
UNION ALL
SELECT 
    'users' as table_name,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'users'
  AND indexname LIKE '%email%'
UNION ALL
SELECT 
    'server_invitations' as table_name,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'server_invitations'
  AND indexname LIKE '%code%'
ORDER BY table_name, indexname;

-- Проверка UNIQUE constraints (они должны остаться)
SELECT 
    conrelid::regclass as table_name,
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid IN (
    'public.developer_codes'::regclass,
    'public.email_whitelist'::regclass,
    'public.users'::regclass,
    'public.server_invitations'::regclass
)
AND conname IN (
    'developer_codes_code_unique',
    'email_whitelist_email_unique',
    'users_email_unique',
    'server_invitations_code_unique'
)
ORDER BY table_name, constraint_name;
