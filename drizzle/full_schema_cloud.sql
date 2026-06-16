-- =============================================================================
-- Collab: РїРѕР»РЅР°СЏ РјРёРіСЂР°С†РёСЏ СЃС…РµРјС‹ РґР»СЏ РѕР±Р»Р°С‡РЅРѕР№ Р‘Р” (PostgreSQL)
-- РћРґРёРЅ С„Р°Р№Р» вЂ” РІСЃРµ С‚Р°Р±Р»РёС†С‹, РёРЅРґРµРєСЃС‹ Рё FK. Р”Р»СЏ РїСѓСЃС‚РѕР№ Р‘Р” РІ РѕР±Р»Р°РєРµ (Cloud SQL Рё С‚.Рґ.)
--
-- Р—Р°РїСѓСЃРє:
--   psql "$DATABASE_URL" -f full_schema_cloud.sql
-- РёР»Рё
--   PGPASSWORD=... psql -h HOST -U USER -d DBNAME -f full_schema_cloud.sql
--
-- РРґРµРјРїРѕС‚РµРЅС‚РЅРѕСЃС‚СЊ: CREATE TABLE IF NOT EXISTS, РёРЅРґРµРєСЃС‹ IF NOT EXISTS,
-- FK РґР»СЏ servers->channels РґРѕР±Р°РІР»РµРЅС‹ С‡РµСЂРµР· DO ... EXCEPTION (РїРѕРІС‚РѕСЂРЅС‹Р№ Р·Р°РїСѓСЃРє РЅРµ СѓРїР°РґС‘С‚).
-- =============================================================================

-- 1. Users (Р±Р°Р·РѕРІР°СЏ С‚Р°Р±Р»РёС†Р°)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  bio text,
  email_verified boolean NOT NULL DEFAULT false,
  theme text NOT NULL DEFAULT 'collab',
  global_role text NOT NULL DEFAULT 'user',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 2. Р—Р°РІРёСЃРёРјС‹Рµ РѕС‚ users
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS developer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES users(id),
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log(created_at);

-- 3. Servers (owner_id -> users)
CREATE TABLE IF NOT EXISTS servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  description text,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_level text NOT NULL DEFAULT 'none',
  system_channel_id uuid,
  rules_channel_id uuid,
  default_notification_channel_id uuid,
  voice_region text NOT NULL DEFAULT 'auto',
  media_scan_level text NOT NULL DEFAULT 'none',
  link_filter_enabled boolean NOT NULL DEFAULT false,
  bad_words_filter_level text NOT NULL DEFAULT 'none',
  custom_bad_words jsonb DEFAULT '[]'::jsonb,
  is_community boolean NOT NULL DEFAULT false,
  announcements_channel_id uuid,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 4. Channels (server_id -> servers, parent_id -> self)
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  parent_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  topic text,
  slowmode integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channels_server_id_idx ON channels(server_id);
CREATE INDEX IF NOT EXISTS channels_parent_id_idx ON channels(parent_id);

-- FK servers -> channels (РёРґРµРјРїРѕС‚РµРЅС‚РЅРѕ)
DO $$ BEGIN
  ALTER TABLE servers ADD CONSTRAINT servers_system_channel_id_fk FOREIGN KEY (system_channel_id) REFERENCES channels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE servers ADD CONSTRAINT servers_rules_channel_id_fk FOREIGN KEY (rules_channel_id) REFERENCES channels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE servers ADD CONSTRAINT servers_default_notification_channel_id_fk FOREIGN KEY (default_notification_channel_id) REFERENCES channels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE servers ADD CONSTRAINT servers_announcements_channel_id_fk FOREIGN KEY (announcements_channel_id) REFERENCES channels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Roles
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#99aab5',
  position integer NOT NULL DEFAULT 0,
  permissions integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roles_server_id_idx ON roles(server_id);
CREATE INDEX IF NOT EXISTS roles_position_idx ON roles(server_id, position);

-- 6. User roles, channel permissions
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id, server_id)
);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_server_id_idx ON user_roles(server_id);

CREATE TABLE IF NOT EXISTS channel_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  allow_permissions integer NOT NULL DEFAULT 0,
  deny_permissions integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS channel_permissions_channel_id_idx ON channel_permissions(channel_id);
CREATE INDEX IF NOT EXISTS channel_permissions_role_id_idx ON channel_permissions(role_id);
CREATE INDEX IF NOT EXISTS channel_permissions_user_id_idx ON channel_permissions(user_id);

-- 7. Messages (channel_id, user_id; reply_to_message_id FK added after to avoid self-ref in CREATE)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  reply_to_message_id uuid,
  mentions jsonb,
  edited_at timestamp,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_channel_id_idx ON messages(channel_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS messages_reply_to_message_id_idx ON messages(reply_to_message_id);
DO $$ BEGIN
  ALTER TABLE messages ADD CONSTRAINT messages_reply_to_message_id_fk FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Message edits, reactions, voice_sessions, media_files
CREATE TABLE IF NOT EXISTS message_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  edited_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_edits_message_id_idx ON message_edits(message_id);

CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reactions_message_id_idx ON reactions(message_id);
CREATE INDEX IF NOT EXISTS reactions_user_id_idx ON reactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS reactions_message_user_emoji_idx ON reactions(message_id, user_id, emoji);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  joined_at timestamp NOT NULL DEFAULT now(),
  left_at timestamp
);
CREATE INDEX IF NOT EXISTS voice_sessions_user_id_idx ON voice_sessions(user_id);
CREATE INDEX IF NOT EXISTS voice_sessions_channel_id_idx ON voice_sessions(channel_id);

CREATE TABLE IF NOT EXISTS media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL,
  cdn_url text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_files_user_id_idx ON media_files(user_id);
CREATE INDEX IF NOT EXISTS media_files_channel_id_idx ON media_files(channel_id);
CREATE INDEX IF NOT EXISTS media_files_message_id_idx ON media_files(message_id);

-- 9. DM channels
CREATE TABLE IF NOT EXISTS dm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_id uuid REFERENCES messages(id),
  last_message_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_channels_user1_id_idx ON dm_channels(user1_id);
CREATE INDEX IF NOT EXISTS dm_channels_user2_id_idx ON dm_channels(user2_id);
CREATE UNIQUE INDEX IF NOT EXISTS dm_channels_user_pair_idx ON dm_channels(user1_id, user2_id);

-- 10. Notifications, audit_logs, user_settings
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  channel_id uuid,
  server_id uuid REFERENCES servers(id) ON DELETE CASCADE,
  dm_id uuid REFERENCES dm_channels(id) ON DELETE CASCADE,
  payload jsonb,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_dm_id_idx ON notifications(dm_id);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(user_id, type);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  "location" text,
  auto_translate boolean NOT NULL DEFAULT false,
  preferred_language text NOT NULL DEFAULT 'en',
  notifications_enabled boolean NOT NULL DEFAULT true,
  notifications_sound boolean NOT NULL DEFAULT true,
  notifications_mentions boolean NOT NULL DEFAULT true,
  privacy_show_email boolean NOT NULL DEFAULT false,
  privacy_show_online_status boolean NOT NULL DEFAULT true,
  allow_dm boolean NOT NULL DEFAULT true,
  allow_dm_from_non_mutual boolean NOT NULL DEFAULT false,
  allow_friend_requests boolean NOT NULL DEFAULT true,
  notifications_mode text NOT NULL DEFAULT 'all',
  voice_input_device text,
  voice_output_device text,
  voice_screen_share_sound boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 11. Friends, blocks, sessions, presence
CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_from_to_idx ON friend_requests(from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS friend_requests_from_user_id_idx ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS friend_requests_to_user_id_idx ON friend_requests(to_user_id);

CREATE TABLE IF NOT EXISTS friends (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS friends_user_id_idx ON friends(user_id);
CREATE INDEX IF NOT EXISTS friends_friend_id_idx ON friends(friend_id);

CREATE TABLE IF NOT EXISTS user_blocks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, blocked_user_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_user_id_idx ON user_blocks(user_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_user_id_idx ON user_blocks(blocked_user_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent text,
  ip text,
  created_at timestamp NOT NULL DEFAULT now(),
  last_active_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS presence (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline',
  custom_status text,
  last_seen timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 12. Server profiles, invitations, bans, audit
CREATE TABLE IF NOT EXISTS server_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  nickname text,
  avatar_url text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS server_profiles_user_server_idx ON server_profiles(user_id, server_id);
CREATE INDEX IF NOT EXISTS server_profiles_user_id_idx ON server_profiles(user_id);
CREATE INDEX IF NOT EXISTS server_profiles_server_id_idx ON server_profiles(server_id);

CREATE TABLE IF NOT EXISTS server_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_invitations_server_id_idx ON server_invitations(server_id);

CREATE TABLE IF NOT EXISTS banned_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS banned_members_server_user_idx ON banned_members(server_id, user_id);
CREATE INDEX IF NOT EXISTS banned_members_server_id_idx ON banned_members(server_id);

CREATE TABLE IF NOT EXISTS server_invite_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES server_invitations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_invite_uses_invite_id_idx ON server_invite_uses(invite_id);

CREATE TABLE IF NOT EXISTS invite_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES server_invitations(id) ON DELETE SET NULL,
  action text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invite_audit_log_invite_id_idx ON invite_audit_log(invite_id);
CREATE INDEX IF NOT EXISTS invite_audit_log_server_id_idx ON invite_audit_log(server_id);

CREATE TABLE IF NOT EXISTS server_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid REFERENCES servers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_audit_logs_server_id_idx ON server_audit_logs(server_id);
CREATE INDEX IF NOT EXISTS server_audit_logs_created_at_idx ON server_audit_logs(server_id, created_at);

-- 13. Server emojis, stickers, webhooks
CREATE TABLE IF NOT EXISTS server_emojis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_emojis_server_id_idx ON server_emojis(server_id);
CREATE INDEX IF NOT EXISTS server_emojis_name_idx ON server_emojis(server_id, name);

CREATE TABLE IF NOT EXISTS server_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_stickers_server_id_idx ON server_stickers(server_id);
CREATE INDEX IF NOT EXISTS server_stickers_name_idx ON server_stickers(server_id, name);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_server_id_idx ON webhooks(server_id);
CREATE INDEX IF NOT EXISTS webhooks_channel_id_idx ON webhooks(channel_id);

-- Done.
