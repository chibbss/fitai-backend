# FitAI Backend - Render Deployment Checklist

**Status**: Ready for deployment  
**Platform**: Render + OpenAI  
**Estimated Time**: 30-60 minutes  
**Last Updated**: November 26, 2025

---

## Pre-Deployment

- [x] Code committed and pushed to GitHub
- [x] OpenAI migration complete
- [x] Migration files ready
- [x] `requirements-render.txt` created
- [x] Documentation updated

---

## Step 1: Create Render PostgreSQL Database (10 mins)

1. Go to https://render.com → **New** → **PostgreSQL**
2. Settings:
   - **Name**: `fitai-db`
   - **Database**: `fitai`
   - **User**: `fitai_user`
   - **Region**: Choose closest to users
   - **Plan**: Starter ($7/month) or Standard ($20/month)
3. Click **Create Database**
4. **CRITICAL**: Enable pgvector extension:
   - Go to database → **Shell** tab
   - Run: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`
   - Should show: `vector | 0.8.1`

---

## Step 2: Create Render Web Service (15 mins)

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

## Step 3: Link Database (2 mins)

1. In Web Service → **Environment** tab
2. Click **Link Resource** → Select `fitai-db`
3. Render automatically sets `DATABASE_URL`

---

## Step 4: Configure Environment Variables (10 mins)

In Web Service → **Environment** tab, add these:

### Required

```bash
ENVIRONMENT=production
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

# Redis Caching (Optional)
REDIS_URL=redis://default:password@host:port

# Observability
SENTRY_DSN=<your-sentry-dsn>
LOG_LEVEL=INFO
LOG_PII_REDACTION_ENABLED=1

# Performance (for free tier)
LOAD_LOCAL_EMBEDDING_FALLBACK=false
```

**Note for Free Tier:**
- Use `RERANKER_BACKEND=none` (default) - no reranker needed
- Use `LOAD_LOCAL_EMBEDDING_FALLBACK=false` - saves ~200MB memory
- Use `-w 1` worker (single worker) to stay within 512MB limit

---

## Step 5: Run Database Migrations (5 mins)

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

## Step 6: Deploy (5 mins)

1. Click **Save Changes** in Web Service
2. Render will automatically:
   - Build the application (using `requirements-render.txt`)
   - Start the server
3. Monitor in **Logs** tab
4. Wait for "Application startup complete"

---

## Step 7: Verify Deployment (5 mins)

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

### Verify Database

1. Go to Render PostgreSQL → **Shell** tab
2. Run: `\dt`
3. Should show all tables including `workout_sessions`, `exercise_logs`, `chat_messages`

---

## Step 8: Update Frontend (5 mins)

Update `frontend/.env`:

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
- Verify API key has credits ($5+ recommended for beta)
- Check OpenAI rate limits (10,000 TPM for GPT-4o-mini)
- Review error logs for specific OpenAI errors

### Out of Memory (512MB)

- Set `LOAD_LOCAL_EMBEDDING_FALLBACK=false`
- Set `RERANKER_BACKEND=none` (already default)
- Use `-w 1` worker (single worker)
- Consider upgrading to Starter/Standard plan

---

## Post-Deployment

- [ ] Test all endpoints
- [ ] Monitor logs for errors
- [ ] Set up Sentry (optional but recommended)
- [ ] Configure Redis caching (optional but recommended)
- [ ] Configure database backups
- [ ] Update frontend API URL
- [ ] Test end-to-end flow
- [ ] Run E2E tests: `python3 tests/e2e/production_e2e_test.py`

---

## Cost Estimate

- **PostgreSQL**: $7-20/month
- **Web Service**: $0-25/month (Free/Starter/Standard)
- **OpenAI API**: ~$5-50/month (depending on usage)
- **Total**: ~$12-95/month

---

## Next Steps After Deployment

1. ✅ Test onboarding flow
2. ✅ Test chat functionality (should be fast, < 2s)
3. ✅ Test workout logging
4. ✅ Test insights generation
5. ✅ Monitor performance
6. ✅ Gather user feedback

---

## Success Criteria

- ✅ Health check returns 200
- ✅ Readiness check returns `{"ok":true,"db_ok":true,"gen_ok":true}`
- ✅ Chat endpoint responds in < 2s
- ✅ No OpenAI API errors
- ✅ Database migrations applied successfully
- ✅ All endpoints accessible

---

**Ready to deploy! Follow the steps above. 🚀**
