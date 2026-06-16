-- Миграция: добавить email test_1767886927816@example.com в whitelist для доступа к чату
-- Запуск: psql $DATABASE_URL -f migrations/003_whitelist_test_1767886927816_email.sql
-- Требуется: таблица email_whitelist уже создана (см. основные миграции/schema)

-- PostgreSQL
INSERT INTO email_whitelist (id, email, created_at)
VALUES (
  gen_random_uuid()::text,
  'test_1767886927816@example.com',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

