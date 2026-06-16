-- Ensure users.avatar_url is nullable and has no empty-string default
ALTER TABLE users ALTER COLUMN avatar_url DROP DEFAULT;
ALTER TABLE users ALTER COLUMN avatar_url DROP NOT NULL;
UPDATE users SET avatar_url = NULL WHERE avatar_url = '';
