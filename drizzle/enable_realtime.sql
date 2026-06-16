-- Enable Supabase Realtime for tables used in the application
-- This SQL must be executed in Supabase SQL Editor or via migration
-- 
-- IMPORTANT: After running this migration, verify in Supabase Dashboard:
-- 1. Go to Database > Replication
-- 2. Ensure "messages" and "dm_messages" tables show as "Active"
--
-- If tables don't appear, you may need to enable Realtime manually in the Dashboard UI.

-- Enable Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Enable Realtime for dm_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;

-- Verify Realtime is enabled (optional check query)
-- SELECT schemaname, tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND tablename IN ('messages', 'dm_messages');
