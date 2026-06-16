# Collab - Private Messenger

**A production-ready real-time messaging platform** for teams and communities (up to 1000 users).

- 💬 **Real-time chat** with reactions and rich media
- 🎤 **Voice channels** powered by LiveKit
- 🔐 **Permission system** with granular role-based access control (RBAC)
- 📁 **Media management** (images, files) via Cloudinary
- 🎨 **Dark/Light themes** + community features
- 🚀 **Deploy anywhere**: Vercel (frontend) + Cloud Run/Railway/VPS (backend)

---

## 🚀 Quick Start

### Local Development (5 minutes)

```bash
# Clone & setup
git clone https://github.com/lapinex/collab.git
cd collab
cp .env.example .env
npm install

# Start services (3 terminals)
npm run dev              # Frontend (http://localhost:3000)
npm run dev:api          # API (http://localhost:4000)
npm run dev:ws           # WebSocket [optional] (http://localhost:8080)

# First time: setup database
npm run db:migrate-all

# Create test user (after API is running)
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@collab.app",
    "password": "Test123!",
    "developerCode": "dev-code-123",
    "name": "Test User"
  }'
```

### With Docker (production-like, 1 command)

```bash
cp .env.example .env
npm run docker:up:prod
# Frontend: http://localhost:3000
# API: http://localhost:4000
# PostgreSQL & Redis included
```

### Using devenv (Nix + Flake)

```bash
devenv shell
npm install
npm run db:migrate-all
npm run dev
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, TypeScript, TanStack Query v5, Tailwind CSS, LiveKit Client |
| **Backend API** | Express.js, PostgreSQL (Drizzle ORM), Redis, JWT Auth |
| **Real-time** | Supabase Realtime (broadcast), Redis pub/sub |
| **Voice** | LiveKit (signaling + RTC) |
| **Storage** | Cloudinary (CDN + optimization) |
| **State** | Zustand (UI), TanStack Query (server state) |
| **Deployment** | Vercel (frontend), Cloud Run/Railway/Render (API) |

---

## 📁 Project Structure

```
collab/
├── app/                        # Next.js App Router
│   ├── (authenticated)/        # Protected routes (server components)
│   ├── login/, register/       # Auth pages
│   └── layout.tsx, providers.tsx
│
├── components/                 # React components
│   ├── chat/                  # ChatWindow, MessageList, MessageInput
│   ├── voice/                 # VoiceChannel, Participants
│   ├── server/                # ServerList, SettingsModal
│   └── ui/                    # Headless UI components
│
├── lib/                        # Business logic
│   ├── api-client.ts          # HTTP fetch helper
│   ├── auth/                  # JWT auth
│   ├── permissions/           # RBAC calculations
│   ├── realtime/              # Supabase Realtime
│   ├── livekit/               # LiveKit client
│   ├── messages/              # Message normalization
│   └── server/
│       └── db/
│           └── schema.ts      # Drizzle ORM schema (25+ tables)
│
├── hooks/                      # Custom hooks
│   ├── useMessages.ts         # Message CRUD + realtime
│   ├── useDMs.ts              # Direct messages
│   ├── useServerViewQuery.ts  # Server + members + roles
│   └── useBroadcastChannel.ts # Supabase realtime
│
├── stores/                     # Zustand (UI state only)
│   ├── auth-store.ts          # Current user
│   ├── navigation-store.ts    # Selected channel/server
│   └── voice-presence-store.ts # Mute/deafen state
│
├── services/                   # npm workspaces
│   ├── api/                   # Express API server
│   │   ├── src/routes/        # /auth, /messages, /dms, /voice
│   │   └── src/infra.ts       # Middleware, DB connections
│   │
│   └── websocket-gateway/     # Optional WebSocket server
│
├── drizzle/                    # Database migrations (0001-0008+)
├── scripts/                    # Utility scripts
├── types/                      # TypeScript types
├── tests/                      # Jest + Playwright tests
├── docs/                       # Architecture guides
└── package.json
```

---

## 📊 Database

**25+ PostgreSQL tables** via Drizzle ORM:

- `users`, `sessions`, `developer_codes`, `email_whitelist`
- `servers`, `channels`, `roles`, `user_roles`, `channel_permissions`
- `messages`, `message_edits`, `reactions`
- `dm_channels`, `voice_sessions`
- `friends`, `friend_requests`, `user_blocks`, `user_settings`, `presence`
- `media_files`, `server_emojis`, `server_stickers`, `webhooks`
- `notifications`, `audit_logs`, `server_invitations`, `banned_members`

---

## 📚 Documentation

- **[GETTING_STARTED.md](./docs/GETTING_STARTED.md)** - Installation & first steps
- **[API.md](./docs/API.md)** - Full API reference
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Design decisions
- **[DEPLOY.md](./DEPLOY.md)** - Deployment guide
- **[ENV.md](./ENV.md)** - Environment variables
- **[CONTRIBUTING.md](./docs/CONTRIBUTING.md)** - Development workflow
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history

---

## 🔧 Development

```bash
# Frontend
npm run dev              # Dev server
npm run build           # Production build
npm run lint            # TypeScript + ESLint check

# API
npm run dev:api         # Dev server
npm run build:api       # Build

# Database
npm run db:migrate-all  # Run migrations
npm run db:studio       # Drizzle Studio GUI

# Testing
npm test                # Unit tests
npm run test:e2e        # End-to-end tests

# Docker
npm run docker:up       # Start dev environment
npm run docker:up:prod  # Production-like setup
```

---

## 🚀 Deployment

### Frontend (Vercel)
Automatic deploys from GitHub. Set env vars:
- `NEXT_PUBLIC_API_URL` - Your API URL
- `NEXT_PUBLIC_WS_URL` - Optional WebSocket URL
- `NEXT_PUBLIC_LIVEKIT_URL` - LiveKit URL

### Backend (Cloud Run / Railway / Render / VPS)
1. Deploy `services/api`
2. Setup PostgreSQL + Redis
3. Set `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`

See [DEPLOY.md](./DEPLOY.md) for detailed instructions.

---

## 🛠️ Troubleshooting

**API returns 403 on messages?**
→ Run `006_backfill_everyone_role.sql` to ensure members have `@everyone` role

**Voice channels don't work?**
→ Check `NEXT_PUBLIC_LIVEKIT_URL` is set and accessible

**"Invalid credentials" on login?**
→ User email must be in `email_whitelist` table

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more.

---

## 📄 License

Released under the [MIT License](./LICENSE) — © 2026 lapinex.

---

**Made with ❤️ by lapinex**
