-- ============================================================
-- Миграция DM в единую таблицу messages (Discord-like)
-- Supabase SQL Editor: вставь и выполни. Подтверди предупреждение.
-- ============================================================
-- ПРЕДУПРЕЖДЕНИЕ SUPABASE "деструктивная операция":
--   Это нормально. В скрипте есть DROP CONSTRAINT и DROP TABLE dm_messages.
--   Подтверждай (Run), если:
--     - ты делаешь миграцию DM → messages по плану;
--     - данные из dm_messages уже переносятся в messages (INSERT), потом таблица удаляется.
--   Не подтверждай, если не уверен или не делал бэкап.
-- ============================================================
-- Что делает:
-- 1. Убирает FK messages.channel_id -> channels.id (чтобы channel_id мог быть и dm_channels.id)
-- 2. Копирует ВСЕ строки из dm_messages в messages
-- 3. Проверяет количество (если не совпало — откат)
-- 4. Удаляет dm_messages из Realtime и удаляет таблицу dm_messages
-- dm_channels не трогаем.
-- ============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1) Убрать FK messages.channel_id -> channels.id
--    (чтобы channel_id мог быть и channels.id, и dm_channels.id)
-- -------------------------------------------------------------
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'messages'
    AND c.contype = 'f'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND a.attname = 'channel_id'
    );
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', conname);
    RAISE NOTICE 'Dropped FK: %', conname;
  ELSE
    RAISE NOTICE 'No FK on messages.channel_id found (already dropped or never existed)';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 2) Требования к messages (должны быть до миграции):
--    channel_id uuid, user_id uuid, content text, created_at, updated_at, edited_at, deleted_at
--    Если чего-то нет — добавь вручную перед запуском.
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 3) Миграция данных: dm_messages -> messages
--    Маппинг: dm_channel_id -> channel_id (dm_channels.id = channel_id для DM)
-- -------------------------------------------------------------
INSERT INTO public.messages (
  id,
  channel_id,
  user_id,
  content,
  edited_at,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  d.id,
  d.dm_channel_id,   -- channel_id = id канала DM (dm_channels.id)
  d.user_id,
  d.content,
  d.edited_at,
  d.deleted_at,
  d.created_at,
  COALESCE(d.updated_at, d.created_at)
FROM public.dm_messages d
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 4) Проверка количества
-- -------------------------------------------------------------
DO $$
DECLARE
  cnt_dm  bigint;
  cnt_new bigint;
BEGIN
  SELECT COUNT(*) INTO cnt_dm  FROM public.dm_messages;
  SELECT COUNT(*) INTO cnt_new FROM public.messages m
  WHERE m.channel_id IN (SELECT id FROM public.dm_channels);
  IF cnt_dm <> cnt_new THEN
    RAISE EXCEPTION 'MIGRATION CHECK FAILED: dm_messages % vs messages (dm) %', cnt_dm, cnt_new;
  END IF;
  RAISE NOTICE 'Count OK: % rows migrated from dm_messages to messages', cnt_dm;
END $$;

-- -------------------------------------------------------------
-- 5) Индекс по channel_id + created_at (для выборки по каналу)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_channel_id_created_at_idx
  ON public.messages (channel_id, created_at DESC);

-- -------------------------------------------------------------
-- 6) Realtime: убрать dm_messages из публикации ДО удаления таблицы
-- -------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.dm_messages;
    RAISE NOTICE 'Dropped dm_messages from supabase_realtime';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 7) Удалить таблицу dm_messages
-- -------------------------------------------------------------
DROP TABLE IF EXISTS public.dm_messages CASCADE;

COMMIT;

-- -------------------------------------------------------------
-- 8) Итоговая проверка (выполни отдельно после миграции)
-- -------------------------------------------------------------
-- Количество сообщений в DM-каналах:
--   SELECT COUNT(*) FROM public.messages m
--   WHERE m.channel_id IN (SELECT id FROM public.dm_channels);
-- Realtime: messages должен быть в публикации (dm_messages — нет):
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename IN ('messages','dm_messages');
-- Если messages нет в supabase_realtime — добавь:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
