# 📚 Документация по диагностике сообщений

## 🎯 Быстрый старт

**Проблема:** Сообщения не отображаются в чате

**Решение за 2 минуты:**
1. Откройте DevTools (F12) → Console
2. Ищите логи `[useMessages]` и ошибки
3. Проверьте Network tab → запрос `/api/messages` → Status 200
4. Запустите: `npm run diagnose:messages`

**Подробнее:** См. `QUICK_FIX_MESSAGES.md`

---

## 📖 Документация

### 1. `QUICK_FIX_MESSAGES.md` ⚡
**Для кого:** Нужно быстро решить проблему  
**Содержит:**
- Самые частые проблемы и решения
- Быстрые исправления
- Чеклист на 5 минут

### 2. `MESSAGES_DEBUG_GUIDE.md` 📘
**Для кого:** Нужен полный системный анализ  
**Содержит:**
- 10 разделов диагностики
- Пошаговые инструкции
- SQL запросы для проверки
- Примеры кода для отладки

### 3. `diagnose-messages.ts` 🔧
**Для кого:** Нужна диагностика базы данных  
**Запуск:** `npm run diagnose:messages`  
**Проверяет:**
- Структуру таблицы `messages`
- Наличие сообщений в БД
- Проблемные сообщения (orphan, без пользователя)
- Индексы и foreign keys

---

## 🛠️ Инструменты

### Команды npm

```bash
# Диагностика базы данных
npm run diagnose:messages

# Диагностика БД (общая)
npm run db:diagnose

# Исправление дублирующихся индексов
npm run db:fix-indexes
```

### SQL запросы

**Проверка сообщений в канале:**
```sql
SELECT m.*, c.name as channel_name, u.name as user_name
FROM messages m
JOIN channels c ON c.id = m.channel_id
JOIN users u ON u.id = m.user_id
WHERE m.channel_id = 'YOUR_CHANNEL_ID'
ORDER BY m.created_at DESC;
```

**Проверка последних сообщений:**
```sql
SELECT m.id, m.content, m.created_at, c.name as channel_name
FROM messages m
JOIN channels c ON c.id = m.channel_id
ORDER BY m.created_at DESC
LIMIT 10;
```

---

## 🔍 Архитектура системы сообщений

### Поток данных

```
1. БД (PostgreSQL/Supabase)
   ↓
2. API Route (/api/messages)
   ↓
3. useMessages Hook
   ↓
4. MessageList Component
   ↓
5. MessageItem Component
```

### Realtime обновления

```
1. WebSocket Gateway
   ↓
2. Redis Pub/Sub
   ↓
3. Supabase Broadcast
   ↓
4. useBroadcastChannel Hook
   ↓
5. useMessages Hook (обновление состояния)
```

---

## 📊 Ключевые компоненты

### Хуки

- **`useMessages`** (`hooks/useMessages.ts`)
  - Загрузка сообщений через API
  - Подписка на Broadcast Channel
  - Нормализация данных
  - Управление состоянием

- **`useBroadcastChannel`** (`hooks/useBroadcastChannel.ts`)
  - Подписка на Supabase Broadcast
  - Обработка realtime событий

### Компоненты

- **`MessageList`** (`components/message/MessageList.tsx`)
  - Отображение списка сообщений
  - Виртуализация (react-virtuoso)
  - Обработка пустого состояния

- **`MessageItem`** (`components/message/MessageItem.tsx`)
  - Отображение одного сообщения
  - Реакции, редактирование, перевод

### API Routes

- **`GET /api/messages`** (`app/api/messages/route.ts`)
  - Получение сообщений канала
  - Проверка прав доступа
  - Фильтрация удалённых сообщений

---

## 🐛 Типичные проблемы

### 1. Сообщения не загружаются

**Причины:**
- Канал не выбран (`selectedChannelId` пустой)
- Нет прав доступа (RLS политики)
- Ошибка API (404, 403, 500)
- Сообщений нет в БД

**Решение:**
- Проверьте логи `[useMessages]`
- Проверьте Network tab
- Запустите `npm run diagnose:messages`

### 2. Сообщения загружаются, но не отображаются

**Причины:**
- `messages` не массив
- Условный рендеринг возвращает `null`
- Виртуализация скрывает сообщения
- Проблема с нормализацией данных

**Решение:**
- Проверьте React DevTools
- Добавьте логирование в `MessageList`
- Проверьте структуру данных

### 3. Realtime не работает

**Причины:**
- Broadcast Channel не подписан
- Неправильный формат payload
- Проблема с Supabase подключением

**Решение:**
- Проверьте логи `[Broadcast]`
- Проверьте формат сообщений
- Проверьте подключение к Supabase

---

## 📝 Логирование

### Где искать логи

**В браузере (Console):**
- `[useMessages]` - загрузка и обработка сообщений
- `[AppPage]` - рендеринг главной страницы
- `[MessageList]` - рендеринг списка сообщений
- `[Broadcast]` - realtime подписки

**На сервере:**
- Логи API routes (`app/api/messages/route.ts`)
- Логи WebSocket Gateway (`services/websocket-gateway/`)

### Как включить детальное логирование

**В useMessages.ts:**
```typescript
// Уже включено в development режиме
if (process.env.NODE_ENV === 'development') {
  console.log('[useMessages] ...');
}
```

**В MessageList.tsx:**
```typescript
// Добавьте в начало компонента
console.log('[MessageList] Render:', { messages, safeMessages });
```

---

## 🔗 Полезные ссылки

- **Supabase Realtime:** https://supabase.com/docs/guides/realtime
- **React Virtuoso:** https://virtuoso.dev/
- **Drizzle ORM:** https://orm.drizzle.team/

---

## 📞 Поддержка

Если проблема не решена:

1. Соберите информацию:
   - Логи из консоли браузера
   - HAR файл из Network tab
   - Вывод `npm run diagnose:messages`
   - Скриншоты React DevTools

2. Проверьте документацию:
   - `QUICK_FIX_MESSAGES.md` - быстрые решения
   - `MESSAGES_DEBUG_GUIDE.md` - полное руководство

3. Проверьте версии:
   - Node.js, Next.js, Supabase client
   - Зависимости в `package.json`
