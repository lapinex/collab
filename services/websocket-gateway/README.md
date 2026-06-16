# WebSocket Gateway

Realtime gateway for Collab (Redis pub/sub, JWT auth).

## Восстановленные файлы для билда

При откате были удалены и восстановлены:

- **package.json** — зависимости и скрипты `build` / `start`
- **tsconfig.json** — конфиг TypeScript, пути `@collab/lib/*` → `lib/server/*` (от корня репо)
- **src/server.ts** — точка входа сервера

## Сборка

Gateway зависит от `@collab/lib` и `@collab/shared` (код в корне репо: `lib/server/`, `shared/`). Варианты:

1. **Из корня репо (рекомендуется)** — если в корне есть `package.json` с workspaces и скрипт для gateway:
   ```bash
   npm run build --workspace=websocket-gateway
   ```

2. **Локально из папки gateway** — для успешной сборки нужно:
   - чтобы в `tsconfig.json` пути `@collab/*` резолвились (сейчас `baseUrl: "../.."`, paths к `lib/server/*`, `shared/*`);
   - во всех относительных импортах указать расширение `.js` (требование Node16/NodeNext для ESM).

   После правок: `npm install && npm run build`. Точка входа: `node dist/server.js`.

3. **Docker** — см. `Dockerfile` в этой папке (сборка из корня монорепо с копированием `lib/`, `shared/`).

## Запуск

После сборки:

```bash
node dist/server.js
```

Нужны переменные: `PORT`, `REDIS_URL`, `DATABASE_URL`, `WS_JWT_SECRET` (или `JWT_SECRET`), при необходимости `WS_ALLOWED_ORIGIN`. См. `env.example`.
