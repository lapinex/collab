# DM и база данных

Таблицы для личных сообщений (DM) уже есть в схеме и в миграциях:

- **dm_channels** — создаётся в `0001_last_captain_stacy.sql`
- **dm_messages** — создаётся там же

Рефакторинг DMSession (channelId, realtime по `channel:`) **не менял схему БД**.  
`dm_channels.id` используется и как dmId, и как channelId в API.

## Как обновить БД

### Вариант 1: Привести БД к текущей схеме (рекомендуется)

```bash
npm run db:push
```

Создаёт/обновляет таблицы по `lib/db/schema.ts`. Для DM ничего не меняется, если миграции уже применялись.

### Вариант 2: Выполнить миграции по файлам

Если используете Drizzle Migrate и в БД ещё нет таблиц DM:

```bash
npm run db:migrate
```

Или кастомный скрипт (если есть):

```bash
npm run db:migrate-all
```

### Переменные

В `.env.local` должен быть `DATABASE_URL` (Postgres). Для Supabase часто нужен `?sslmode=require`; `drizzle.config.ts` добавляет его сам при отсутствии.
