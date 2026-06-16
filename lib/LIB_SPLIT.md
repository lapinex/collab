# Разделение lib на client и server

## Текущая структура

- **lib/client/** — код, безопасный для браузера (реэкспорт api-client, clientEnv).
- **lib/server/** — только заглушка с `server-only`; серверный код пока остаётся в корне lib (db, redis, auth, view-builders и т.д.).

## Что куда (целевое разделение)

### Только для браузера (lib/client или остаётся в lib без Node-зависимостей)

- `api-client.ts`, `env/clientEnv.ts`
- `utils.ts`, `ui/`, `realtime/`, `notifications/notifyAudio.ts`
- `query-keys/`, `messageView/`, `messages/dto`, `messages/normalizeDtoToView`, `message-view/`
- `local-cache/`, `voice-view/`, `voice-session/`, `voice-runtime/`, `webrtc/`
- `users/dto`, `dm/`, `auth/validation`, `auth/access-token`
- `utils/roles` (если без db), `permissions/constants` (метаданные), `view-patchers/`

### Только для Node (должно быть в lib/server, зависимости только в services/api)

- `db/`, `redis/`, `auth/jwt`, `auth/session`, `auth/password`
- `view-builders/`, `permissions/` (calculator, mvp-calculator, resolvePermissions и т.д.)
- `user-settings/`, `friends/`, `embeds/`, `audit/`, `security/`, `rate-limit/`, `presence/`
- `notifications/badges.ts`

## Зависимости

Серверные пакеты (**drizzle-orm**, **ioredis**, **postgres**, **ws**, **bcryptjs**, **jsonwebtoken**) должны быть только в `services/api/package.json` при полностью разделённом фронте.

Сейчас они остаются в корневом `package.json`, потому что код в `lib/db`, `lib/redis`, `lib/view-builders` и т.д. ещё не перенесён в `lib/server/` и не исключён из фронтовой сборки. После переноса серверного кода в `lib/server/` и исключения его из сборки Next (или удаления из репо при деплое только фронта) эти зависимости можно убрать из корня.

## Импорты

- Фронт (app/, components/, hooks/): импортировать только из `@/lib/client/*` или из модулей lib, не использующих db/redis.
- Сервер (services/api, при необходимости RSC): импортировать из `@/lib/server/db`, `@/lib/server/redis`, `@/lib/server/view-builders` и т.д.
