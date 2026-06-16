# lib/client — только для браузера

Сюда помещайте код, который может выполняться в браузере и попадает в клиентский бандл.

- **api-client** — запросы к API
- **env** — `clientEnv` (NEXT_PUBLIC_*), без серверных секретов
- **hooks** — хуки для React
- **utils** — утилиты без Node.js (без fs, db, redis)

Не импортируйте сюда `@/lib/server/*`, `server-only` и пакеты: `drizzle-orm`, `ioredis`, `postgres`, `ws`, `express`.
