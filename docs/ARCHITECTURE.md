# Architecture Guide

This document explains key design decisions in Collab.

---

## High-Level Overview

```
┌─────────────────────┐
│   Vercel Frontend   │
│  (Next.js 15, TQ5)  │
└──────────┬──────────┘
           │
           │ HTTP (REST)
           │ WebSocket (optional)
           ↓
┌─────────────────────────────────────┐
│      Express API (Cloud Run)         │
│  • JWT Auth                          │
│  • Routes: /messages, /servers, etc  │
│  • PostgreSQL (Drizzle ORM)          │
│  • Redis (cache, pub/sub)            │
└─────────────────────────────────────┘
           │
           ├─→ PostgreSQL (managed)
           ├─→ Redis (managed)
           └─→ Cloudinary (CDN)
           
┌─────────────────────────────────────┐
│  Supabase Realtime (broadcast)      │
│  • Message updates (chat, DM)        │
│  • Presence changes                  │
│  • Channel updates                   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  LiveKit (voice, optional)           │
│  • WebRTC signaling                  │
│  • Audio/video routing               │
└─────────────────────────────────────┘
```

---

## Frontend Architecture

### State Management: Zustand + React Query

```
┌─────────────────────────────────┐
│     UI State (Zustand)          │
├─────────────────────────────────┤
│ • auth-store: user, isLoggedIn  │
│ • navigation-store: selected    │
│   channel, server               │
│ • voice-presence-store: mute,   │
│   deafen state                  │
│ • activity-store: typing        │
│   indicators                    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Server State (React Query)     │
├─────────────────────────────────┤
│ Query Keys (caching):           │
│ • ['servers'] - user's servers  │
│ • ['messages', channelId]       │
│   - infinite scroll messages    │
│ • ['dm-channels'] - DM list     │
│ • ['server-view', serverId]     │
│   - channels, roles, members    │
│ • ['presence', userId]          │
│   - online status               │
└─────────────────────────────────┘
```

**Why this split?**
- **Zustand**: UI state is local-only (no sync needed)
- **React Query**: Server state needs caching, deduplication, refetch on focus

### Data Flow Example: Send a Message

```
User types → ChatWindow
              ↓
         MessageInput.tsx
              ↓
    useMessages(channelId)
              ↓
    1. Optimistic update
       setQueryData(['messages', channelId], ...)
       ↓
       (Message appears instantly in UI)
              ↓
    2. Send to API
       POST /api/messages
              ↓
    3. Server response
       ↓
    4. Final update in cache
       (replace optimistic with server version)
```

**Benefits:**
- No loading spinner ✅
- Works even if network is slow
- Automatically reverts if server rejects

### Real-time Sync: Supabase Broadcast

```
User A sends message
    ↓
API: INSERT message
    ↓
Supabase Realtime: broadcasts on `chat:channel-id`
    ↓
User B's browser:
  useBroadcastChannel('chat:channel-id')
    ↓
  receives { type: 'message:created', data: {...} }
    ↓
  queryClient.invalidateQueries(['messages', channelId])
    ↓
  useMessagesQuery refetches
    ↓
  Message appears on User B's screen
```

**Why Supabase Realtime instead of custom WebSocket?**
- No separate infrastructure
- PostgreSQL changes → real-time broadcast automatically
- Built-in auth with JWT
- Simpler to scale

---

## Backend Architecture

### Express API Structure

```
services/api/src/
├── server.ts          # Express app setup
├── infra.ts           # Middleware, DB, auth
└── routes/
    ├── auth.ts        # Login, register, refresh
    ├── messages.ts    # CRUD + reactions
    ├── dms.ts         # DM channels + messages
    ├── servers.ts     # Server CRUD + settings
    ├── channels.ts    # Channel CRUD + permissions
    ├── voice.ts       # Join/leave + LiveKit tokens
    ├── media.ts       # File upload → Cloudinary
    ├── presence.ts    # User online status
    ├── friends.ts     # Friend requests + list
    ├── notifications.ts
    ├── invites.ts
    ├── admin.ts       # Whitelist, codes
    └── misc.ts
```

### Authentication Flow

```
Client
  ↓
  POST /api/auth/register
  {email, password, name, developerCode}
  ↓
Check:
  • Email in whitelist? ✓
  • Code not used? ✓
  • Email unique? ✓
  ↓
  CREATE user (bcrypt hash password)
  CREATE session (JWT)
  ↓
  Response: {accessToken, user}
  ↓
Client stores token:
  • In localStorage (for persistence)
  • In cookies (for API calls)
  ↓
  Next request:
  Authorization: Bearer {accessToken}
  ↓
API: verify JWT
  • Check signature
  • Check expiration
  • Extract user ID
  ↓
  Attach user to request
  ↓
  Handler can access req.user
```

### Permission System: Bitfield RBAC

```
Permissions are stored as 32-bit integers:

Bit 0:  VIEW_CHANNEL
Bit 1:  MANAGE_CHANNELS
Bit 2:  SEND_MESSAGES
Bit 3:  ADD_REACTIONS
Bit 4:  READ_MESSAGE_HISTORY
... (30 total permission bits)

Example: VIEW_CHANNEL | SEND_MESSAGES
= 0b00000000000000000000000000000011
= 3

When user performs action:
  1. Get user's roles in server
  2. Get role permissions (bitfield)
  3. Check channel-level overwrites (allow/deny)
  4. Calculate final permissions:
     final = (base & ~denies) | allows
  5. Check if user has permission bit:
     if (final & PERMISSION_BIT !== 0)
       ✓ allowed
     else
       ✗ denied
```

**Why bitfield?**
- Fast: O(1) permission checks (bitwise AND)
- Compact: 30 permissions in single 32-bit int
- Scales: new permissions don't require schema changes

### Database: Drizzle ORM with PostgreSQL

```
25+ Tables:

Core:
  users, sessions, developer_codes, email_whitelist

Servers:
  servers, channels, roles, user_roles, channel_permissions

Messages:
  messages, message_edits, reactions

Social:
  dm_channels, friends, friend_requests, user_blocks

Voice:
  voice_sessions

Media:
  media_files, server_emojis, server_stickers, webhooks

Activity:
  notifications, audit_logs, presence, user_sessions

Settings:
  user_settings, server_profiles, server_invitations, banned_members
```

**Why Drizzle ORM?**
- TypeScript-first with excellent type inference
- Migrations are SQL files (git-friendly)
- Zero runtime overhead (SQL builder, not query builder)
- Relations are compile-time checked

---

## Data Flow: Server Messages

### 1. Fetch (Client → API)

```
Client: GET /api/messages?channelId=X&limit=50&cursor=Y
  ↓
API:
  1. Check user has VIEW_CHANNEL & READ_MESSAGE_HISTORY
  2. Query messages (cursor-based pagination)
  3. Normalize: add user info (join with users table)
  4. Return MessageDTO[]
  ↓
Client:
  1. Cache in React Query (key: ['messages', channelId])
  2. Normalize to MessageViewMessage (different shape for UI)
  3. Store in @tanstack/react-virtual for rendering
```

### 2. Create (User sends message)

```
User types "Hello" → MessageInput
  ↓
useMessages.sendMessage(content)
  ↓
1. Optimistic update:
   message = {
     id: temp-uuid,
     content: "Hello",
     userId: currentUserId,
     createdAt: now(),
     ...
   }
   setQueryData(['messages', channelId], old => [message, ...old])
  ↓
   ✓ Message appears instantly in ChatWindow
  ↓
2. Send to API:
   POST /api/messages
   { channelId, content }
  ↓
3. Server:
   1. Verify user has SEND_MESSAGES
   2. INSERT message
   3. Return message with server ID
  ↓
4. Client:
   1. Replace optimistic message with server version
   2. Update cache
  ↓
5. Real-time:
   1. Supabase broadcasts on `chat:channelId`
   2. All other users receive { type: 'message:created', data: {...} }
   3. They invalidate query → refetch
   4. Message appears on their screens
```

### 3. Edit (User edits message)

```
User clicks "Edit" → EditModal
  ↓
useMessages.updateMessage(messageId, newContent)
  ↓
1. Optimistic update:
   setQueryData(['messages', channelId], old => [
     {
       ...message,
       content: newContent,
       editedAt: now()
     },
     ...rest
   ])
  ↓
2. Send to API:
   PATCH /api/messages/:id
   { content: newContent }
  ↓
3. Server:
   1. Verify author or MANAGE_MESSAGES
   2. UPDATE message, editedAt
   3. Record in message_edits (audit trail)
   4. Return updated message
  ↓
4. Real-time:
   Supabase broadcasts `message:updated`
   Other users refetch messages
```

---

## Caching Strategy

### React Query Configuration

```javascript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 10 * 60 * 1000,          // 10 minutes
      refetchOnWindowFocus: false,      // Don't refetch on blur/focus
      retry: 1,                         // Retry failed requests once
      networkMode: 'always',            // Retry even in offline mode
    },
  },
});
```

### Cache Invalidation

When user performs action, invalidate relevant queries:

```javascript
// After creating server
queryClient.invalidateQueries(['servers'])

// After sending message
// (Don't invalidate, just optimistic update + refetch on real-time event)

// After editing channel name
queryClient.invalidateQueries(['server-view', serverId])
```

---

## Voice Architecture

### Voice Channel Join Flow

```
User clicks "Join Voice Channel"
  ↓
useVoiceChannel.join(channelId)
  ↓
1. POST /api/voice/join?channelId=X
  ↓
2. Server:
   1. Verify user has CONNECT permission
   2. Generate LiveKit token (JWT)
   3. Return { token, url, roomName }
  ↓
3. Client:
   1. Connect to LiveKit with token
   2. Join room: roomName = "room-{channelId}"
   3. Start audio/video stream
  ↓
4. Real-time:
   Supabase broadcasts on `voice:channelId`
   Other users see "User joined"
  ↓
5. Voice participants list updates
   useParticipants(channelId) reads from
   - LiveKit participants list
   - Voice presence store (mute/deafen state)
```

---

## WebSocket Gateway (Optional)

The WebSocket Gateway is **optional** and not used for chat (which uses Supabase Realtime).

**When to use it:**
- Custom real-time protocol needed
- WebRTC signaling for voice
- Complex pub/sub topology

**Current status:**
- `/services/websocket-gateway` exists
- Not required for MVP
- Can be kept or removed depending on needs

---

## Deployment Topology

### Local Development

```
localhost:3000 (Next.js dev server)
localhost:4000 (Express API)
localhost:8080 (WebSocket Gateway, optional)
Docker: PostgreSQL, Redis
```

### Production

```
Vercel
  ↓
  NEXT_PUBLIC_API_URL
  ↓
Cloud Run (Express API)
  ↓
  PostgreSQL (Cloud SQL or managed)
  Redis (Cloud Memorystore or managed)
  ↓
Supabase Realtime (managed)
LiveKit (managed or self-hosted)
Cloudinary (managed)
```

---

## Key Decisions & Trade-offs

### 1. Supabase Realtime vs Custom WebSocket

**Chosen:** Supabase Realtime

**Pros:**
- PostgreSQL changes → real-time automatically
- Built-in auth with JWT
- No separate infrastructure
- Scales naturally

**Cons:**
- Vendor lock-in (but can migrate to PostgreSQL replication)
- Slight latency (milliseconds)

---

### 2. Bitfield Permissions vs Table Permissions

**Chosen:** Bitfield (32-bit integers)

**Pros:**
- O(1) permission checks (bitwise AND)
- Compact storage
- No complex joins

**Cons:**
- Limited to 30 permissions
- Harder to understand (requires documentation)
- Database migrations needed to add new permissions

---

### 3. Zustand for UI State vs TanStack Query

**Chosen:** Split - Zustand (UI), React Query (server)

**Pros:**
- Clean separation of concerns
- React Query handles caching, deduplication, refetch
- Zustand is lightweight for UI-only state

**Cons:**
- Two state management libraries
- Need to keep them in sync manually

---

### 4. Cursor-based Pagination vs Offset

**Chosen:** Cursor-based

**Pros:**
- Works with deletions (message deleted doesn't break pagination)
- Better for real-time updates
- Scales to millions of messages

**Cons:**
- Can't jump to page 5 directly
- Slightly more complex

---

## Testing Strategy

```
Unit Tests (Jest):
  • Permission calculations
  • Message normalization
  • Auth token validation

Integration Tests:
  • API endpoints with test DB
  • Permission checks end-to-end
  • Real-time sync

E2E Tests (Playwright):
  • User journey: register → send message → voice
  • UI interactions
  • Real-time notifications
```

---

## Performance Considerations

### Message Virtualization

Messages are virtualized with `react-virtuoso`:
- Only renders visible messages
- Scrolls smoothly even with 10,000+ messages
- Handles dynamic heights

### Local Caching with IndexedDB

Messages are cached locally:
- Offline support
- Faster load on revisit
- Less API calls

### Cloudinary for Media

Images are optimized by Cloudinary:
- Automatic resizing
- Format conversion (WebP for browsers that support it)
- CDN distribution

---

## Security Measures

```
Frontend:
  ✓ JWT stored in secure HTTP-only cookies
  ✓ CSRF protection with SameSite cookies
  ✓ XSS prevention with React's built-in escaping
  ✓ CSP headers configured

API:
  ✓ JWT validation on every request
  ✓ Permission checks (bitfield)
  ✓ Rate limiting (5-60 req/min depending on endpoint)
  ✓ Input validation (Zod schemas)
  ✓ SQL injection protection (parameterized queries)
  ✓ Helmet.js for security headers
  ✓ CORS configured
  ✓ Password hashing (bcrypt)

Database:
  ✓ Foreign keys enforce referential integrity
  ✓ Unique indexes prevent duplicates
  ✓ Audit logs track actions
```

---

For deployment details, see [DEPLOY.md](../DEPLOY.md)

For API documentation, see [API.md](./API.md)

For getting started, see [GETTING_STARTED.md](./GETTING_STARTED.md)
