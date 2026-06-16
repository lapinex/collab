# Диагностика базы данных PostgreSQL

## Проблемы с миграциями Drizzle

Если при запуске `npm run db:migrate` возникают ошибки:
- `Таблица audit_logs уже существует (code: 42P07)`
- `Схема drizzle уже существует (code: 42P06)`
- `ENOTFOUND` при подключении к Supabase

## Быстрая диагностика

### Вариант 1: Автоматическая диагностика (рекомендуется)

```bash
npm run db:diagnose
```

Скрипт автоматически проверит:
- ✅ Подключение к базе данных
- ✅ Существующие таблицы в схеме `public`
- ✅ Наличие схемы `drizzle`
- ✅ Таблицу миграций `__drizzle_migrations` и её содержимое
- ✅ Структуру таблицы `audit_logs`

### Вариант 2: Ручная диагностика через SQL

Откройте файл `scripts/diagnose-db.sql` и выполните SQL команды в:
- Supabase SQL Editor
- pgAdmin
- psql
- DBeaver

Все команды безопасны (только SELECT, ничего не изменяют).

## Решение проблем

### Проблема 1: Таблицы уже существуют, но миграции не применены

Если таблицы созданы через `db:push` или вручную, но миграции не записаны:

**Вариант A: Синхронизация всех миграций (рекомендуется)**
```bash
npm run db:sync-migrations
```

Эта команда проверит все миграции из журнала и пометит недостающие как применённые.

**Вариант B: Baseline последней миграции**
```bash
npm run db:baseline
```

Эта команда пометит только последнюю миграцию из журнала как применённую.

### Проблема 2: Ошибка ENOTFOUND при подключении к Supabase

**Причины:**
- Неправильный `DATABASE_URL` в `.env.local`
- Использование pooler URL вместо прямого подключения
- Проблемы с сетью/файрволом

**Решение:**
1. Проверьте `DATABASE_URL` в `.env.local`
2. Для миграций используйте **прямое подключение** (не pooler):
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```
   Вместо:
   ```
   postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
3. Убедитесь, что файрвол Supabase разрешает подключения с вашего IP

### Проблема 3: Схема drizzle уже существует

Это нормально! Схема `drizzle` создаётся автоматически для хранения метаданных миграций.
Ошибка `42P06` обычно не критична, если используется `CREATE SCHEMA IF NOT EXISTS`.

### Проблема 4: Дублирующиеся индексы

Если Supabase показывает предупреждения о дублирующихся индексах:
- `developer_codes_code_idx` и `developer_codes_code_unique`
- `email_whitelist_email_idx` и `email_whitelist_email_unique`
- `users_email_idx` и `users_email_unique`
- `server_invitations_code_idx` и `server_invitations_code_unique`

**Решение:**
```bash
npm run db:fix-indexes
```

Скрипт безопасно удалит обычные индексы, оставив UNIQUE constraints для обеспечения целостности данных.

## Структура файлов

- `scripts/diagnose-db.ts` - автоматический скрипт диагностики
- `scripts/diagnose-db.sql` - SQL команды для ручной диагностики
- `scripts/baseline-migrations.ts` - пометка последней миграции как применённой
- `scripts/sync-migrations.ts` - синхронизация всех миграций из журнала
- `scripts/fix-duplicate-indexes.ts` - исправление дублирующихся индексов
- `scripts/fix-duplicate-indexes.sql` - SQL команды для исправления индексов

## Пример вывода диагностики

```
🔍 Диагностика базы данных...

📡 Подключение к базе данных...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ПРОВЕРКА ПОДКЛЮЧЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ База данных: postgres
✅ Пользователь: postgres
✅ Версия: PostgreSQL 15.x

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. ТАБЛИЦЫ В СХЕМЕ PUBLIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Найдено таблиц: 15
  • audit_logs (owner: postgres)
  • channels (owner: postgres)
  • users (owner: postgres)
  ...
```
