-- Миграция: создать тестовых пользователей (seed)
-- Запуск: psql $DATABASE_URL -f migrations/002_seed_users.sql
-- Требуется: таблица users уже создана (full_schema_cloud.sql или drizzle)

-- Подключаем pgcrypto для хеширования пароля (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Вставка пользователей (пароль для обоих: password123)
-- При необходимости смени пароль после первого входа
INSERT INTO users (id, email, password_hash, name, email_verified, global_role, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    'admin@example.com',
    crypt('password123', gen_salt('bf')),
    'Admin',
    true,
    'admin',
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'user@example.com',
    crypt('password123', gen_salt('bf')),
    'Test User',
    true,
    'user',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO NOTHING;
