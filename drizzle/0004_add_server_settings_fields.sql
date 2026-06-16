-- Migration: Add server settings fields and new tables
-- Created: 2025-01-25
-- Description: Adds overview, security, community settings to servers table,
--              adds topic and slowmode to channels table,
--              creates server_emojis, server_stickers, and webhooks tables

-- Add new columns to servers table
DO $$ 
BEGIN
    -- Overview settings
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'description'
    ) THEN
        ALTER TABLE servers ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'verification_level'
    ) THEN
        ALTER TABLE servers ADD COLUMN verification_level TEXT NOT NULL DEFAULT 'none';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'system_channel_id'
    ) THEN
        ALTER TABLE servers ADD COLUMN system_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'rules_channel_id'
    ) THEN
        ALTER TABLE servers ADD COLUMN rules_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'default_notification_channel_id'
    ) THEN
        ALTER TABLE servers ADD COLUMN default_notification_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'voice_region'
    ) THEN
        ALTER TABLE servers ADD COLUMN voice_region TEXT NOT NULL DEFAULT 'auto';
    END IF;

    -- Security/Moderation settings
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'media_scan_level'
    ) THEN
        ALTER TABLE servers ADD COLUMN media_scan_level TEXT NOT NULL DEFAULT 'none';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'link_filter_enabled'
    ) THEN
        ALTER TABLE servers ADD COLUMN link_filter_enabled BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'bad_words_filter_level'
    ) THEN
        ALTER TABLE servers ADD COLUMN bad_words_filter_level TEXT NOT NULL DEFAULT 'none';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'custom_bad_words'
    ) THEN
        ALTER TABLE servers ADD COLUMN custom_bad_words JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Community mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'is_community'
    ) THEN
        ALTER TABLE servers ADD COLUMN is_community BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'servers' AND column_name = 'announcements_channel_id'
    ) THEN
        ALTER TABLE servers ADD COLUMN announcements_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add new columns to channels table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'topic'
    ) THEN
        ALTER TABLE channels ADD COLUMN topic TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'slowmode'
    ) THEN
        ALTER TABLE channels ADD COLUMN slowmode INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Create server_emojis table
CREATE TABLE IF NOT EXISTS server_emojis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for server_emojis
CREATE INDEX IF NOT EXISTS server_emojis_server_id_idx ON server_emojis(server_id);
CREATE INDEX IF NOT EXISTS server_emojis_name_idx ON server_emojis(server_id, name);

-- Create server_stickers table
CREATE TABLE IF NOT EXISTS server_stickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for server_stickers
CREATE INDEX IF NOT EXISTS server_stickers_server_id_idx ON server_stickers(server_id);
CREATE INDEX IF NOT EXISTS server_stickers_name_idx ON server_stickers(server_id, name);

-- Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for webhooks
CREATE INDEX IF NOT EXISTS webhooks_server_id_idx ON webhooks(server_id);
CREATE INDEX IF NOT EXISTS webhooks_channel_id_idx ON webhooks(channel_id);
