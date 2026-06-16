-- Add reply_to_id to messages for reply threading.
-- Run: psql $DATABASE_URL -f migrations/004_messages_reply_to_id.sql

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid NULL REFERENCES messages(id);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);
