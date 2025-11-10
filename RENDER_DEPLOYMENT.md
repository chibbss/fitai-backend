# Render Deployment Guide

**Quick deployment guide for FitAI backend on Render.**

---

## Prerequisites

- Render account (sign up at https://render.com)
- GitHub repository connected to Render
- Supabase credentials ready

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
4. **Important**: After creation, enable pgvector extension:
   - Go to database → **Shell** tab
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`

---

## Step 2: Create Web Service

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `fitai-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn main:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120`
     - **Note**: Using 1 worker for free tier (512MB limit). For paid plans, use `-w 2` or `-w 4`
   - **Plan**: Free (512MB, spins down after 15min) or Starter ($7/month, 512MB) or Standard ($25/month, 2GB)

---

## Step 3: Configure Environment Variables

In Render Web Service → **Environment** tab, add:

### Required Variables

```bash
ENVIRONMENT=production
DATABASE_URL=<from PostgreSQL service - Internal Database URL>
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
SUPABASE_URL=https://ltxehjhphbncgsjyqhzk.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### LLM Configuration

```bash
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct
GEN_BACKEND=remote
REMOTE_GEN_URL=https://<your-modal-app>.modal.run/v1/completions
REMOTE_GEN_API_KEY=<optional-if-needed>
```

### Optional (Recommended)

```bash
EMBEDDING_PROVIDER=local
RERANKER_BACKEND=remote  # Use "remote" for free tier (saves memory), "local" for paid plans
RERANKER_REMOTE_URL=https://<your-modal-reranker>.modal.run/rerank  # If using remote reranker
LOG_PII_REDACTION_ENABLED=1
RAGAS_LOGGING_ENABLED=1
ENABLE_SCHEDULER=1
SENTRY_DSN=<your-sentry-dsn>
```

**Note for Free Tier:**
- Use `RERANKER_BACKEND=remote` to avoid loading reranker model (saves ~100MB)
- Use `-w 1` worker (single worker) to stay within 512MB limit
- Consider upgrading to Starter/Standard plan for better performance

---

## Step 4: Link Database to Web Service

1. In Web Service → **Environment** tab
2. Click **Link Resource** → Select `fitai-db`
3. Render will automatically set `DATABASE_URL` environment variable

---

## Step 5: Deploy

1. Click **Save Changes** in Web Service
2. Render will automatically:
   - Build the application
   - Run migrations (`alembic upgrade head`)
   - Start the server
3. Monitor logs in **Logs** tab

---

## Step 6: Verify Deployment

```bash
# Health check
curl https://fitai-api.onrender.com/health

# Expected: {"status":"ok"}

# Test with auth token
curl -X POST https://fitai-api.onrender.com/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello"}'
```

---

## Step 7: Update Frontend

Update frontend `.env`:

```bash
EXPO_PUBLIC_API_URL=https://fitai-api.onrender.com
```

---

## Troubleshooting

### Migration Fails

- Check database connection string
- Verify pgvector extension is enabled
- Check logs for specific error

### Model Not Loading

- Verify `REMOTE_GEN_URL` is correct
- Check Modal service is running
- Test Modal endpoint directly

### Health Check Fails

- Check application logs
- Verify all environment variables are set
- Check database connection

---

## Cost Estimate

- **PostgreSQL**: $7-20/month
- **Web Service**: $7-25/month
- **Total**: ~$14-45/month

---

## Next Steps

1. ✅ Deploy backend
2. ✅ Test all endpoints
3. ✅ Update frontend API URL
4. ✅ Monitor logs and performance
5. ✅ Set up Sentry alerts (optional)

---

**Deployment complete! 🚀**

