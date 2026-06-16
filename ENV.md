## Переменные окружения Collab

Этот документ описывает все основные env-переменные, их назначение и где они используются.

### Легенда

- **Scope**: `client` (попадает в бандл), `server` (только на сервере), `both` (читается и там, и там, но значения должны быть одинаковыми).
- **Required**: `yes` – обязательна для прод, `dev-only` – используется только локально, `optional` – опционально.

---

### 1. Базовые (DEV only)

| Имя | Scope | Required | Описание |
|-----|-------|----------|----------|
| `NODE_ENV` | server | dev-only | Среда (`development`/`production`). |
| `API_PORT` | server (API) | dev-only | Порт Express API (по умолчанию 4000). |
| `WS_PORT` | server (WS) | dev-only | Порт WebSocket-gateway (по умолчанию 4001/8080). |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | server (API) | dev-only | Локальные параметры PostgreSQL, если не используется `DATABASE_URL`. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | server (API/WS) | dev-only | Локальный Redis, если не используется `REDIS_URL`. |

---

### 2. Публичные URL и фронтенд

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `APP_DOMAIN` | server | optional | деплой/скрипты | Канонический домен приложения. |
| `NEXT_PUBLIC_APP_URL` | client | yes (prod) | `lib/env/clientEnv.ts`, `HomeClient` | Полный URL фронта (Vercel / Cloud Run). |
| `NEXT_PUBLIC_API_URL` | client | yes (prod) | `next.config.js` (rewrites), `clientEnv` | Базовый URL API **без** `/api` в конце (Express слушает `/api/...`). |
| `NEXT_PUBLIC_WS_URL` | client | yes (prod) | `clientEnv`, `RealtimeManager` | WebSocket URL (например, `wss://example.com/ws` или `wss://ws.example.com`). |
| `NEXT_PUBLIC_LIVEKIT_URL` | client | optional | voice UI | LiveKit URL для клиента (`wss://...`). |

---

### 3. Cloudinary / Giphy (медиа)

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `CLOUDINARY_CLOUD_NAME` | server (API) | optional | `services/api/src/cloudinary.ts` | Cloud name для **presigned upload** (подпись на API). |
| `CLOUDINARY_API_KEY` | server (API) | optional | `services/api/src/cloudinary.ts` | API key для подписи запросов. |
| `CLOUDINARY_API_SECRET` | server (API) | optional | `services/api/src/cloudinary.ts` | Секрет для подписи; **никогда** не задавать как `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | client | optional | `lib/cloudinary/upload.ts` | Cloud name для **unsigned upload** (fallback, если presigned не настроен). |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | client | optional | `lib/cloudinary/upload.ts` | Upload preset для unsigned upload (fallback). |
| `NEXT_PUBLIC_GIPHY_API_KEY` | client | optional | Giphy интеграция | Ключ Giphy (если используется). |

Если заданы `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` и `CLOUDINARY_API_SECRET` на API, клиент использует presigned flow (`/api/media/request-upload` → загрузка в Cloudinary → `/api/media/confirm-upload`). Иначе используется fallback: unsigned Cloudinary или `POST /api/media/upload-direct` (deprecated).

---

### 4. База данных и Redis

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `DATABASE_URL` | server (API/WS) | yes (prod) | `services/api/src/server.ts`, `lib/server/db/client.ts`, gateway | Строка подключения к PostgreSQL. Поддерживает Unix socket (`host=/cloudsql/...`). |
| `REDIS_URL` | server (API/WS) | yes (prod) | API (`new Redis`), `lib/server/redis/*`, gateway | Строка подключения к Redis (`redis://...`). |

---

### 5. JWT и auth (API + WebSocket)

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `JWT_SECRET` | server (API/WS) | yes | API (`verifyAccessToken`), WS (`auth/jwks.ts`) | Секрет для access JWT. Должен быть длинным и случайным. |
| `JWT_REFRESH_SECRET` | server | yes | `lib/server/auth/jwt.ts`, tests | Секрет для refresh JWT. Должен отличаться от `JWT_SECRET` в проде. |
| `WS_JWT_SECRET` | server (WS) | optional | `services/websocket-gateway/src/auth/jwks.ts` | Если задан, используется для WS вместо `JWT_SECRET`. Должен совпадать по смыслу с секретом API. |
| `JWT_ACCESS_TTL` | server (API) | optional | API | TTL access-cookie (например, `15m`). |
| `JWT_REFRESH_TTL_DAYS` | server (API) | optional | API | Срок жизни refresh-cookie в днях. |
| `JWT_ACCESS_EXPIRES_IN` | server | optional | `lib/server/auth/jwt.ts` | TTL access JWT, если используется helper `lib/server/auth/jwt.ts`. |
| `JWT_REFRESH_EXPIRES_IN` | server | optional | `lib/server/auth/jwt.ts` | TTL refresh JWT, если используется helper `lib/server/auth/jwt.ts`. |
| `AUTH_REFRESH_COOKIE_NAME` | server (API) | optional | API | Имя cookie refresh-токена (по умолчанию `collab_refresh`). |
| `AUTH_ACCESS_COOKIE_NAME` | server (API) | optional | API | Имя cookie access-токена (по умолчанию `collab_access`). |
| `AUTH_REFRESH_COOKIE_SECURE` | server (API) | yes (prod) | API | Должно быть `true` в проде (HTTPS только). |
| `AUTH_REFRESH_COOKIE_SAMESITE` | server (API) | yes (prod) | API | `strict` / `lax` / `none`; для Vercel+внешний API обычно `none`. |
| `AUTH_BEARER_ISSUER` | server (API/WS) | optional | API, WS (`auth/jwks.ts`) | Issuer для JWT (по умолчанию `collab-api`). |
| `AUTH_BEARER_AUDIENCE` | server (API/WS) | optional | API, WS | Audience для JWT (по умолчанию `collab-web`). |

**Важно: WebSocket и JWT.** Access-токен выдаёт API и подписывает его с помощью `JWT_SECRET`. WebSocket-gateway проверяет тот же токен при подключении и использует `WS_JWT_SECRET` или, если он не задан, `JWT_SECRET`. Чтобы клиент не оставался в «Disconnected» после входа:

- На **API** (Vercel/сервер): задай `JWT_SECRET` (например `collab-jwt-super-secret-key-2026-here-we-go`).
- На **WebSocket-gateway** (VM/отдельный процесс): задай **тот же** секрет — либо `JWT_SECRET` с тем же значением, либо `WS_JWT_SECRET` = значению `JWT_SECRET` с API. Если секреты разные, gateway вернёт 4401 (AUTH_INVALID) и клиент покажет Disconnected.
- Issuer и audience должны совпадать: на API и gateway либо не задавай `AUTH_BEARER_ISSUER` / `AUTH_BEARER_AUDIENCE` (тогда дефолты `collab-api` / `collab-web`), либо задавай одинаковые значения на обоих.

---

### 6. CORS и WebSocket origin

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `CORS_ORIGIN` | server (API) | yes (prod) | `services/api/src/server.ts` (cors) | Origin фронта (например, Vercel URL). |
| `WS_ALLOWED_ORIGIN` | server (WS) | yes (prod) | gateway (проверка Origin) | Разрешённый Origin для WebSocket-подключений (обычно тот же, что CORS_ORIGIN). |

---

### 7. LiveKit (голос)

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `LIVEKIT_URL` | server (API) | yes (если включён голос) | API (`/api/livekit/token`, `/api/livekit/cleanup`) | URL LiveKit сервера. |
| `LIVEKIT_API_KEY` | server (API) | yes (если включён голос) | API (генерация AccessToken) | API key LiveKit. |
| `LIVEKIT_API_SECRET` | server (API) | yes (если включён голос) | API | Secret LiveKit. |
| `NEXT_PUBLIC_LIVEKIT_URL` | client | optional | клиентский голосовой UI | Клиентский URL для подключения к LiveKit. |

---

### 8. Медиа

| Имя | Scope | Required | Где используется | Описание |
|-----|-------|----------|------------------|----------|
| `MEDIA_ROOT` | server (API) | optional | API | Локальная папка для хранения медиа при использовании `upload-direct` (по умолчанию `media/`). |
| `MEDIA_PUBLIC_BASE_URL` | server (API) | optional | API | Публичный базовый URL для ссылок на медиа (по умолчанию основан на `CORS_ORIGIN`). |

Presigned flow (рекомендуется): задать Cloudinary в секции 3; тогда файлы загружаются напрямую в Cloudinary, а API только выдаёт подпись и сохраняет запись в `media_files`. Лимиты и типы файлов заданы в `lib/constants.ts` (MEDIA_LIMITS).

---

### 9. Итоговый чек-лист для прод

Минимальный набор для прод-среды:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_REFRESH_SECRET`
- `JWT_SECRET`
- `AUTH_BEARER_ISSUER`, `AUTH_BEARER_AUDIENCE` (по желанию, но лучше задать явно)
- `CORS_ORIGIN`
- `WS_ALLOWED_ORIGIN`
- (для голоса) `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`
- (для Cloudinary) `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

Рекомендуется хранить эти значения в системах управления секретами (Vercel, Cloud Run, Railway и т.п.), а не в `.env` в репозитории.

---

## Как фронт связывается с сервисами

| Сервис | Как вызывается | Откуда URL |
|--------|----------------|------------|
| **REST API** | Все запросы идут на **относительные** пути `/api/...` (например `/api/auth/login`, `/api/servers`). | Браузер шлёт на тот же хост (Vercel). В `next.config.js` **rewrites** перенаправляют `/api/:path*` → `NEXT_PUBLIC_API_URL/api/:path*`. Итог: `/api/auth/login` → `https://api.example.com/api/auth/login`. |
| **WebSocket** | Прямое подключение из браузера к `NEXT_PUBLIC_WS_URL` (см. `lib/realtime/RealtimeManager.ts`). | Подставляется из env; fallback: из `NEXT_PUBLIC_APP_URL` по схеме ws или `ws://localhost:4001`. |
| **LiveKit** | Прямое подключение для голоса. | `NEXT_PUBLIC_LIVEKIT_URL`. |

**Важно:** `NEXT_PUBLIC_API_URL` задаётся **без** суффикса `/api` (например `http://localhost:4000` или `https://api.example.com`). Express в `services/api` слушает маршруты `/api/auth/login`, `/api/messages` и т.д.

---

## Фронтенд (Next.js / Vercel) — обязательные

Эти переменные **нужны для сборки и работы фронта**. Задаются в Vercel → Project → Settings → Environment Variables (или в `.env.local` при локальной разработке).

| Переменная | Описание | Пример |
|------------|----------|--------|
| `NEXT_PUBLIC_APP_URL` | Публичный URL приложения (схема + хост) | `https://collab.example.com` |
| `NEXT_PUBLIC_WS_URL` | URL WebSocket-шлюза (wss:// или ws://) | `wss://ws.example.com` или `ws://localhost:4001` |
| `NEXT_PUBLIC_API_URL` | URL API (для rewrites и запросов с клиента) | `https://api.example.com` или `http://localhost:4000` |
| `NEXT_PUBLIC_LIVEKIT_URL` | URL LiveKit для голосовых комнат (опционально, если не используете голос) | `wss://livekit.example.com` |

**Примечание:** `NEXT_PUBLIC_*` попадают в бандл при `next build`, поэтому для продакшена их нужно задать на этапе сборки в Vercel.

---

## Фронтенд — опциональные

| Переменная | Описание |
|------------|----------|
| `NODE_ENV` | Обычно выставляется автоматически (`development` / `production`). |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloud name для загрузки фото/видео в чат (Cloudinary). |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Unsigned upload preset (Cloudinary). Если заданы оба — фото/видео грузятся в Cloudinary, иначе используется API upload-direct. |
| `NEXT_PUBLIC_GIPHY_API_KEY` | API-ключ Giphy для кнопки GIF в чате. Без ключа кнопка покажет подсказку. |

**Важно:** `CLOUDINARY_API_SECRET` (и любой API secret) — только на сервере, **никогда** не добавлять как `NEXT_PUBLIC_*` (попадёт в бандл и будет виден в браузере).

---

## API (backend) — для сервиса `api`

Используются в `services/api` и в docker-compose для контейнера `api`.

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `DATABASE_URL` | да | URL PostgreSQL |
| `JWT_SECRET` | да | Секрет для access-токенов (≥ 32 символа) |
| `REDIS_URL` | нет (есть default) | URL Redis, по умолчанию `redis://localhost:6379` |
| `CORS_ORIGIN` | нет | Разрешённый origin для CORS (URL фронта) |
| `API_PORT` / `PORT` | нет | Порт API (default 4000) |
| `JWT_ACCESS_TTL` | нет | Время жизни access-токена (например `15m`) |
| `JWT_REFRESH_TTL_DAYS` | нет | Время жизни refresh в днях |
| `AUTH_REFRESH_COOKIE_NAME` | нет | Имя cookie для refresh |
| `AUTH_REFRESH_COOKIE_SECURE` | нет | `true` в production по HTTPS |
| `AUTH_REFRESH_COOKIE_SAMESITE` | нет | `lax` / `none` (для кросс-домена) |
| `AUTH_BEARER_ISSUER` | нет | Issuer в JWT (например `collab-api`) |
| `AUTH_BEARER_AUDIENCE` | нет | Audience в JWT (например `collab-web`) |
| `MEDIA_ROOT` | нет | Директория загрузок на диске |
| `MEDIA_PUBLIC_BASE_URL` | нет | Публичный базовый URL для медиа |
| `LIVEKIT_URL` | для голоса | URL LiveKit |
| `LIVEKIT_API_KEY` | для голоса | API key LiveKit |
| `LIVEKIT_API_SECRET` | для голоса | API secret LiveKit |

---

## WebSocket Gateway — для сервиса `ws-gateway`

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `REDIS_URL` | да (в prod) | Redis для pub/sub |
| `DATABASE_URL` | да | PostgreSQL для проверок/данных |
| `WS_JWT_SECRET` / `JWT_SECRET` | да | Секрет для проверки JWT |
| `AUTH_BEARER_ISSUER` | нет | Issuer (должен совпадать с API) |
| `AUTH_BEARER_AUDIENCE` | нет | Audience (должен совпадать с API) |
| `PORT` | нет | Порт WS (default 4001) |
| `WS_ALLOWED_ORIGIN` | нет | Разрешённый origin (URL фронта) |
| `WS_NONCE_TTL_MS` | нет | TTL nonce в мс |
| `WS_NONCE_MAX_ENTRIES` | нет | Лимит записей nonce |

---

## Инфраструктура (Postgres, Redis, LiveKit)

Используются в docker-compose и при локальном поднятии БД/Redis.

| Переменная | Для чего |
|------------|----------|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` | Postgres (контейнер / локальный сервер) |
| `REDIS_PORT`, `REDIS_PASSWORD` | Redis (контейнер / локальный сервер) |
| `LIVEKIT_*` | LiveKit-сервер (если поднимаете отдельно) |

---

## Кратко для деплоя только фронта (Vercel)

Минимум в Vercel:

- `NEXT_PUBLIC_APP_URL` — URL твоего Vercel-домена (или кастомного).
- `NEXT_PUBLIC_API_URL` — URL твоего API (Cloud Run, VPS и т.д.).
- `NEXT_PUBLIC_WS_URL` — URL WebSocket-шлюза.
- `NEXT_PUBLIC_LIVEKIT_URL` — если используете голосовые комнаты.

Остальные переменные из списка выше нужны только для backend (API, WS, БД, Redis, LiveKit).
