-- Week 3 perf: index for GET /api/messages list (channel_id + deleted_at filter + created_at order).
-- Run: psql $DATABASE_URL -f migrations/005_messages_list_perf_index.sql
-- Query pattern: WHERE channel_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT N
-- For zero-downtime in production, run manually: CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (no transaction).

CREATE INDEX IF NOT EXISTS idx_messages_channel_deleted_created_desc
  ON messages (channel_id, created_at DESC)
  WHERE deleted_at IS NULL;
