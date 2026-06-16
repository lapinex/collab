-- ============================================================
-- Проверка DM-таблиц в Supabase
-- Вставь в SQL Editor → Run. Результаты появятся во вкладках.
-- Если видишь только один результат — выполняй запросы по блокам (1, 2, 3 …).
-- ============================================================

-- 0) Краткий итог: всё ли на месте (одна строка)
SELECT
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dm_channels') = 1 AS dm_channels_ok,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dm_messages') = 1 AS dm_messages_ok,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') = 1 AS users_ok;

-- 1) Существуют ли таблицы
SELECT
  schemaname,
  tablename,
  'OK' AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('dm_channels', 'dm_messages', 'users')
ORDER BY tablename;

-- 2) Колонки dm_channels
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dm_channels'
ORDER BY ordinal_position;

-- 3) Колонки dm_messages
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dm_messages'
ORDER BY ordinal_position;

-- 4) Количество строк
SELECT 'dm_channels' AS table_name, COUNT(*) AS row_count FROM public.dm_channels
UNION ALL
SELECT 'dm_messages', COUNT(*) FROM public.dm_messages;

-- 5) Индексы на DM-таблицах
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('dm_channels', 'dm_messages')
ORDER BY tablename, indexname;

-- 6) Внешние ключи (FK)
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS ref_table,
  ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('dm_channels', 'dm_messages')
ORDER BY tc.table_name, tc.constraint_name;
