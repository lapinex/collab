# Deployment Guide

This guide covers deploying Collab to production: frontend on Vercel, backend on Cloud Run/Railway/VPS.

---

## Architecture

```
┌─────────────────────┐
│ Vercel (Frontend)   │
│ Next.js 15          │
└──────────┬──────────┘
           │
           │ NEXT_PUBLIC_API_URL
           │ NEXT_PUBLIC_WS_URL
           ↓
┌─────────────────────────────┐
│ Cloud Run / Railway (API)   │
│ Express.js (services/api)   │
└──────────┬──────────────────┘
           │
           ├─→ PostgreSQL (Cloud SQL)
           ├─→ Redis (Memorystore)
           └─→ Cloudinary (CDN)

┌────────────────────────────────────┐
│ WebSocket Gateway (Optional)       │
│ Cloud Run / VPS (services/ws)      │
│ Only needed if you need custom WS  │
└────────────────────────────────────┘

┌────────────────────────────────┐
│ Supabase (Real-time, managed)  │
│ Real-time broadcast + auth      │
└────────────────────────────────┘

┌────────────────────────────────┐
│ LiveKit (Voice, managed)        │
│ WebRTC signaling + routing      │
└────────────────────────────────┘
```

---

## Step 1: Frontend (Vercel)

### Clone and Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"** → **Import Git Repository**
3. Select GitHub, authorize, choose `collab` repo
4. Vercel auto-detects Next.js 15
5. Click **Deploy**

### Set Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:

```env
NEXT_PUBLIC_APP_URL=https://your-collab.vercel.app
NEXT_PUBLIC_API_URL=https://your-api.run.app      # (set after API deploy)
NEXT_PUBLIC_WS_URL=wss://your-ws.run.app          # (optional, set after WS deploy)
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit.app    # (required for voice)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud      # (required for media)
```

### Redeploy

After setting env vars, trigger a redeploy:
- Go to **Deployments** → Click **Redeploy** on latest build

Done! Frontend is now live at `https://your-collab.vercel.app`

---

## Step 2: Backend Setup

Before deploying API, you need:
- PostgreSQL database
- Redis instance
- JWT_SECRET and JWT_REFRESH_SECRET (32+ random characters, different values)
- Environment variables

### Option A: Using Managed Services (Recommended)

**PostgreSQL + Redis on Cloud SQL / Memorystore (GCP):**

```bash
# PostgreSQL
gcloud sql instances create collab-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Redis
gcloud redis instances create collab-redis \
  --size=1 \
  --region=us-central1 \
  --tier=basic
```

**Or use managed services from:**
- Railway: PostgreSQL + Redis in one click
- Supabase: PostgreSQL + real-time managed
- Render: PostgreSQL + Redis add-ons
- AWS RDS + ElastiCache
- DigitalOcean: Managed Databases

### Option B: Docker Compose (Local/VPS)

For VPS or local development:

```bash
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=secure_password \
  -p 5432:5432 \
  postgres:15-alpine

docker run -d --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

### Create Database

```bash
psql $DATABASE_URL -c "CREATE DATABASE collab;"
```

---

## Step 3: API Deployment

### Option A: Google Cloud Run (Recommended if using GCP)

**1. Build and push image**

```bash
gcloud builds submit --config=cloudbuild-api.yaml \
  --substitutions=_IMAGE=gcr.io/YOUR_PROJECT_ID/collab-api:latest .
```

**2. Deploy to Cloud Run**

```bash
gcloud run deploy collab-api \
  --image=gcr.io/YOUR_PROJECT_ID/collab-api:latest \
  --platform=managed \
  --region=us-central1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL,\
REDIS_URL=$REDIS_URL,\
JWT_SECRET=$JWT_SECRET,\
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET,\
JWT_ISSUER=collab,\
JWT_AUDIENCE=collab-app,\
CORS_ORIGIN=https://your-collab.vercel.app,\
LIVEKIT_URL=$LIVEKIT_URL,\
LIVEKIT_API_KEY=$LIVEKIT_API_KEY,\
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET,\
CLOUDINARY_API_KEY=$CLOUDINARY_API_KEY,\
CLOUDINARY_API_SECRET=$CLOUDINARY_API_SECRET,\
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$CLOUDINARY_CLOUD_NAME" \
  --allow-unauthenticated \
  --memory=1Gi \
  --timeout=300
```

**3. Get API URL**

```bash
gcloud run services describe collab-api --region=us-central1 --format='value(status.url)'
# Returns: https://collab-api-xxxxx.run.app
```

### Option B: Railway

**1. Create project**
- Go to [railway.app](https://railway.app)
- Click **"Create New"** → **Project from GitHub Repo**
- Select `collab`
- Click **Deploy**

**2. Configure root directory**
- Project Settings → Root Directory: `services/api`

**3. Add PostgreSQL service**
- Click **"Create New"** → **Database** → **PostgreSQL**

**4. Add Redis service**
- Click **"Create New"** → **Database** → **Redis**

**5. Set environment variables**
- Click project → **Variables**
- Add:
  ```env
  DATABASE_URL=$(DATABASE_PUBLIC_URL)
  REDIS_URL=redis://...:...@...:...
  JWT_SECRET=your-secret-key
  JWT_REFRESH_SECRET=your-refresh-secret-key
  CORS_ORIGIN=https://your-collab.vercel.app
  # (other vars...)
  ```

**6. Deploy**
- Click **Deploy** button

**7. Get API URL**
- Project Settings → Domains → copy URL

### Option C: Render

**1. Create web service**
- Go to [render.com](https://render.com)
- Click **"New"** → **Web Service**
- Connect GitHub repo
- Fill in:
  - **Name**: `collab-api`
  - **Root Directory**: `services/api`
  - **Build Command**: `npm install && npm run build`
  - **Start Command**: `npm start`

**2. Add PostgreSQL**
- Click **"New"** → **PostgreSQL**
- Name: `collab-db`
- Note connection string

**3. Add Redis**
- Click **"New"** → **Redis**
- Name: `collab-redis`
- Note connection string

**4. Set env vars**
- Web Service → **Environment**
- Add all vars from `.env.example`

**5. Deploy**
- Click **Deploy**

### Option D: VPS (Self-Hosted)

**1. SSH into VPS**

```bash
ssh root@your-vps-ip
```

**2. Install Node.js, PostgreSQL, Redis**

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql redis-server

# Start services
sudo systemctl start postgresql
sudo systemctl start redis-server
```

**3. Clone repository**

```bash
git clone https://github.com/lapinex/collab.git
cd collab/services/api
npm install
npm run build
```

**4. Create .env file**

```bash
cat > .env << EOF
DATABASE_URL=postgresql://user:pass@localhost:5432/collab
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
# (other vars...)
EOF
```

**5. Run migrations**

```bash
npm run db:migrate-all
```

**6. Start service with PM2**

```bash
npm install -g pm2
pm2 start npm --name "collab-api" -- start
pm2 startup
pm2 save
```

**7. Setup reverse proxy (Nginx)**

```bash
sudo apt-get install -y nginx

sudo tee /etc/nginx/sites-available/collab-api << EOF
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo systemctl start nginx
```

**8. Get API URL**
```
https://api.your-domain.com
```

---

## Step 4: Run Migrations

After API is deployed and connected to PostgreSQL:

```bash
npm run db:migrate-all
```

This creates all 25+ tables and indexes.

---

## Step 5: Setup LiveKit (Required for Voice)

1. Go to [livekit.io/cloud](https://cloud.livekit.io)
2. Sign up and create a project
3. Get credentials:
   - API URL: `wss://your-livekit-project.livekit.cloud`
   - API Key: `API...`
   - API Secret: `...`

4. Set in API environment:
   ```env
   LIVEKIT_URL=https://your-livekit-project.livekit.cloud
   LIVEKIT_API_KEY=API...
   LIVEKIT_API_SECRET=...
   ```

5. Set in Vercel environment:
   ```env
   NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
   ```

6. Redeploy both API and frontend

---

## Step 6: Setup Cloudinary (Required for Media Upload)

1. Go to [cloudinary.com](https://cloudinary.com)
2. Sign up and get API credentials:
   - Cloud Name: `your-cloud`
   - API Key: `...`
   - API Secret: `...`

3. Set in API environment:
   ```env
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
   ```

4. Set in Vercel environment:
   ```env
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
   ```

5. Redeploy

---

## Step 7: Setup Email Whitelist

Before users can register, add their emails to the whitelist:

```bash
npm run whitelist:add
# Prompts for email to add

# Or directly:
psql $DATABASE_URL -c "INSERT INTO email_whitelist (email) VALUES ('user@example.com');"
```

---

## Step 8: Generate Developer Codes

Generate registration codes:

```bash
npm run whitelist:add
# Also generates codes

# Or directly:
psql $DATABASE_URL -c "INSERT INTO developer_codes (code, used) VALUES ('dev-code-123', false);"
```

---

## Step 9: Test Everything

### Test Frontend
```bash
# Should load without errors
https://your-collab.vercel.app
```

### Test API
```bash
# Should return 401 (no auth token)
curl https://your-api.run.app/api/servers
```

### Test Registration
1. Visit `https://your-collab.vercel.app/register`
2. Enter whitelisted email, dev code, password
3. Click Register
4. Should redirect to login

### Test Voice (Optional)
1. Create a server
2. Create a voice channel
3. Join voice channel
4. Should hear audio from LiveKit

### Test Media Upload
1. Open chat
2. Upload an image
3. Should appear in chat and on Cloudinary

---

## Optional: WebSocket Gateway

The WebSocket Gateway is **optional**. Chat works without it via Supabase Realtime.

**Only deploy if you need:**
- Custom WebRTC signaling (beyond LiveKit)
- Advanced pub/sub topology
- Direct WebSocket connection

**To deploy:**

Same as API deploy, but:
- Root Directory: `services/websocket-gateway`
- Port: `8080`
- Env: `REDIS_URL`, `DATABASE_URL`, `JWT_SECRET`

Then set in Vercel:
```env
NEXT_PUBLIC_WS_URL=wss://your-ws.run.app
```

---

## Database Migrations

### Check migration status
```bash
npm run db:diagnose
```

### Run migrations
```bash
npm run db:migrate-all
```

### Important: First-time setup
```bash
# Backfill @everyone role for existing members
psql $DATABASE_URL -f migrations/006_backfill_everyone_role.sql
```

---

## Monitoring & Logs

### Cloud Run
```bash
gcloud run services logs read collab-api
```

### Railway
- Dashboard → Project → Logs

### Render
- Dashboard → Service → Logs

### VPS
```bash
pm2 logs collab-api
tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

### API returns 500 errors
- Check logs: `npm run db:diagnose`
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running and accessible

### "Cannot connect to Redis"
- Verify `REDIS_URL` is set correctly
- Check Redis service is running
- Test: `redis-cli -u $REDIS_URL ping`

### Frontend can't reach API
- Check `NEXT_PUBLIC_API_URL` is set in Vercel
- Verify API is deployed and running
- Check CORS_ORIGIN matches frontend URL
- Trigger Vercel redeploy

### Voice channels don't work
- Verify LiveKit credentials are set correctly
- Test: Visit https://app.livekit.io with your credentials
- Check `NEXT_PUBLIC_LIVEKIT_URL` in Vercel

### Media upload fails
- Verify Cloudinary credentials are set
- Check cloud name is correct
- Test via Cloudinary dashboard

---

## Scaling Tips

### For 1000+ users
- Increase Cloud Run memory to 2GB+
- Enable Cloud SQL HA (high availability)
- Setup Redis replication
- Consider CDN (CloudFlare) in front of API

### Database backups
```bash
# Cloud SQL
gcloud sql backups create --instance=collab-db

# PostgreSQL
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Auto-scaling
- Cloud Run: Automatic (0-100 instances)
- Railway: Automatic (based on resources)
- Render: Set min/max instances in config

---

## Updating Collab

When a new version is released:

```bash
# Pull latest
git pull origin main

# Update dependencies
npm install

# Build frontend
npm run build

# Build API
npm run build:api

# Test locally
npm run dev
npm run dev:api

# Deploy (auto on git push with CI/CD)
```

For Vercel: Auto-deploys on git push
For Cloud Run: `gcloud run deploy ...` (or setup Cloud Build trigger)
For Railway: Auto-deploys on git push

---

## Production Checklist

- [ ] PostgreSQL and Redis are running
- [ ] Database migrations completed
- [ ] Email whitelist populated
- [ ] Developer codes generated
- [ ] LiveKit URL configured
- [ ] Cloudinary credentials set
- [ ] Frontend env vars set on Vercel
- [ ] API env vars set on Cloud Run/Railway/Render
- [ ] CORS_ORIGIN matches frontend URL
- [ ] Frontend redeployed after env changes
- [ ] All endpoints tested (register, login, send message, voice, media)
- [ ] Logs are being collected
- [ ] Database backups are scheduled
- [ ] SSL/TLS certificates are valid

---

## Support

- **Issues**: [GitHub Issues](https://github.com/lapinex/collab/issues)
- **Docs**: [Documentation](./docs)
- **Email**: support@collab.app

---

**Deployed successfully?** 🎉 Invite your users and enjoy Collab!
