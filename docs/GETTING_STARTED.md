# Getting Started with Collab

This guide will get you up and running in 5 minutes.

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- PostgreSQL 14+ ([download](https://www.postgresql.org/download/))
- Redis ([download](https://redis.io/download/))
- Git

Or use Docker for PostgreSQL + Redis (recommended for first-time setup).

---

## Option 1: Local Development (Recommended)

### 1. Clone and Install

```bash
git clone https://github.com/lapinex/collab.git
cd collab
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/collab

# Redis
REDIS_URL=redis://localhost:6379

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-key-min-32-chars

# Frontend URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000

# LiveKit (optional for voice)
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_URL=https://livekit.example.com
LIVEKIT_API_KEY=key
LIVEKIT_API_SECRET=secret
```

### 3. Start Services (3 Terminals)

**Terminal 1: Frontend**
```bash
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2: API**
```bash
npm run dev:api
# Runs on http://localhost:4000
```

**Terminal 3: WebSocket Gateway** (optional, chat works without it)
```bash
npm run dev:ws
# Runs on http://localhost:8080
```

### 4. Initialize Database

In a 4th terminal:

```bash
npm run db:migrate-all
```

This creates all 25+ tables in PostgreSQL.

### 5. Create First User

The app uses **whitelist** + **developer codes** for registration.

**Add to whitelist:**
```bash
npm run whitelist:add
# Prompts for email to whitelist
```

**Generate developer code:**
```bash
npm run whitelist:add  # Also generates codes
# Or manually: INSERT INTO developer_codes (code) VALUES ('dev-code-123');
```

**Register:**
1. Visit http://localhost:3000/register
2. Enter:
   - Email: `test@example.com` (whitelisted)
   - Developer Code: `dev-code-123`
   - Password: Any password
   - Name: Your name
3. Click Register

**Login:**
1. Visit http://localhost:3000/login
2. Enter email and password

Done! 🎉

---

## Option 2: Docker (Production-like)

### 1. Setup Environment

```bash
cp .env.example .env
```

### 2. Start Everything

```bash
npm run docker:up:prod
```

This starts:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- PostgreSQL
- Redis

### 3. Initialize Database

```bash
npm run db:migrate-all
```

### 4. Add Whitelist & Create User

Same as Option 1, steps 5.

---

## Option 3: devenv (Nix + Flake)

### 1. Install devenv

```bash
curl -fsSL https://get.jetify.com/devenv | bash
```

### 2. Setup

```bash
devenv shell
npm install
npm run db:migrate-all
```

### 3. Start Services

```bash
npm run dev
npm run dev:api
npm run dev:ws
```

---

## Common Issues

### "Cannot connect to database"

Check PostgreSQL is running:
```bash
psql -U postgres -h localhost -c "SELECT 1"
```

If not running, start it:
```bash
# macOS (Homebrew)
brew services start postgresql

# Ubuntu (apt)
sudo systemctl start postgresql

# Or use Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

### "Cannot connect to Redis"

Check Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

If not running:
```bash
# macOS
brew services start redis

# Ubuntu
sudo systemctl start redis-server

# Or use Docker
docker run --name redis -p 6379:6379 -d redis
```

### "Invalid or already used developer code"

Generate a new code:
```bash
psql $DATABASE_URL -c "INSERT INTO developer_codes (code) VALUES ('new-dev-code-123');"
```

### "Email is not whitelisted"

Add email to whitelist:
```bash
npm run whitelist:add
# Or manually:
psql $DATABASE_URL -c "INSERT INTO email_whitelist (email) VALUES ('test@example.com');"
```

### Frontend shows "Cannot reach API"

Check:
1. API is running: `npm run dev:api`
2. `NEXT_PUBLIC_API_URL` in `.env` is correct
3. Refresh frontend (Ctrl+R or Cmd+R)

---

## Next Steps

### Explore the App

1. **Create a server**: Click "+" in left sidebar
2. **Add members**: Copy invite link to add others
3. **Join voice**: Click voice channel (if LiveKit configured)
4. **Send messages**: Type in chat and press Enter

### Modify Code

Key files to explore:
- **Frontend**: `app/`, `components/`, `hooks/`
- **API**: `services/api/src/routes/`
- **Database**: `lib/server/db/schema.ts`
- **Styles**: `tailwind.config.ts`, `styles/globals.css`

### Run Tests

```bash
npm test                # Unit tests
npm run test:e2e        # End-to-end tests
npm run lint            # TypeScript + ESLint check
```

### Enable Voice (LiveKit)

1. Sign up at [livekit.io](https://cloud.livekit.io)
2. Create a project and get credentials
3. Set in `.env`:
   ```env
   NEXT_PUBLIC_LIVEKIT_URL=wss://your-room.livekit.cloud
   LIVEKIT_URL=https://your-room.livekit.cloud
   LIVEKIT_API_KEY=your-key
   LIVEKIT_API_SECRET=your-secret
   ```
4. Restart API: `npm run dev:api`
5. Test: Join a voice channel

### Enable Media Upload (Cloudinary)

1. Sign up at [cloudinary.com](https://cloudinary.com/)
2. Get API credentials
3. Set in `.env`:
   ```env
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
   CLOUDINARY_API_KEY=your-key
   CLOUDINARY_API_SECRET=your-secret
   ```
4. Restart API: `npm run dev:api`
5. Test: Upload an image in chat

---

## Database Management

### View Database

```bash
# Open Drizzle Studio GUI
npm run db:studio

# Or use psql
psql $DATABASE_URL
```

### Run Migrations

```bash
# Run all pending migrations
npm run db:migrate-all

# Generate new migration from schema changes
npm run db:generate

# Check database status
npm run db:diagnose
```

### Reset Database (Development Only)

```bash
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:migrate-all
```

---

## Debug Mode

Enable verbose logging:

```bash
DEBUG=collab:* npm run dev
DEBUG=collab:* npm run dev:api
```

Or in `.env`:
```env
DEBUG=collab:*
NODE_ENV=development
```

---

## Next: Deployment

Ready to deploy? See [DEPLOY.md](../DEPLOY.md)

## Questions?

- **Issues**: [GitHub Issues](https://github.com/lapinex/collab/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lapinex/collab/discussions)
- **Docs**: [Full Documentation](.)
