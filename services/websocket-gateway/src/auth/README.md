# JWT Authentication for WebSocket Gateway

## Overview

WebSocket Gateway поддерживает только **ES256** (ECC P-256) через Supabase JWKS.

## Архитектура валидации

```
JWT Token
    ↓
Decode Header (NOT verify)
    ↓
Determine Algorithm (alg)
    └─ ES256 → JWKS (EC P-256 keys)
    ↓
Verify Token
    ↓
Return User Payload
```

## Конфигурация

### Environment Variables

```bash
# JWKS URL (обязательно, если не используется SUPABASE_URL)
JWKS_URL=https://your-project.supabase.co/auth/v1/keys

# Или используйте SUPABASE_URL для автоматической конфигурации
SUPABASE_URL=https://your-project.supabase.co

# Опционально: для аутентификации JWKS endpoint (если требуется)
SUPABASE_ANON_KEY=your-anon-key

# JWT audience (опционально, по умолчанию 'authenticated')
SUPABASE_JWT_AUD=authenticated
```

### Пример `.env.gateway`

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT Audience
SUPABASE_JWT_AUD=authenticated
```

## Использование

### В WebSocket Connection Handler

```typescript
import { authenticateConnection } from './connection';
import { verifyJwt } from './auth/jwks';

// В server.ts или connection handler
wss.on('connection', async (ws: WebSocket, req) => {
// Извлечь токен из Authorization header, Sec-WebSocket-Protocol или query параметра
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['sec-websocket-protocol']?.toString().split(',')[1]?.trim() ||
    url.searchParams.get('token');

  if (!token) {
    sendAuthError(ws, { code: 'AUTH_MISSING', message: 'Token required' });
    ws.close();
    return;
  }

  // Аутентификация через authenticateConnection (рекомендуется)
  const auth = await authenticateConnection(ws, token);
  if (!auth) {
    sendAuthError(ws, { code: 'AUTH_INVALID', message: 'Invalid token' });
    ws.close();
    return;
  }

  // Или напрямую через verifyJwt
  try {
    const jwt = await verifyJwt(token);
    // Использовать jwt.userId, jwt.email и т.д.
  } catch (error) {
    // Обработать ошибку
  }
});
```

### Прямое использование verifyJwt

```typescript
import { verifyJwt } from './auth/jwks';

async function handleToken(token: string) {
  try {
    const jwt = await verifyJwt(token);
    
    console.log('User ID:', jwt.userId);
    console.log('Email:', jwt.email);
    console.log('Issuer:', jwt.iss);
    console.log('Audience:', jwt.aud);
    console.log('Expires:', new Date(jwt.exp * 1000));
    
    return jwt;
  } catch (error) {
    if (error instanceof Error) {
      console.error('JWT verification failed:', error.message);
    }
    throw error;
  }
}
```

## Алгоритмы

### ES256 (ECC P-256) - Основной

- **Тип**: Асимметричный (публичный ключ)
- **Источник ключей**: JWKS endpoint
- **Кривая**: P-256 (secp256r1)
- **Использование**: Современные Supabase JWT токены

**Процесс:**
1. Декодировать JWT header для получения `kid`
2. Загрузить JWKS (кэшируется в памяти)
3. Найти EC ключ по `kid`
4. Верифицировать подпись с помощью публичного ключа

### HS256 (HMAC SHA-256)

- ❌ **Не поддерживается**. Используйте ES256 токены Supabase Auth.

## Кэширование JWKS

- **TTL**: 24 часа
- **Минимальная валидность**: 10 минут (для graceful degradation)
- **Background refresh**: Обновление начинается при 80% TTL
- **Fallback**: При ошибке загрузки используется старый кэш (если валиден)

## Обработка ошибок

### Типичные ошибки

1. **Invalid JWT header**: Невалидный формат JWT
2. **JWT alg missing**: Алгоритм не указан в header
3. **Unsupported JWT algorithm**: Алгоритм не ES256
4. **JWT kid missing**: Kid отсутствует (для ES256)
5. **JWT kid not found in JWKS**: Ключ не найден в JWKS
6. **JWT sub missing**: User ID отсутствует в payload
7. **JWKS unavailable**: JWKS endpoint недоступен

### Production Best Practices

- ✅ **НЕ логируйте полный JWT токен** (безопасность)
- ✅ Используйте graceful degradation (старый кэш при ошибках)
- ✅ Валидируйте пользователя в базе данных (zero trust)
- ✅ Обрабатывайте все ошибки аутентификации
- ✅ Используйте правильные HTTP статусы и коды ошибок

## Безопасность

1. **Не логируйте токены**: Токены содержат чувствительную информацию
2. **Валидация в БД**: Даже валидный JWT не гарантирует существование пользователя
3. **Zero Trust**: Проверяйте каждое соединение
4. **Graceful Degradation**: Gateway должен работать даже при временной недоступности JWKS

## Примеры токенов

### ES256 Token (Supabase)

```
Header: {
  "alg": "ES256",
  "typ": "JWT",
  "kid": "ecc-key-id"
}
```

### HS256 Token (Legacy)

- ❌ Неподдерживаемый формат. Токены с `alg: HS256` будут отвергнуты.

## Troubleshooting

### JWKS возвращает 401

- Проверьте `SUPABASE_ANON_KEY` (если требуется)
- Убедитесь, что JWKS URL правильный
- Проверьте права доступа к endpoint

### "No valid EC keys found"

- Убедитесь, что JWKS содержит EC P-256 ключи (kty: "EC", crv: "P-256")
- Проверьте, что ключи имеют поля `x`, `y`, `crv`

### "Unsupported JWT algorithm: HS256"

- Токен не Supabase access_token. Получите ES256 токен от Supabase Auth.
