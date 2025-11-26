# Render Deployment Guide - FitAI Backend

**Complete production deployment guide for FitAI backend on Render with OpenAI.**

**Last Updated:** November 26, 2025  
**Status:** ✅ Production Ready

---

## Overview

FitAI backend is deployed on Render with OpenAI API for AI services. This guide covers the complete setup from database creation to production deployment.

## Architecture

```
┌─────────────────┐
│  Render Backend │  (FastAPI - Lightweight, no models)
│  (fitai-api)    │
└────────┬────────┘
         │
         ├───► OpenAI API (GPT-4o-mini for chat & insights)
         ├───► OpenAI API (text-embedding-3-large for embeddings)
         ├───► OpenAI API (whisper-1 for transcription)
         ├───► PostgreSQL + pgvector (Database)
         └───► Redis (Optional - Caching)
```

**Key Benefits:**
- ✅ No cold starts (OpenAI is always ready)
- ✅ Fast responses (< 2s for chat)
- ✅ Better AI quality (GPT-4o-mini)
- ✅ Simple infrastructure (no GPU management)
- ✅ Predictable costs (pay-per-use)

---

## Prerequisites

1. **Render Account** - Sign up at https://render.com
2. **OpenAI Account** - Get API key from https://platform.openai.com
3. **Supabase Account** - For authentication
4. **Redis Account** (Optional) - Redis Cloud (redis.io) for caching

---

## Step 1: Create PostgreSQL Database

1. Go to Render Dashboard → **New** → **PostgreSQL**
2. Configure:
   - **Name**: `fitai-db`
   - **Database**: `fitai`
   - **User**: `fitai_user`
   - **Region**: Choose closest to your users
   - **Plan**: Starter ($7/month) or Standard ($20/month)
3. Click **Create Database**
4. **CRITICAL**: Enable pgvector extension:
   - Go to database → **Shell** tab
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`
   - Should show: `vector | 0.8.1` or higher

---

## Step 2: Create Web Service

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repository (`chibbss/fitai-backend`)
3. Select branch: `feature/add-frontend` (or `main`)
4. Configure:
   - **Name**: `fitai-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install --upgrade pip && pip install -r requirements-render.txt`
   - **Start Command**: `gunicorn main:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 180`
     - **Note**: Using 1 worker for free tier (512MB limit). For paid plans, use `-w 2` or `-w 4`
   - **Plan**: Free (512MB, spins down after 15min) or Starter ($7/month, 512MB) or Standard ($25/month, 2GB)

---

## Step 3: Configure Environment Variables

In Render Web Service → **Environment** tab, add:

### Required Variables

```bash
# Environment
ENVIRONMENT=production

# Database (auto-set when linked)
DATABASE_URL=<auto-set-by-render>

# Supabase Authentication
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>

# OpenAI API (Required)
OPENAI_API_KEY=sk-...
GEN_BACKEND=openai
EMBEDDING_PROVIDER=openai
RERANKER_BACKEND=none
```

### Optional (Recommended)

```bash
# Database Schema Management
DB_SCHEMA_MANAGEMENT=migrations

# Redis Caching (Optional but Recommended)
REDIS_URL=redis://default:password@host:port

# Observability
SENTRY_DSN=<your-sentry-dsn>
LOG_LEVEL=INFO
LOG_PII_REDACTION_ENABLED=1

# Performance
LOAD_LOCAL_EMBEDDING_FALLBACK=false  # Set false on Render to save memory
```

**Note for Free Tier:**
- Use `RERANKER_BACKEND=none` (default) - no reranker needed
- Use `LOAD_LOCAL_EMBEDDING_FALLBACK=false` - saves ~200MB memory
- Use `-w 1` worker (single worker) to stay within 512MB limit
- Consider upgrading to Starter/Standard plan for better performance

---

## Step 4: Link Database to Web Service

1. In Web Service → **Environment** tab
2. Click **Link Resource** → Select `fitai-db`
3. Render will automatically set `DATABASE_URL` environment variable

---

## Step 5: Run Database Migrations

**Before first deployment**, run migrations:

```bash
# Option 1: Via Render Shell
# Go to Render Web Service → Shell tab
alembic upgrade head

# Option 2: Via local connection
alembic -x url=$RENDER_DATABASE_URL upgrade head
```

**Expected Output:**
```
INFO  [alembic.runtime.migration] Running upgrade ... -> ..., workout sessions and ragas metrics
```

---

## Step 6: Deploy

1. Click **Save Changes** in Web Service
2. Render will automatically:
   - Build the application (using `requirements-render.txt`)
   - Start the server
3. Monitor logs in **Logs** tab
4. Wait for "Application startup complete"

---

## Step 7: Verify Deployment

### Health Check

```bash
curl https://fitai-api.onrender.com/health
# Expected: {"status":"ok"}
```

### Readiness Check

```bash
curl https://fitai-api.onrender.com/readiness
# Expected: {"ok":true,"db_ok":true,"gen_ok":true}
```

### Test Chat Endpoint

```bash
# Get test token (run locally)
source venv/bin/activate
python3 -c "from auth import create_test_token; print(create_test_token('test-user', 'premium'))"

# Test chat
export TOKEN="your-test-token"
curl -X POST https://fitai-api.onrender.com/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello"}'
```

**Expected:** Fast response (< 2s) with AI-generated message.

---

## Step 8: Update Frontend

Update frontend `.env`:

```bash
EXPO_PUBLIC_API_URL=https://fitai-api.onrender.com
```

Restart Expo:
```bash
cd frontend
expo start --clear
```

---

## Troubleshooting

### Build Fails

- Check logs for specific error
- Verify `requirements-render.txt` exists
- Check Python version (needs 3.10+)
- Ensure build command uses `requirements-render.txt`

### Migration Fails

- Verify pgvector extension is enabled
- Check database connection string
- Review migration logs
- Run migrations manually via Render Shell

### Health Check Returns 500

- Check application logs
- Verify all environment variables are set
- Check database connection
- Verify OpenAI API key is valid

### OpenAI API Errors

- Check `OPENAI_API_KEY` is set correctly
- Verify API key has credits
- Check OpenAI rate limits (10,000 TPM for GPT-4o-mini)
- Review error logs for specific OpenAI errors

### Out of Memory (512MB)

- Set `LOAD_LOCAL_EMBEDDING_FALLBACK=false`
- Set `RERANKER_BACKEND=none` (already default)
- Use `-w 1` worker (single worker)
- Consider upgrading to Starter/Standard plan

---

## Cost Estimation

### Render

- **PostgreSQL**: $7-20/month (Starter/Standard)
- **Web Service**: $0-25/month (Free/Starter/Standard)
- **Total**: ~$7-45/month

### OpenAI

- **GPT-4o-mini**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **Embeddings**: ~$0.13 per 1M tokens
- **Whisper**: $0.006 per minute

**Estimated Monthly Cost:**
- Low traffic (1000 requests/day): ~$5-10/month
- Moderate traffic (10,000 requests/day): ~$20-50/month
- High traffic (100,000 requests/day): ~$100-300/month

**Total Estimated Cost**: $12-55/month for moderate traffic

---

## Performance Optimization

### Database Connection Pooling

Already configured:
- **Pool Size**: 5 base connections
- **Max Overflow**: 10 additional connections
- **Total**: 15 connections (optimized for Render free tier)

### Redis Caching

Optional but recommended:
- Caches calendar and weekly summary endpoints
- 5-minute TTL
- Reduces database load

See `docs/guides/REDIS_SETUP_GUIDE.md` for setup.

### Rate Limiting

Already configured:
- Chat: 60 requests/minute
- Search: 120 requests/minute
- Logs: 120 requests/minute

---

## Monitoring

### Health Checks

- `/health` - Basic health check (always responds)
- `/readiness` - Readiness check (checks DB and OpenAI)

### Metrics

- `/metrics` - Prometheus metrics (if configured)
- Sentry integration for error tracking
- Logs available in Render dashboard

### Observability Setup

See `docs/guides/OBSERVABILITY_SETUP.md` for complete setup guide.

---

## Next Steps

1. ✅ Deploy backend
2. ✅ Test all endpoints
3. ✅ Update frontend API URL
4. ✅ Set up Sentry (optional but recommended)
5. ✅ Configure Redis caching (optional but recommended)
6. ✅ Monitor logs and performance
7. ✅ Run E2E tests: `python3 tests/e2e/production_e2e_test.py`

---

## Support

For issues or questions:
- Check Render logs: Render Dashboard → Logs
- Check application logs in Render dashboard
- Review `docs/guides/DEPLOYMENT_CHECKLIST.md` for step-by-step guide
- See `docs/README.md` for complete documentation index

---

**Deployment complete! 🚀**
