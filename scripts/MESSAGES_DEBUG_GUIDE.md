# 🔍 Полное руководство по диагностике проблем с отображением сообщений

## Быстрый старт

```bash
# 1. Проверка базы данных
npm run diagnose:messages

# 2. Проверка в браузере
# Откройте DevTools (F12) → Console
# Ищите логи с префиксом [useMessages]
```

---

## 1. UI/Визуальный слой

### Компоненты для проверки

**Основные компоненты:**
- `components/message/MessageList.tsx` - список сообщений
- `components/message/MessageItem.tsx` - отдельное сообщение
- `app/app/page.tsx` - главная страница (использует useMessages)

### Проверка условного рендеринга

**В MessageList.tsx (строки 32-46):**
```typescript
const safeMessages = Array.isArray(messages) ? messages : [];

if (safeMessages.length === 0) {
  return (
    <div>No messages yet</div>
  );
}
```

**Проблема:** Если `messages` не массив, показывается пустой экран.

**Решение:** Добавьте логирование:
```typescript
console.log('[MessageList] Render:', {
  messages,
  isArray: Array.isArray(messages),
  length: Array.isArray(messages) ? messages.length : 'N/A',
  type: typeof messages
});
```

### Проверка MessageItem

**В MessageItem.tsx (строки 56-63):**
```typescript
itemContent={(index) => {
  const message = safeMessages[index];
  if (!message) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[MessageList] Message at index ${index} is null/undefined`);
    }
    return null;
  }
  // ...
}}
```

**Проблема:** Если сообщение `null/undefined`, компонент возвращает `null` и ничего не рендерится.

**Решение:** Проверьте логи в консоли - должны быть предупреждения.

---

## 2. Состояние (State Management)

### Как хранятся сообщения

**В useMessages.ts (строка 12):**
```typescript
const [messages, setMessages] = useState<MessageWithUser[]>([]);
```

**Начальное состояние:** `[]` (пустой массив)

### Проверка обновлений состояния

**Добавьте логирование в useMessages.ts:**

```typescript
useEffect(() => {
  console.log('[useMessages] State update:', {
    messagesCount: messages.length,
    channelId,
    loading,
    error: error?.message,
    firstMessageId: messages[0]?.id,
    lastMessageId: messages[messages.length - 1]?.id,
  });
}, [messages, channelId, loading, error]);
```

### Проблемы с иммутабельностью

**Проверьте, что обновления используют иммутабельные операции:**

```typescript
// ✅ Правильно
setMessages([...prev, newMessage]);
setMessages(prev => prev.map(msg => msg.id === id ? updated : msg));

// ❌ Неправильно
messages.push(newMessage); // Мутация!
```

---

## 3. Получение данных (Data Fetching)

### API Endpoint

**URL:** `/api/messages?channelId={channelId}&limit=50`

**Проверка в Network tab:**

1. Откройте DevTools → Network
2. Фильтр: XHR или Fetch
3. Найдите запрос к `/api/messages`
4. Проверьте:
   - **Status:** должен быть `200 OK`
   - **Request URL:** должен содержать правильный `channelId`
   - **Response:** должен быть JSON с полем `messages` (массив)

### Структура ответа API

**Ожидаемый формат:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "channelId": "uuid",
      "userId": "uuid",
      "content": "text",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "user": {
        "id": "uuid",
        "name": "User Name",
        "avatarUrl": null
      },
      "reactions": []
    }
  ]
}
```

**Проблемы:**
- Если ответ `{ error: "..." }` - проверьте авторизацию и права доступа
- Если `messages` отсутствует - проверьте формат ответа API
- Если массив пустой `[]` - сообщений в базе нет для этого канала

### Логирование в useMessages

**В useMessages.ts уже есть логирование (строки 136-165):**

```typescript
console.log(`[useMessages] 📦 Received API response:`, {
  channelId: fetchChannelId,
  hasData: !!data,
  dataKeys: data ? Object.keys(data) : [],
  isArray: Array.isArray(data),
  hasMessages: Array.isArray(data?.messages),
  messagesCount: Array.isArray(data?.messages) ? data.messages.length : 0,
});
```

**Проверьте консоль браузера** - должны быть эти логи.

### Обработка ошибок

**В useMessages.ts (строки 121-127):**
```typescript
.then(async (res) => {
  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
})
```

**Проверьте:**
- Если `res.ok === false` - будет ошибка в консоли
- Проверьте статус код (404, 403, 500 и т.д.)

---

## 4. База данных и бэкенд

### Проверка структуры таблицы

**SQL запрос:**
```sql
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'messages'
ORDER BY ordinal_position;
```

**Ожидаемые колонки:**
- `id` (uuid, NOT NULL)
- `channel_id` (uuid, NOT NULL)
- `user_id` (uuid, NOT NULL)
- `content` (text, NOT NULL)
- `created_at` (timestamp, NOT NULL)
- `updated_at` (timestamp, NOT NULL)
- `edited_at` (timestamp, NULL)
- `deleted_at` (timestamp, NULL)

### Проверка наличия сообщений

**SQL запрос для конкретного канала:**
```sql
SELECT 
  m.id,
  m.channel_id,
  m.user_id,
  m.content,
  m.created_at,
  c.name as channel_name,
  u.name as user_name
FROM messages m
JOIN channels c ON c.id = m.channel_id
JOIN users u ON u.id = m.user_id
WHERE m.channel_id = 'YOUR_CHANNEL_ID'
  AND m.deleted_at IS NULL
ORDER BY m.created_at DESC
LIMIT 50;
```

**Запуск диагностики:**
```bash
npm run diagnose:messages
```

### Проверка RLS политик (Row Level Security)

**В Supabase Dashboard:**
1. Откройте Authentication → Policies
2. Найдите таблицу `messages`
3. Проверьте политики SELECT

**Проблема:** Если RLS включен, но нет политик - запросы вернут пустой результат.

**Решение:** Создайте политику или временно отключите RLS для тестирования.

---

## 5. Realtime подписки (Supabase Broadcast)

### Как работает

**В useMessages.ts (строки 232-307):**
```typescript
const { isConnected } = useBroadcastChannel({
  channelName: channelId ? `chat:${channelId}` : '',
  event: 'message',
  enabled: !!channelId,
  onMessage: (payload) => {
    // Обработка нового сообщения
  },
});
```

### Проверка подключения

**В консоли браузера ищите:**
```
[Broadcast] ✅ SUBSCRIBED to chat:CHANNEL_ID
```

**Если не видите:**
- Проверьте, что `channelId` не пустой
- Проверьте, что `enabled: !!channelId` === `true`
- Проверьте подключение к Supabase

### Проблема: Сообщения не приходят в реальном времени

**Проверьте:**
1. Подписка активна? (логи `[Broadcast] ✅ SUBSCRIBED`)
2. Сообщения отправляются через Broadcast? (проверьте бэкенд)
3. Формат payload правильный? (должен соответствовать `MessageWithUser`)

---

## 6. Пошаговая диагностика

### Шаг 1: Проверка базовых данных

```bash
# Запустите диагностику БД
npm run diagnose:messages

# Проверьте:
# - Есть ли сообщения в базе?
# - Правильная ли структура таблицы?
# - Есть ли проблемные сообщения?
```

### Шаг 2: Проверка API

**В браузере:**
1. Откройте DevTools → Network
2. Перезагрузите страницу
3. Найдите запрос `/api/messages?channelId=...`
4. Проверьте:
   - Статус: `200 OK`
   - Response содержит `messages` (массив)
   - Массив не пустой (если есть сообщения в БД)

**Если ошибка:**
- `404` - канал не найден
- `403` - нет прав доступа
- `500` - ошибка сервера (проверьте логи)

### Шаг 3: Проверка React компонентов

**В React DevTools:**
1. Установите расширение React DevTools
2. Найдите компонент `MessageList`
3. Проверьте пропсы:
   - `messages` - должен быть массив
   - `currentUserId` - должен быть строкой
4. Проверьте состояние:
   - `loading` - должен быть `false` после загрузки
   - `error` - должен быть `null`

### Шаг 4: Проверка логов

**В консоли браузера ищите:**

```
[useMessages] 📦 Received API response: { ... }
[useMessages] ✅ Normalized messages: { ... }
[useMessages] ✅ Messages state updated: { ... }
```

**Если не видите:**
- Проверьте, что `channelId` передан в `useMessages`
- Проверьте, что компонент монтирован

### Шаг 5: Изоляция проблемы

**Создайте минимальный тестовый компонент:**

```typescript
'use client';

import { useMessages } from '@/hooks/useMessages';

export function TestMessages({ channelId }: { channelId: string }) {
  const { messages, loading, error } = useMessages({ channelId });
  
  console.log('[TestMessages]', { messages, loading, error });
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      <h2>Messages ({messages.length})</h2>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

**Используйте его вместо основного компонента** для изоляции проблемы.

---

## 7. Распространённые проблемы

### Проблема 1: Сообщения не загружаются

**Симптомы:**
- Пустой экран "No messages yet"
- В Network видно запрос, но ответ пустой

**Диагностика:**
```bash
# Проверьте БД
npm run diagnose:messages

# Проверьте SQL напрямую
SELECT COUNT(*) FROM messages WHERE channel_id = 'YOUR_CHANNEL_ID';
```

**Решение:**
- Если в БД есть сообщения, но API возвращает пусто - проверьте RLS политики
- Если в БД нет сообщений - создайте тестовое сообщение

### Проблема 2: Сообщения загружаются, но не отображаются

**Симптомы:**
- В Network видно сообщения в ответе
- В консоли видно `[useMessages] ✅ Messages state updated`
- Но UI пустой

**Диагностика:**
```typescript
// Добавьте в MessageList.tsx
console.log('[MessageList] Render:', {
  messages,
  safeMessages: Array.isArray(messages) ? messages : [],
  length: Array.isArray(messages) ? messages.length : 0,
});
```

**Решение:**
- Проверьте, что `messages` - массив
- Проверьте, что `messages.length > 0`
- Проверьте условный рендеринг в `MessageList`

### Проблема 3: Неправильный порядок сообщений

**Симптомы:**
- Сообщения отображаются, но в неправильном порядке

**Диагностика:**
```typescript
// В useMessages.ts проверьте сортировку
console.log('[useMessages] Messages order:', 
  normalized.map(m => ({ id: m.id, createdAt: m.createdAt }))
);
```

**Решение:**
- API возвращает сообщения в порядке `ORDER BY created_at DESC`
- Проверьте, что `createdAt` правильно парсится
- Проверьте сортировку в `MessageList` (если есть)

### Проблема 4: Фильтрация удалённых сообщений

**Симптомы:**
- В БД есть сообщения, но они не отображаются

**Диагностика:**
```sql
SELECT COUNT(*) FROM messages 
WHERE channel_id = 'YOUR_CHANNEL_ID' 
  AND deleted_at IS NOT NULL;
```

**Решение:**
- API должен фильтровать `deleted_at IS NULL`
- Проверьте запрос в `app/api/messages/route.ts`

### Проблема 5: Виртуализация списков

**Симптомы:**
- Сообщения есть, но видны не все

**Диагностика:**
- `MessageList` использует `react-virtuoso` для виртуализации
- Проверьте `totalCount={safeMessages.length}` - должно совпадать с реальным количеством

**Решение:**
- Убедитесь, что `totalCount` правильный
- Проверьте `initialTopMostItemIndex` - должен быть `length - 1` для прокрутки вниз

---

## 8. Чеклист диагностики

- [ ] Запущена диагностика БД: `npm run diagnose:messages`
- [ ] Проверен Network tab - запрос к `/api/messages` возвращает 200
- [ ] Проверен Response - содержит массив `messages`
- [ ] Проверена консоль браузера - нет ошибок
- [ ] Проверены логи `[useMessages]` - видны все этапы
- [ ] Проверен React DevTools - `MessageList` получает правильные пропсы
- [ ] Проверена Broadcast подписка - видно `[Broadcast] ✅ SUBSCRIBED`
- [ ] Проверена структура данных - `messages` это массив
- [ ] Проверена нормализация - все сообщения имеют `id`, `content`, `user`
- [ ] Проверен условный рендеринг - нет ранних `return null`

---

## 9. Полезные SQL запросы

### Проверка сообщений в канале
```sql
SELECT 
  m.*,
  c.name as channel_name,
  u.name as user_name
FROM messages m
JOIN channels c ON c.id = m.channel_id
JOIN users u ON u.id = m.user_id
WHERE m.channel_id = 'YOUR_CHANNEL_ID'
ORDER BY m.created_at DESC;
```

### Проверка последних сообщений
```sql
SELECT 
  m.id,
  m.content,
  m.created_at,
  c.name as channel_name
FROM messages m
JOIN channels c ON c.id = m.channel_id
ORDER BY m.created_at DESC
LIMIT 10;
```

### Проверка проблемных сообщений
```sql
-- Сообщения без канала
SELECT m.* FROM messages m
LEFT JOIN channels c ON c.id = m.channel_id
WHERE c.id IS NULL;

-- Сообщения без пользователя
SELECT m.* FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE u.id IS NULL;
```

---

## 10. Контакты и поддержка

Если проблема не решена:
1. Соберите логи из консоли браузера
2. Соберите логи из Network tab (экспорт HAR)
3. Запустите `npm run diagnose:messages` и сохраните вывод
4. Проверьте логи сервера (если есть доступ)
