# 🚀 Быстрое решение проблем с сообщениями

## Самые частые проблемы и решения

### ❌ Проблема: Сообщения не отображаются

**Шаг 1: Проверьте консоль браузера (F12)**

Ищите логи:
```
[useMessages] 📦 Received API response: ...
[AppPage] Message area render decision: ...
```

**Если видите ошибку:**
- `HTTP 404` → Канал не найден, проверьте `selectedChannelId`
- `HTTP 403` → Нет прав доступа, проверьте RLS политики
- `HTTP 500` → Ошибка сервера, проверьте логи сервера

**Шаг 2: Проверьте Network tab**

1. Откройте DevTools → Network
2. Найдите запрос `/api/messages?channelId=...`
3. Проверьте Response:
   ```json
   {
     "messages": [...]  // Должен быть массив
   }
   ```

**Шаг 3: Проверьте базу данных**

```bash
npm run diagnose:messages
```

**Шаг 4: Проверьте React DevTools**

1. Установите React DevTools
2. Найдите компонент `MessageList`
3. Проверьте проп `messages` - должен быть массив

---

## 🔧 Быстрые исправления

### Исправление 1: Пустой массив вместо null

**Проблема:** `messages` может быть `null` или `undefined`

**Решение:** В `MessageList.tsx` уже есть защита:
```typescript
const safeMessages = Array.isArray(messages) ? messages : [];
```

Но добавьте логирование:
```typescript
if (!Array.isArray(messages)) {
  console.error('[MessageList] messages is not array:', typeof messages, messages);
}
```

### Исправление 2: Сообщения не загружаются

**Проблема:** API возвращает пустой массив

**Решение:** Проверьте SQL напрямую:
```sql
SELECT COUNT(*) FROM messages WHERE channel_id = 'YOUR_CHANNEL_ID';
```

Если есть сообщения, но API возвращает пусто - проверьте RLS политики в Supabase.

### Исправление 3: Сообщения загружаются, но не видны

**Проблема:** Виртуализация или условный рендеринг

**Решение:** Добавьте временный лог в `MessageList.tsx`:
```typescript
console.log('[MessageList] Render:', {
  messagesLength: safeMessages.length,
  firstMessage: safeMessages[0],
  height,
});
```

### Исправление 4: Realtime не работает

**Проблема:** Новые сообщения не появляются автоматически

**Решение:** Проверьте в консоли:
```
[Broadcast] ✅ SUBSCRIBED to chat:CHANNEL_ID
```

Если не видите - проверьте подключение к Supabase.

---

## 📋 Чеклист (5 минут)

- [ ] Открыл DevTools (F12) → Console
- [ ] Проверил логи `[useMessages]` - нет ошибок
- [ ] Проверил Network → `/api/messages` → Status 200
- [ ] Проверил Response → есть поле `messages` (массив)
- [ ] Запустил `npm run diagnose:messages` → есть сообщения в БД
- [ ] Проверил React DevTools → `MessageList` получает `messages` (массив)

**Если всё проверено, но проблема остаётся:**
→ Смотрите полное руководство: `MESSAGES_DEBUG_GUIDE.md`

---

## 🐛 Добавление отладочных логов

### В useMessages.ts

Добавьте после строки 192:
```typescript
console.log('[useMessages] 🔍 State after update:', {
  messagesCount: normalized.length,
  channelId: fetchChannelId,
  firstMessage: normalized[0],
  lastMessage: normalized[normalized.length - 1],
});
```

### В MessageList.tsx

Добавьте в начало компонента:
```typescript
console.log('[MessageList] Render:', {
  messagesProp: messages,
  safeMessagesLength: safeMessages.length,
  isArray: Array.isArray(messages),
});
```

### В app/app/page.tsx

Логирование уже есть на строке 649, но можно добавить:
```typescript
console.log('[AppPage] useMessages result:', {
  messages,
  loading: isLoadingMessages,
  channelId: selectedChannelId,
});
```

---

## 📞 Если ничего не помогло

1. Соберите логи:
   - Консоль браузера (скопируйте все логи с `[useMessages]`, `[AppPage]`, `[MessageList]`)
   - Network tab (экспорт HAR файла)
   - Вывод `npm run diagnose:messages`

2. Проверьте версии:
   - Node.js версия
   - Версия Next.js
   - Версия Supabase клиента

3. Проверьте окружение:
   - `.env.local` содержит правильный `DATABASE_URL`
   - Supabase проект активен
   - Redis (Upstash) подключен
