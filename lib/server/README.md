# lib/server — только для Node.js (API / RSC)

Сюда помещайте код, который использует БД, Redis, серверные секреты. Не должен импортироваться из клиентских компонентов (`'use client'`) и не попадает в браузерный бандл.

- **db** — работа с БД (Drizzle, postgres)
- **redis** — кэш, pub/sub
- **auth** — JWT, сессии, пароли
- **view-builders** — сборка данных с БД/Redis для API

Зависимости: `drizzle-orm`, `postgres`, `ioredis`, `ws`, `bcryptjs`, `jsonwebtoken` — только в `services/api/package.json`, не в корневом package.json фронта.

В корневом (фронтовом) репо этот код не используется при `next build`; при деплое только фронта (Vercel) серверные зависимости не ставятся.
