# Collab Desktop (Electron)

Окно Electron загружает веб-приложение **Collab** по адресу `https://your-app.vercel.app`. Кастомные кнопки (свернуть / развернуть / обновить / закрыть) видны только в десктоп-сборке.

Иконка приложения и окна: `logotemporary.ico` в папке `electron/`. Положите файл сюда перед сборкой.

## Запуск

```bash
cd electron
npm install
npm start
```

## Сборка установщика

```bash
cd electron
npm install
npm run dist
```

Артефакты появятся в `electron/dist/`. Папки `dist`, `out` и `node_modules` внутри `electron/` добавлены в `.gitignore` корня проекта.
