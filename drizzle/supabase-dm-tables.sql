-- ============================================================
-- DM tables for Supabase (личные сообщения)
-- Вставь в Supabase: SQL Editor → New query → вставь скрипт → Run
-- ============================================================
-- Требуется: таблица public.users должна уже существовать.
-- Если таблицы уже есть — часть команд выдаст "already exists", это нормально.
-- ============================================================

-- 1) Таблица каналов личных сообщений (пара пользователей)
CREATE TABLE IF NOT EXISTS public.dm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_id uuid,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Таблица сообщений в личке
CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id uuid NOT NULL REFERENCES public.dm_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Индексы для dm_channels
CREATE INDEX IF NOT EXISTS dm_channels_user1_id_idx ON public.dm_channels USING btree (user1_id);
CREATE INDEX IF NOT EXISTS dm_channels_user2_id_idx ON public.dm_channels USING btree (user2_id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_channels_user_pair_idx ON public.dm_channels USING btree (user1_id, user2_id);

-- 4) Индексы для dm_messages
CREATE INDEX IF NOT EXISTS dm_messages_dm_channel_id_idx ON public.dm_messages USING btree (dm_channel_id);
CREATE INDEX IF NOT EXISTS dm_messages_user_id_idx ON public.dm_messages USING btree (user_id);
CREATE INDEX IF NOT EXISTS dm_messages_created_at_idx ON public.dm_messages USING btree (dm_channel_id, created_at);

-- 5) Realtime: подписка на новые сообщения в личке (если используешь Supabase Realtime)
-- Раскомментируй, если нужна публикация dm_messages в Realtime:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
