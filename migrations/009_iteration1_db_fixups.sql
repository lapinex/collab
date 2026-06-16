-- Iteration 1 DB fixups
-- Align runtime expectations and schema for auth/moderation/performance.

-- 1) Users license fields are used by API but can be missing in older DBs.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS license_accepted boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS license_accepted_at timestamp;

-- 2) Reply-to column used by runtime code.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid;

DO $$ BEGIN
  ALTER TABLE messages
    ADD CONSTRAINT messages_reply_to_id_fk
    FOREIGN KEY (reply_to_id)
    REFERENCES messages(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);

-- 3) Hot-path composite index for membership checks and moderation.
CREATE INDEX IF NOT EXISTS user_roles_server_user_idx ON user_roles(server_id, user_id);

-- 4) Session cleanup / lookup hot path after password reset.
CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON sessions(user_id, expires_at);
