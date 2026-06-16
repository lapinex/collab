# ServerView Client Cache Architecture Contract (после 0.17.1)

Этот документ критически важен. Он описывает архитектурный контракт кэша ServerView на клиенте после версии 0.17.1.

---

## 1. Single Source of Truth

После версии 0.17.1 в клиенте **не существует** query-кэша `['serverView', id]`.

Он **запрещён** как источник данных.

Единственные кэши ServerView:

| Slice | Query key | Содержимое |
|-------|-----------|------------|
| Meta | `['sv:meta', serverId]` | `{ server, roles, stickers, currentUserPermissions }` |
| Channels | `['sv:channels', serverId]` | `Channel[]` |
| Members | `['sv:members', serverId]` | `ServerViewMember[]` |
| Emojis | `['sv:emojis', serverId]` | `ServerEmoji[]` |
| Webhooks | `['sv:webhooks', serverId]` | `Webhook[]` |

**Любой код, который читает ServerView, обязан читать один из этих ключей.**

---

## 2. Полный ServerView — это только fetcher

`fetchServerView(serverId)` используется **только** в:

- **useServerViewSlices**

Он:

1. Загружает полный view
2. Раскладывает его по slice-кэшам
3. **Никогда не регистрируется как query**

`useServerViewQuery` считается **legacy** и **не используется в UI**.

---

## 3. Realtime никогда не патчит «весь view»

Realtime работает только так:

> событие домена → patcher домена → запись **только** в соответствующий slice key

**Запрещено:**

- вызывать `applyServerViewRealtimeEvent`
- писать в несколько slice одновременно
- писать в не свой slice

---

## 4. Cache Safety работает только со slices

Invalidate, reconnect, 60s timeout, 5 min refresh — **всё инвалидирует только slices**.

**Никогда не инвалидируется** `serverView`.

---

## 5. Запрещённые действия (это важно)

В проекте **нельзя**:

- ❌ Делать `queryClient.setQueryData(['serverView', id], …)`
- ❌ Делать `invalidateQueries(['serverView', id])`
- ❌ Использовать `useServerViewQuery` в UI
- ❌ Хранить `ServerViewData` целиком в каком-либо сторе

Если это появляется — архитектура снова сломана.

---

## 6. Почему это важно

Потому что теперь:

- нет гонок parent ↔ slices
- нет двойного источника правды
- нет refetch, который может перетереть realtime
- кэш ведёт себя как **event-sourced store**

Это уже не «React Query патчи», а **клиентский read-model**, как в CQRS.

---

## 7. Это становится шаблоном для всего остального

И вот самое важное.

Эта схема — **эталон**, по которому дальше должны строиться:

- **MessageView**
- **DMView**
- **ThreadView**
- **NotificationView**

Если для сообщений (или других view) сделать **НЕ ТАК** — снова начнутся те же проблемы, которые были побеждены в ServerView.

---

## 8. Ментальная модель (как теперь думать)

**Раньше:**

> React Query хранит данные, realtime их иногда подправляет

**Теперь:**

> **Realtime — главный источник изменений**  
> **Fetch — только начальная инициализация и safety**  
> **Query cache — это хранилище read-model**

Это архитектура уровня Discord / Linear / Slack.

Без шуток.
