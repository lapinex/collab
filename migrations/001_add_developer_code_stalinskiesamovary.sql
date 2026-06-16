-- Миграция: добавить код разработчика stalinskiesamovary123 в developer_codes
-- Запуск: psql $DATABASE_URL -f migrations/001_add_developer_code_stalinskiesamovary.sql
-- или через drizzle-kit / Supabase SQL Editor

-- PostgreSQL
INSERT INTO developer_codes (id, code, used, created_at)
VALUES (
  gen_random_uuid(),
  'stalinskiesamovary123',
  false,
  NOW()
)
ON CONFLICT (code) DO NOTHING;
