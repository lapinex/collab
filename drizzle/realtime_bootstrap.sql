-- ============================================
-- Supabase Realtime Bootstrap SQL
-- ============================================
-- 
-- This SQL ensures Realtime is properly configured for the application tables.
-- 
-- IDEMPOTENT: Safe to run multiple times.
-- 
-- Tables enabled for Realtime:
--   - public.messages
--   - public.dm_messages
--   - public.reactions
--   - public.channels (optional, for channel updates)
--
-- ============================================

-- ============================================
-- 1. DIAGNOSTIC QUERIES (information only, don't modify)
-- ============================================

-- Check if supabase_realtime publication exists
-- SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- Check which tables are currently in the publication
-- SELECT schemaname, tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND tablename IN ('messages', 'dm_messages', 'reactions', 'channels')
-- ORDER BY tablename;

-- Check if tables are LOGGED (required for Realtime)
-- SELECT
--   c.relname AS table_name,
--   CASE c.relpersistence 
--     WHEN 'p' THEN 'permanent (LOGGED) ✅'
--     WHEN 'u' THEN 'unlogged ❌'
--     WHEN 't' THEN 'temporary'
--   END AS persistence_status
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('messages', 'dm_messages', 'reactions', 'channels')
-- ORDER BY c.relname;

-- ============================================
-- 2. ENSURE TABLES ARE LOGGED (required for WAL)
-- ============================================

-- Messages table must be LOGGED for Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'messages' AND relpersistence != 'p') THEN
    ALTER TABLE public.messages SET LOGGED;
    RAISE NOTICE 'Set messages table to LOGGED';
  END IF;
END $$;

-- DM Messages table must be LOGGED for Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dm_messages' AND relpersistence != 'p') THEN
    ALTER TABLE public.dm_messages SET LOGGED;
    RAISE NOTICE 'Set dm_messages table to LOGGED';
  END IF;
END $$;

-- Reactions table must be LOGGED for Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'reactions' AND relpersistence != 'p') THEN
    ALTER TABLE public.reactions SET LOGGED;
    RAISE NOTICE 'Set reactions table to LOGGED';
  END IF;
END $$;

-- Channels table (optional - for channel updates via Realtime)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'channels' AND relpersistence != 'p') THEN
    ALTER TABLE public.channels SET LOGGED;
    RAISE NOTICE 'Set channels table to LOGGED';
  END IF;
END $$;

-- ============================================
-- 3. ADD TABLES TO REALTIME PUBLICATION (idempotent)
-- ============================================

-- Add messages table to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    RAISE NOTICE 'Added messages table to supabase_realtime publication';
  END IF;
END $$;

-- Add dm_messages table to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
    RAISE NOTICE 'Added dm_messages table to supabase_realtime publication';
  END IF;
END $$;

-- Add reactions table to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
    RAISE NOTICE 'Added reactions table to supabase_realtime publication';
  END IF;
END $$;

-- ============================================
-- 4. CREATE RLS POLICIES FOR REALTIME (idempotent)
-- ============================================
-- 
-- Realtime subscriptions require SELECT permissions via RLS.
-- These policies allow authenticated users to subscribe to changes.
-- Actual data filtering happens in the application layer via filters.

-- Messages: Allow SELECT for authenticated users (for Realtime subscriptions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'messages' 
      AND policyname = 'realtime_select_messages'
  ) THEN
    CREATE POLICY "realtime_select_messages"
    ON public.messages
    FOR SELECT
    TO authenticated
    USING (true);
    
    RAISE NOTICE 'Created RLS policy: realtime_select_messages';
  END IF;
END $$;

-- DM Messages: Allow SELECT for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'dm_messages' 
      AND policyname = 'realtime_select_dm_messages'
  ) THEN
    CREATE POLICY "realtime_select_dm_messages"
    ON public.dm_messages
    FOR SELECT
    TO authenticated
    USING (true);
    
    RAISE NOTICE 'Created RLS policy: realtime_select_dm_messages';
  END IF;
END $$;

-- Reactions: Allow SELECT for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'reactions' 
      AND policyname = 'realtime_select_reactions'
  ) THEN
    CREATE POLICY "realtime_select_reactions"
    ON public.reactions
    FOR SELECT
    TO authenticated
    USING (true);
    
    RAISE NOTICE 'Created RLS policy: realtime_select_reactions';
  END IF;
END $$;

-- ============================================
-- 5. VERIFICATION QUERIES (run after script execution)
-- ============================================

-- Verify tables are in publication
-- SELECT 
--   '✅' AS status,
--   schemaname,
--   tablename
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND tablename IN ('messages', 'dm_messages', 'reactions')
-- ORDER BY tablename;

-- Verify tables are LOGGED
-- SELECT 
--   CASE 
--     WHEN relpersistence = 'p' THEN '✅ LOGGED'
--     ELSE '❌ UNLOGGED'
--   END AS status,
--   relname AS table_name
-- FROM pg_class
-- WHERE relname IN ('messages', 'dm_messages', 'reactions')
-- ORDER BY relname;

-- Verify RLS policies exist
-- SELECT 
--   '✅' AS status,
--   schemaname,
--   tablename,
--   policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('messages', 'dm_messages', 'reactions')
--   AND policyname LIKE 'realtime_select_%'
-- ORDER BY tablename;

-- ============================================
-- NOTES
-- ============================================
--
-- After running this script:
-- 1. Verify in Supabase Dashboard → Database → Replication
--    - Tables "messages", "dm_messages", "reactions" should show as "Active"
--
-- 2. Test Realtime in application:
--    - Create a message → should appear instantly in connected clients
--    - Check browser console for "[Realtime] ✅ SUBSCRIBED" messages
--
-- 3. If Realtime still doesn't work:
--    - Check WAL level: SELECT name, setting FROM pg_settings WHERE name = 'wal_level';
--      Should be 'logical' for Realtime
--    - Verify RLS is enabled: SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
--    - Check Supabase project limits (concurrent connections)
--
-- ============================================
