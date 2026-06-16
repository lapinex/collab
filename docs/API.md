# API Reference

Base URL: `/api`

All endpoints return JSON. Authentication uses JWT bearer token in `Authorization` header.

---

## Authentication

### POST /api/auth/register

Register a new user (requires whitelist + developer code).

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "User Name",
  "developerCode": "dev-code-123"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "avatarUrl": null,
    "globalRole": "user"
  }
}
```

**Errors:**
- `400` - Invalid code or email not whitelisted
- `409` - Email already registered
- `422` - Validation error

---

### POST /api/auth/login

Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Errors:**
- `401` - Invalid credentials
- `404` - User not found

---

### POST /api/auth/logout

Logout (invalidates refresh token).

**Response (200):**
```json
{ "success": true }
```

---

### POST /api/auth/refresh

Get new access token using refresh token (in cookies).

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Messages

### GET /api/messages

Fetch messages for a channel (infinite scroll with cursor).

**Query:**
- `channelId` (required) - Channel ID
- `limit` (optional, default: 50) - Messages per page
- `cursor` (optional) - Pagination cursor
- `offset` (optional, legacy) - Use cursor instead

**Response (200):**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "content": "Hello world",
      "userId": "user-uuid",
      "user": {
        "id": "user-uuid",
        "name": "User",
        "avatarUrl": "https://..."
      },
      "channelId": "channel-uuid",
      "createdAt": "2026-06-14T10:00:00Z",
      "editedAt": null,
      "deletedAt": null,
      "reactions": [
        {
          "emoji": "👍",
          "count": 2,
          "reacted": true
        }
      ]
    }
  ],
  "count": 150,
  "hasMore": true,
  "nextCursor": "msg-uuid-100"
}
```

**Errors:**
- `403` - No VIEW_CHANNEL or READ_MESSAGE_HISTORY permission
- `404` - Channel not found

---

### POST /api/messages

Send a message to a channel.

**Request:**
```json
{
  "channelId": "channel-uuid",
  "content": "Hello everyone!",
  "replyToMessageId": "optional-msg-uuid"
}
```

**Response (201):**
```json
{
  "id": "msg-uuid",
  "content": "Hello everyone!",
  "userId": "user-uuid",
  "channelId": "channel-uuid",
  "createdAt": "2026-06-14T10:00:00Z",
  "reactions": []
}
```

**Errors:**
- `400` - Invalid channel or content empty
- `403` - No SEND_MESSAGES permission
- `404` - Channel not found

---

### PATCH /api/messages/:id

Edit a message (must be author).

**Request:**
```json
{
  "content": "Edited message"
}
```

**Response (200):**
```json
{
  "id": "msg-uuid",
  "content": "Edited message",
  "editedAt": "2026-06-14T10:05:00Z"
}
```

**Errors:**
- `403` - Not author or no MANAGE_MESSAGES permission
- `404` - Message not found

---

### DELETE /api/messages/:id

Delete a message (must be author or have MANAGE_MESSAGES).

**Response (200):**
```json
{ "success": true }
```

---

### POST /api/messages/:id/reactions

Add emoji reaction to a message.

**Request:**
```json
{
  "emoji": "👍"
}
```

**Response (201):**
```json
{
  "messageId": "msg-uuid",
  "emoji": "👍",
  "userId": "user-uuid",
  "createdAt": "2026-06-14T10:00:00Z"
}
```

---

### DELETE /api/messages/:id/reactions/:emoji

Remove your reaction from a message.

**Response (200):**
```json
{ "success": true }
```

---

## Direct Messages

### GET /api/dms/channels

List DM channels for current user.

**Response (200):**
```json
{
  "channels": [
    {
      "id": "dm-uuid",
      "otherUser": {
        "id": "user-uuid",
        "name": "Friend",
        "avatarUrl": "https://..."
      },
      "lastMessage": "Last message content",
      "lastMessageAt": "2026-06-14T10:00:00Z",
      "createdAt": "2026-06-10T00:00:00Z"
    }
  ]
}
```

---

### POST /api/dms/channels

Create a DM channel with another user.

**Request:**
```json
{
  "userId": "other-user-uuid"
}
```

**Response (201):**
```json
{
  "channel": { ... }
}
```

**Errors:**
- `400` - Can't DM yourself
- `403` - User blocked you or has DMs disabled

---

### GET /api/dms/:channelId/messages

Fetch messages in a DM channel (same pagination as server messages).

**Query:**
- `limit`, `cursor`, `offset` - Same as `/api/messages`

**Response (200):**
Same as `/api/messages`

---

## Servers

### GET /api/servers

List user's servers.

**Response (200):**
```json
{
  "servers": [
    {
      "id": "server-uuid",
      "name": "My Server",
      "iconUrl": "https://...",
      "ownerId": "user-uuid",
      "description": "Server description",
      "createdAt": "2026-06-10T00:00:00Z"
    }
  ]
}
```

---

### POST /api/servers

Create a new server.

**Request:**
```json
{
  "name": "New Server",
  "description": "Optional description"
}
```

**Response (201):**
```json
{
  "id": "server-uuid",
  "name": "New Server",
  "ownerId": "user-uuid",
  ...
}
```

---

### GET /api/servers/:serverId/settings

Get full server view: channels, roles, members, emojis, stickers, webhooks.

**Response (200):**
```json
{
  "server": {
    "id": "server-uuid",
    "name": "My Server",
    ...
  },
  "channels": [
    {
      "id": "ch-uuid",
      "name": "general",
      "type": "text",
      ...
    }
  ],
  "roles": [
    {
      "id": "role-uuid",
      "name": "@everyone",
      "permissions": 104857600,
      ...
    }
  ],
  "members": [
    {
      "id": "user-uuid",
      "name": "User",
      "roles": ["role-uuid"]
    }
  ]
}
```

---

### PATCH /api/servers/:serverId

Update server settings (must have MANAGE_SERVER).

**Request:**
```json
{
  "name": "New Server Name",
  "description": "New description",
  "iconUrl": "https://...",
  "verificationLevel": "low",
  "isCommunity": true
}
```

**Response (200):**
```json
{ "success": true }
```

---

### DELETE /api/servers/:serverId

Delete server (owner only).

**Response (200):**
```json
{ "success": true }
```

---

## Channels

### GET /api/servers/:serverId/channels

List channels in a server (filtered by VIEW_CHANNEL permission).

**Query:**
- `limit` (default: 50, max: 50)
- `cursor` (for pagination)

**Response (200):**
```json
{
  "channels": [ ... ],
  "hasMore": false,
  "nextCursor": null
}
```

---

### POST /api/channels

Create a channel in a server.

**Request:**
```json
{
  "serverId": "server-uuid",
  "name": "announcements",
  "type": "announcements",
  "topic": "Optional channel topic"
}
```

**Response (201):**
```json
{
  "id": "ch-uuid",
  "name": "announcements",
  "type": "announcements",
  ...
}
```

Valid types: `text`, `voice`, `category`, `announcements`, `forum`

---

### PATCH /api/channels/:id

Update channel (must have MANAGE_CHANNELS).

**Request:**
```json
{
  "name": "new-name",
  "topic": "New topic",
  "slowmode": 0
}
```

**Response (200):**
```json
{ "success": true }
```

---

### DELETE /api/channels/:id

Delete channel (must have MANAGE_CHANNELS).

**Response (200):**
```json
{ "success": true }
```

---

## Voice

### POST /api/voice/join

Join a voice channel.

**Request:**
```json
{
  "channelId": "channel-uuid"
}
```

**Response (200):**
```json
{
  "token": "livekit-token",
  "url": "wss://livekit.example.com",
  "roomName": "room-channel-uuid"
}
```

**Errors:**
- `403` - No CONNECT permission
- `404` - Channel not found or not a voice channel

---

### POST /api/voice/leave

Leave a voice channel.

**Request:**
```json
{
  "channelId": "channel-uuid"
}
```

**Response (200):**
```json
{ "success": true }
```

---

### GET /api/voice/participants

Get active voice participants in a channel.

**Query:**
- `channelId` (required)

**Response (200):**
```json
{
  "participants": [
    {
      "userId": "user-uuid",
      "name": "User",
      "joinedAt": "2026-06-14T10:00:00Z",
      "isMuted": false,
      "isDeafened": false
    }
  ]
}
```

---

## Roles & Permissions

### GET /api/servers/:serverId/roles

List server roles.

**Response (200):**
```json
{
  "roles": [
    {
      "id": "role-uuid",
      "name": "@everyone",
      "color": "#99aab5",
      "position": 0,
      "permissions": 104857600
    }
  ]
}
```

---

### POST /api/servers/:serverId/roles

Create a role.

**Request:**
```json
{
  "name": "Moderator",
  "color": "#FF0000"
}
```

**Response (201):**
```json
{ ... }
```

---

### PATCH /api/servers/:serverId/roles/:roleId

Update a role (must have MANAGE_ROLES).

**Request:**
```json
{
  "name": "New Name",
  "color": "#00FF00",
  "permissions": 104857600
}
```

**Response (200):**
```json
{ "success": true }
```

---

### DELETE /api/servers/:serverId/roles/:roleId

Delete a role (must have MANAGE_ROLES, can't delete @everyone).

**Response (200):**
```json
{ "success": true }
```

---

## Media

### POST /api/media/upload

Upload a file (image, video, document).

**Request:** (multipart/form-data)
```
Content-Disposition: form-data; name="file"; filename="image.png"
Content-Type: image/png

[binary data]
```

**Response (201):**
```json
{
  "id": "media-uuid",
  "fileName": "image.png",
  "cdnUrl": "https://res.cloudinary.com/...",
  "fileSize": 123456,
  "mimeType": "image/png"
}
```

**Limits:**
- Max file size: 25MB
- Allowed types: Images, videos, documents (PDF, DOCX, XLSX, etc.)

---

## Presence

### GET /api/presence

Get online status of users.

**Query:**
- `userIds[]` - Array of user IDs to check

**Response (200):**
```json
{
  "presence": [
    {
      "userId": "user-uuid",
      "status": "online",
      "customStatus": "Working on v2.0",
      "lastSeen": "2026-06-14T10:00:00Z"
    }
  ]
}
```

---

## Errors

All errors return JSON:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Optional details"
}
```

Common status codes:
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (permission denied)
- `404` - Not found
- `409` - Conflict (resource already exists)
- `422` - Unprocessable entity
- `429` - Too many requests (rate limited)
- `500` - Server error

---

## Rate Limiting

API endpoints are rate limited:
- **Auth endpoints**: 5 requests per minute per IP
- **Other endpoints**: 60 requests per minute per user
- **Media upload**: 10 uploads per minute per user

Headers returned:
- `X-RateLimit-Limit` - Requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Unix timestamp when limit resets

---

## Webhooks (Beta)

Create webhooks to receive real-time events:

```bash
POST /api/servers/:serverId/webhooks
{
  "name": "My Webhook",
  "url": "https://example.com/webhook",
  "channelId": "channel-uuid",
  "events": ["message.created", "message.deleted"]
}
```

**Events:**
- `message.created` - New message posted
- `message.deleted` - Message deleted
- `message.updated` - Message edited
- `user.joined` - User joined server
- `user.left` - User left server

---

## Authentication Header

Include JWT token in all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Or as cookie:
```
Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Examples

### Create a server, channel, and send a message

```bash
# 1. Create server
curl -X POST http://localhost:4000/api/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Server"}'
# Returns: {"id": "server-id", ...}

# 2. Get channels
curl http://localhost:4000/api/servers/server-id/channels \
  -H "Authorization: Bearer $TOKEN"
# Returns: {"channels": [{"id": "general-id", "name": "general", ...}]}

# 3. Send message
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "general-id",
    "content": "Hello world!"
  }'
# Returns: {"id": "msg-id", "content": "Hello world!", ...}
```

---

For more info, see [docs](.) or [GitHub](https://github.com/lapinex/collab)
