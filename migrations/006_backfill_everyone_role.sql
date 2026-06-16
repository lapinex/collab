-- Backfill @everyone role for existing servers (backward compatibility).
-- Ensures every server has an @everyone role and every member has it assigned.
-- Idempotent: safe to run multiple times.
-- Run: psql $DATABASE_URL -f migrations/006_backfill_everyone_role.sql
--
-- Permission bits = defaultMemberPermissions (VIEW_SERVER|VIEW_CHANNEL|SEND_MESSAGES|
--   READ_MESSAGE_HISTORY|ADD_REACTIONS|ATTACH_FILES|CONNECT|SPEAK|CREATE_INVITES) = 3771522

-- 0) Deduplicate @everyone: keep one per server by semantics (default perms, then position, then id), reassign user_roles, delete others
WITH keep AS (
  SELECT DISTINCT ON (server_id) server_id, id AS keep_id
  FROM roles
  WHERE name = '@everyone'
  ORDER BY server_id,
    (permissions = 3771522) DESC,
    position ASC,
    id ASC
)
UPDATE user_roles ur
SET role_id = k.keep_id
FROM keep k
WHERE ur.server_id = k.server_id
  AND ur.role_id IN (SELECT id FROM roles r WHERE r.server_id = k.server_id AND r.name = '@everyone')
  AND ur.role_id <> k.keep_id;

-- 0b) Remap channel_permissions from duplicate @everyone roles to the kept role (avoids data loss on CASCADE)
WITH keep AS (
  SELECT DISTINCT ON (server_id) server_id, id AS keep_id
  FROM roles
  WHERE name = '@everyone'
  ORDER BY server_id,
    (permissions = 3771522) DESC,
    position ASC,
    id ASC
)
UPDATE channel_permissions cp
SET role_id = k.keep_id
FROM keep k
JOIN roles r ON r.id = cp.role_id AND r.server_id = k.server_id AND r.name = '@everyone' AND r.id <> k.keep_id
WHERE cp.role_id = r.id;

WITH keep AS (
  SELECT DISTINCT ON (server_id) server_id, id AS keep_id
  FROM roles
  WHERE name = '@everyone'
  ORDER BY server_id,
    (permissions = 3771522) DESC,
    position ASC,
    id ASC
)
DELETE FROM roles r
WHERE r.name = '@everyone'
  AND r.id NOT IN (SELECT keep_id FROM keep);

-- 1) Create @everyone role for each server that does not have one
INSERT INTO roles (id, server_id, name, color, position, permissions, created_at, updated_at)
SELECT gen_random_uuid(), s.id, '@everyone', '#99aab5', 0, 3771522, now(), now()
FROM servers s
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.server_id = s.id AND r.name = '@everyone'
);

-- 2) Assign @everyone to every member (owner + any user_roles) who does not have it
INSERT INTO user_roles (user_id, role_id, server_id)
SELECT members.user_id, r.id, members.server_id
FROM (
  SELECT s.id AS server_id, s.owner_id AS user_id FROM servers s
  UNION
  SELECT ur.server_id, ur.user_id FROM user_roles ur
) members
JOIN roles r ON r.server_id = members.server_id AND r.name = '@everyone'
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur2
  WHERE ur2.user_id = members.user_id AND ur2.role_id = r.id AND ur2.server_id = members.server_id
)
ON CONFLICT (user_id, role_id, server_id) DO NOTHING;

-- 3) Prevent future duplicate @everyone per server
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_one_everyone_per_server
  ON roles (server_id) WHERE name = '@everyone';
