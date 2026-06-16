# Troubleshooting Guide

Common issues and solutions.

---

## Setup & Installation

### "npm install" hangs or fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Try again with verbose output
npm install -v

# If still failing, try npm ci (clean install)
rm package-lock.json
npm ci
```

### "Cannot find module" errors

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild modules
npm rebuild
```

### Node.js version mismatch

**Solution:**
```bash
# Check version
node --version

# Should be 18+
# If not, install from https://nodejs.org/

# Using nvm (recommended):
nvm install 18
nvm use 18
```

---

## Database Issues

### "Cannot connect to database"

**Check PostgreSQL is running:**
```bash
psql -U postgres -h localhost -c "SELECT 1"
```

**If not running:**
```bash
# macOS (Homebrew)
brew services start postgresql

# Ubuntu/Debian
sudo systemctl start postgresql

# Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

**Check DATABASE_URL:**
```bash
# Test connection string
psql $DATABASE_URL -c "SELECT 1"

# Should return: SELECT 1 (success)
# If error, check:
# - Host/port correct
# - Password correct
# - Database exists
# - Firewall allows connection
```

### "Relation 'users' does not exist"

**Solution - run migrations:**
```bash
npm run db:migrate-all
```

This creates all required tables.

### "Permission denied for schema public"

**Solution:**
```bash
# Check user permissions
psql -U postgres $DATABASE_URL -c "GRANT ALL ON SCHEMA public TO your_user;"

# Or recreate database
psql -U postgres -c "DROP DATABASE collab; CREATE DATABASE collab;"
npm run db:migrate-all
```

### Database is corrupted

**Solution - reset (development only):**
```bash
# Drop and recreate
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Rerun migrations
npm run db:migrate-all

# Recreate test data
npm run whitelist:add
```

### "Too many connections"

**Solution:**
```bash
# Increase connection limit in .env
DATABASE_CONNECTION_LIMIT=20

# Or kill idle connections
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle' AND query_start < now() - interval '1 hour';
"
```

---

## Redis Issues

### "Cannot connect to Redis"

**Check Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

**If not running:**
```bash
# macOS
brew services start redis

# Ubuntu
sudo systemctl start redis-server

# Docker
docker run --name redis -p 6379:6379 -d redis:7-alpine
```

**Check REDIS_URL:**
```bash
redis-cli -u $REDIS_URL ping
```

### "Redis connection timeout"

**Solution:**
```bash
# Check firewall
telnet localhost 6379

# If blocked, open port or use localhost
REDIS_URL=redis://localhost:6379

# Increase timeout
REDIS_TIMEOUT=5000
```

---

## Frontend Issues

### Frontend shows "Cannot reach API"

**Check API is running:**
```bash
curl http://localhost:4000/api/servers
# Should return: {"error":"Unauthorized"} (not connection error)
```

**If not reachable:**
```bash
# Start API
npm run dev:api

# Check NEXT_PUBLIC_API_URL in .env
echo $NEXT_PUBLIC_API_URL
# Should be: http://localhost:4000
```

**If running but still can't connect:**
```bash
# Hard refresh frontend (Ctrl+Shift+R or Cmd+Shift+R)
# Or clear browser cache

# Check CORS headers
curl -i http://localhost:4000/api/servers

# Should include: Access-Control-Allow-Origin: *
```

### "Unauthorized" on all requests

**Solution:**
```bash
# Clear localStorage (remove JWT)
localStorage.clear()

# Login again
# Go to http://localhost:3000/login

# Check JWT_SECRET in API .env
# Same secret used to sign and verify tokens
```

### Page doesn't load - blank screen

**Check browser console (F12):**
```
Look for errors under "Console" tab
Common errors:
- "Cannot read properties of undefined" → missing state
- "Module not found" → missing dependency
- "Network error" → API not responding
```

**Solution:**
```bash
# Rebuild frontend
npm run build

# Or clear Next.js cache
rm -rf .next
npm run dev
```

### Styling looks broken - Tailwind not working

**Solution:**
```bash
# Rebuild Tailwind
npx tailwindcss -i input.css -o output.css

# Or restart dev server
npm run dev

# Check tailwind.config.ts has correct content paths
```

---

## Authentication Issues

### "Invalid credentials" on login

**Solution:**
```bash
# Check user exists in database
psql $DATABASE_URL -c "SELECT id, email FROM users WHERE email='test@example.com';"

# If not found, register first
# Go to http://localhost:3000/register

# Check password is correct
# Passwords are bcrypt hashed, not plain text
```

### "Email is not whitelisted"

**Solution:**
```bash
# Add email to whitelist
npm run whitelist:add
# Prompts for email

# Or manually
psql $DATABASE_URL -c "INSERT INTO email_whitelist (email) VALUES ('test@example.com');"
```

### "Invalid or already used developer code"

**Solution:**
```bash
# Generate new code
npm run whitelist:add
# Shows new codes

# Or manually
psql $DATABASE_URL -c "INSERT INTO developer_codes (code, used) VALUES ('new-code-123', false);"

# Check code is not used
psql $DATABASE_URL -c "SELECT * FROM developer_codes WHERE code='test-code';"
# Should have: used = false
```

### "Refresh token expired"

**Solution:**
```bash
# Logout and login again
# Go to http://localhost:3000/logout
# Then http://localhost:3000/login
```

---

## API Issues

### 403 Forbidden on message endpoints

**Cause:** User lacks VIEW_CHANNEL or READ_MESSAGE_HISTORY permission

**Solution:**
```bash
# Check user has @everyone role
psql $DATABASE_URL -c "
  SELECT r.name, ur.user_id
  FROM roles r
  JOIN user_roles ur ON ur.role_id = r.id
  WHERE r.name = '@everyone' AND ur.user_id = 'YOUR_USER_ID';
"

# If not found, run migration:
psql $DATABASE_URL -f migrations/006_backfill_everyone_role.sql
```

### 404 Not Found

**Solution:**
```bash
# Check resource exists
psql $DATABASE_URL -c "SELECT * FROM channels WHERE id='channel-id';"

# Check URL path is correct
# Should be: /api/channels/id (not /api/channels/:id)

# Check you have permission to view it (RBAC)
```

### 429 Too Many Requests (Rate Limited)

**Solution:**
```bash
# Wait before retrying
# Rate limit resets after 1 minute

# Or disable rate limiting in development
# services/api/src/infra.ts -> rateLimit(...) config

# For production, adjust rate limits
RATE_LIMIT_WINDOW=60000  # milliseconds
RATE_LIMIT_MAX=60         # max requests per window
```

### 500 Internal Server Error

**Check API logs:**
```bash
# If running locally
npm run dev:api
# Look for errors in terminal output

# Check database is running
psql $DATABASE_URL -c "SELECT 1"

# Check Redis is running
redis-cli ping

# Check env variables are set
echo $DATABASE_URL $REDIS_URL $JWT_SECRET
```

---

## Voice Issues

### "No audio" in voice channel

**Check LiveKit is configured:**
```bash
# Check env variables
echo $NEXT_PUBLIC_LIVEKIT_URL
echo $LIVEKIT_URL
echo $LIVEKIT_API_KEY
echo $LIVEKIT_API_SECRET

# All should be set and non-empty
```

**Test LiveKit connection:**
```bash
# Visit https://app.livekit.io
# Enter your LiveKit URL and credentials
# Try joining a room
```

**Check browser permissions:**
```
Open browser console (F12)
Look for microphone permission prompts
Allow microphone access
```

### "Failed to get LiveKit token"

**Solution:**
```bash
# Check API is returning token
curl -X POST http://localhost:4000/api/voice/join \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channelId":"channel-id"}'

# Should return: {"token":"...","url":"...","roomName":"..."}

# If error, check:
# - User has CONNECT permission on channel
# - LIVEKIT_API_KEY and LIVEKIT_API_SECRET are correct
```

### "WebRTC connection failed"

**Solution:**
```bash
# Check network/firewall allows WebRTC
# TURN servers needed for some networks

# Set in LiveKit dashboard:
# Admin → Rooms → Advanced → TURN servers

# Or in frontend env:
NEXT_PUBLIC_TURN_SERVERS=stun:stun1.l.google.com:19302
```

---

## Media Upload Issues

### "Failed to upload image"

**Check Cloudinary is configured:**
```bash
echo $CLOUDINARY_API_KEY
echo $CLOUDINARY_API_SECRET
echo $NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

# All should be set
```

**Test upload:**
```bash
curl -F "file=@image.png" \
  -F "cloud_name=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME" \
  -F "upload_preset=preset" \
  "https://api.cloudinary.com/v1_1/$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/image/upload"

# Should return: {"url":"https://res.cloudinary.com/..."}
```

### "File size too large"

**Solution:**
```bash
# Max file size is 25MB
# Compress before uploading
# Or increase limit in services/api/src/routes/media.ts

# For images, use compression tools:
# ImageOptim (macOS)
# TinyPNG (online)
# ffmpeg (video)
```

### "Unsupported file type"

**Check supported types:**
- Images: PNG, JPG, JPEG, WebP, GIF
- Videos: MP4, WebM, MOV
- Documents: PDF, DOCX, XLSX, PPTX, TXT

**To add more types:**
Edit `services/api/src/routes/media.ts`:
```typescript
const ALLOWED_TYPES = ['image/png', 'image/jpeg', ...];
```

---

## Real-time/Broadcast Issues

### "Messages not appearing in real-time"

**Check broadcast channel is connected:**
```bash
# Open browser DevTools → Network → WS (WebSocket tab)
# Should see connection to Supabase Realtime

# If not connected:
# 1. Check NEXT_PUBLIC_SUPABASE_ANON_KEY in .env
# 2. Check Supabase project is configured
# 3. Refresh page (Ctrl+R)
```

### "Slow message sync between users"

**Solution:**
```bash
# Reduce poll interval
# Change REACT_QUERY_CONFIG.refetchInterval
# from 5000ms to 1000ms

# Or optimize database query
# Add index to messages table by channel_id
```

---

## Performance Issues

### Page loads slowly

**Check what's slow:**
```bash
# Open DevTools → Performance tab → Record → Reload
# Look for long tasks

# Common causes:
# 1. Too many messages rendered
#    → Use virtual scrolling (already implemented)
# 2. Large image files
#    → Optimize with Cloudinary
# 3. Missing database indexes
#    → Run: npm run db:fix-indexes
```

### API requests are slow

**Solution:**
```bash
# Check database query performance
# Add EXPLAIN ANALYZE to queries

# Or profile with
# services/api/src/routes/messages.ts
// console.time('fetchMessages');
// ... code ...
// console.timeEnd('fetchMessages');

# Common issues:
# 1. N+1 queries → use JOIN
# 2. Missing indexes → add indexes
# 3. Too much data → add pagination/filtering
```

---

## Docker Issues

### "Cannot start docker compose"

**Solution:**
```bash
# Check Docker is running
docker ps

# If not, start Docker Desktop (macOS/Windows)
# Or: sudo systemctl start docker (Linux)

# Check permissions
sudo usermod -aG docker $USER

# Clean up
docker compose down -v
npm run docker:up

# View logs
docker compose logs -f
```

### "Port already in use"

**Solution:**
```bash
# Find process using port
lsof -i :3000      # Frontend
lsof -i :4000      # API
lsof -i :5432      # PostgreSQL
lsof -i :6379      # Redis

# Kill process
kill -9 <PID>

# Or use different port
PORT=3002 npm run dev
```

---

## Git/GitHub Issues

### "Merge conflicts"

**Solution:**
```bash
# Rebase on latest main
git fetch origin
git rebase origin/main

# Or merge and resolve manually
git merge origin/main
# Fix conflicts in editor
git add .
git commit -m "Resolve conflicts"
```

### "Cannot push to GitHub"

**Solution:**
```bash
# Check credentials
git config user.name
git config user.email

# Generate SSH key
ssh-keygen -t ed25519 -C "your@email.com"

# Add to GitHub Settings → SSH and GPG keys

# Or use HTTPS token
# GitHub → Settings → Developer settings → Personal access tokens
git remote set-url origin https://token@github.com/USERNAME/collab.git
```

---

## Miscellaneous

### Getting help

**Where to ask:**
- **Documentation**: [docs/](./docs)
- **GitHub Issues**: [Report bugs](https://github.com/lapinex/collab/issues)
- **Discussions**: [Ask questions](https://github.com/lapinex/collab/discussions)
- **Code examples**: [examples/](./examples)

### Enable debug logging

```bash
# Frontend
DEBUG=collab:* npm run dev

# API
DEBUG=collab:* npm run dev:api

# Or set in .env
DEBUG=collab:*
```

### Create diagnostic report

```bash
# Capture system info for bug reports
npm run db:diagnose > diagnostic-report.txt

# Include in GitHub issue
```

### Reset everything

```bash
# Nuclear option (development only)
rm -rf node_modules .next
npm install
npm run db:migrate-all
npm run dev
```

---

**Still stuck?** Open an issue: [GitHub Issues](https://github.com/lapinex/collab/issues)
