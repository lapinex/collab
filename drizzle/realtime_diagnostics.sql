-- ============================================
-- Supabase Realtime Diagnostics SQL
-- ============================================
-- 
-- This SQL file helps diagnose Realtime and PostgreSQL performance issues.
-- 
-- Run these queries in Supabase SQL Editor to identify:
-- - Long-running transactions
-- - Database locks
-- - Replication status
-- - Missing indexes
-- - Connection pool issues
--
-- ============================================

-- ============================================
-- 1. LONG-RUNNING TRANSACTIONS
-- ============================================
-- Find transactions that have been running for > 5 seconds
-- These can block Realtime subscriptions and cause timeouts

SELECT 
  pid,
  now() - xact_start AS transaction_duration,
  now() - query_start AS query_duration,
  state,
  wait_event_type,
  wait_event,
  query,
  client_addr,
  application_name
FROM pg_stat_activity
WHERE state <> 'idle'
  AND pid <> pg_backend_pid()
  AND (now() - xact_start) > interval '5 seconds'
ORDER BY transaction_duration DESC;

-- ============================================
-- 2. BLOCKING LOCKS
-- ============================================
-- Check for locks that are waiting (can cause timeouts)

SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement,
  blocked_activity.application_name AS blocked_app,
  blocking_activity.application_name AS blocking_app
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- ============================================
-- 3. ACTIVE REPLICATION STATUS
-- ============================================
-- Check Realtime replication status

SELECT 
  pid,
  usename,
  application_name,
  client_addr,
  state,
  sync_state,
  sync_priority,
  flush_lsn,
  write_lsn,
  sent_lsn,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication
ORDER BY write_lag DESC NULLS LAST;

-- ============================================
-- 4. PUBLICATION STATUS
-- ============================================
-- Verify supabase_realtime publication exists

SELECT 
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete,
  pubtruncate
FROM pg_publication
WHERE pubname = 'supabase_realtime';

-- Check which tables are in the publication
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================
-- 5. INDEXES FOR REALTIME FILTERS
-- ============================================
-- Verify indexes exist for Realtime subscription filters
-- Filters use: channel_id=eq.${channelId}, dm_channel_id=eq.${channelId}

-- Check messages indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'messages'
  AND (
    indexdef LIKE '%channel_id%' 
    OR indexdef LIKE '%created_at%'
  )
ORDER BY indexname;

-- Check dm_messages indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'dm_messages'
  AND (
    indexdef LIKE '%dm_channel_id%' 
    OR indexdef LIKE '%created_at%'
  )
ORDER BY indexname;

-- ============================================
-- 6. CONNECTION POOL STATISTICS
-- ============================================
-- Check active connections by application name

SELECT 
  application_name,
  COUNT(*) AS connection_count,
  COUNT(*) FILTER (WHERE state = 'active') AS active_count,
  COUNT(*) FILTER (WHERE state = 'idle') AS idle_count,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction_count
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
GROUP BY application_name
ORDER BY connection_count DESC;

-- Total connections vs max_connections
SELECT 
  COUNT(*) AS current_connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
  ROUND(100.0 * COUNT(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) AS usage_percent
FROM pg_stat_activity;

-- ============================================
-- 7. TABLE STATISTICS FOR REALTIME TABLES
-- ============================================
-- Check table sizes and row counts (can affect Realtime performance)

SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size,
  n_tup_ins AS inserts_since_vacuum,
  n_tup_upd AS updates_since_vacuum,
  n_tup_del AS deletes_since_vacuum,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename IN ('messages', 'dm_messages', 'reactions')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- 8. WAL LEVEL (should be 'logical' for Realtime)
-- ============================================

SELECT 
  name,
  setting,
  unit,
  context,
  short_desc
FROM pg_settings
WHERE name = 'wal_level';

-- ============================================
-- 9. SLOW QUERIES (if pg_stat_statements is enabled)
-- ============================================
-- Note: May require pg_stat_statements extension

-- SELECT 
--   query,
--   calls,
--   total_time,
--   mean_time,
--   max_time,
--   stddev_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%messages%' OR query LIKE '%dm_messages%'
-- ORDER BY mean_time DESC
-- LIMIT 10;

-- ============================================
-- 10. REALTIME-SPECIFIC: CHECK PUBLICATION SLOTS
-- ============================================
-- Realtime uses logical replication slots

SELECT 
  slot_name,
  plugin,
  slot_type,
  database,
  active,
  restart_lsn,
  confirmed_flush_lsn,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag_size
FROM pg_replication_slots
WHERE slot_name LIKE '%realtime%'
ORDER BY slot_name;

-- ============================================
-- RECOMMENDATIONS
-- ============================================
--
-- If you see:
-- 1. Long-running transactions (> 30s) → Optimize queries, add timeouts
-- 2. Blocking locks → Check for missing transaction commits
-- 3. High connection count (> 80% of max) → Check connection pooling
-- 4. Missing indexes → Create indexes for Realtime filter columns
-- 5. Large dead_rows → Run VACUUM ANALYZE
-- 6. Replication lag → Check Realtime service status
-- 7. WAL level != 'logical' → Realtime won't work (should be set by Supabase)
--
-- ============================================
