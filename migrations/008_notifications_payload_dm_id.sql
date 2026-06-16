-- Notifications: payload (jsonb) and dm_id for DM context
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dm_id uuid REFERENCES dm_channels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notifications_dm_id_idx ON notifications(dm_id);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(user_id, type);
