# Методичка по Деплою

Короткий рабочий чеклист, чтобы быстро и безопасно выкатить Collab в публичный доступ.

## 1. Что должно быть готово перед деплоем

- Код без локальных секретов.
- В репозитории не должно быть `.env`, `.env.local`, `.env.gateway`, `dburl.txt`, `redisurl.txt` и других приватных файлов.
- Все обязательные переменные должны быть описаны в [ENV.md](../ENV.md) и в `.env.example`.

## 2. Локальная проверка перед публикацией

```bash
npm install
npm run preflight:env
npm run typecheck
npm run build
```

Если поднимаешь всё локально в Docker:

```bash
npm run docker:up:prod
```

## 3. Что деплоится отдельно

- Frontend: Next.js.
- API: `services/api`.
- WebSocket gateway: `services/websocket-gateway`.
- База: PostgreSQL.
- Redis: для кеша и realtime.
- LiveKit: только если нужен голос.

## 4. Базовый порядок деплоя

1. Создай PostgreSQL и Redis.
2. Задай секреты: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
3. Задеплой API.
4. Получи URL API и внеси его в `NEXT_PUBLIC_API_URL`.
5. Задеплой WebSocket gateway, если он нужен.
6. Внеси `NEXT_PUBLIC_WS_URL`.
7. Внеси `NEXT_PUBLIC_APP_URL` и `NEXT_PUBLIC_LIVEKIT_URL`.
8. Задеплой фронтенд.
9. Прогони миграции.
10. Проверь логин, чат, DM и голос.

## 5. Вариант для Cloud Run + Vercel

### API

- Собери контейнер API.
- Передай переменные окружения через secret manager.
- Проверь `/health`.

### Frontend

- Импортируй репозиторий в Vercel.
- Укажи `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL`.
- Перезапусти деплой после изменения env.

## 6. Вариант для Railway

- Импортируй репозиторий.
- Назначь root directory: `services/api` для API.
- Добавь PostgreSQL и Redis.
- Укажи `JWT_SECRET` и `JWT_REFRESH_SECRET`.
- Для фронта укажи `NEXT_PUBLIC_*`.

## 7. Что не коммитить в Git

- `.env`
- `.env.local`
- `.env.gateway`
- `dburl.txt`
- `redisurl.txt`
- любые ключи Cloudinary, LiveKit, JWT, Redis, PostgreSQL

## 8. Как проверить, что всё безопасно

```bash
git status --short
git status --ignored --short
```

В репозиторий можно отправлять только код, документацию и безличные конфиги-примеры.

## 9. Откат

Если после деплоя что-то сломалось:

1. Верни предыдущий тег или коммит.
2. Перезапусти API и фронтенд.
3. Проверь миграции БД.
4. Сравни переменные окружения с [.env.example](../.env.example).

## 10. Где смотреть подробности

- [DEPLOY.md](../DEPLOY.md)
- [GETTING_STARTED.md](GETTING_STARTED.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [ENV.md](../ENV.md)
