-- Migration 0004: auto_translate and preferred_language for user_settings
--
-- In Supabase SQL Editor: select and run ONLY the block below (from DO to $$;).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'auto_translate'
  ) THEN
    ALTER TABLE "user_settings" ADD COLUMN "auto_translate" boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE "user_settings" ADD COLUMN "preferred_language" text NOT NULL DEFAULT 'en';
  END IF;
END $$;
