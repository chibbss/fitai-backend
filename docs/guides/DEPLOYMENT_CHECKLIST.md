# FitAI Backend - Render Deployment Checklist

**Status**: Ready for deployment  
**Platform**: Render  
**Estimated Time**: 30-60 minutes

---

## Pre-Deployment

- [x] Code committed and pushed to GitHub
- [x] AI-generated onboarding message implemented
- [x] Migration files ready
- [x] Dockerfile created
- [x] render.yaml created
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
3. Select branch: `feature/add-frontend`
4. Configure:
   - **Name**: `fitai-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt && alembic upgrade head`
   - **Start Command**: `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
   - **Plan**: Starter ($7/month) or Standard ($25/month)

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
SUPABASE_URL=https://ltxehjhphbncgsjyqhzk.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### LLM Configuration

```bash
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct
GEN_BACKEND=remote
REMOTE_GEN_URL=https://<your-modal-app>.modal.run/v1/completions
```

**Note**: If you don't have Modal vLLM set up yet, you can:
- Use `GEN_BACKEND=local` (slower, but works)
- Or set up Modal vLLM first (see `infra/modal_vllm.py`)

### Optional (Recommended)

```bash
EMBEDDING_PROVIDER=local
RERANKER_BACKEND=local
LOG_PII_REDACTION_ENABLED=1
RAGAS_LOGGING_ENABLED=1
ENABLE_SCHEDULER=1
```

---

## Step 5: Deploy (5 mins)

1. Click **Save Changes** in Web Service
2. Render will automatically:
   - Build the application
   - Run migrations (`alembic upgrade head`)
   - Start the server
3. Monitor in **Logs** tab
4. Wait for "Application startup complete"

---

## Step 6: Verify Deployment (5 mins)

### Health Check

```bash
curl https://fitai-api.onrender.com/health
# Expected: {"status":"ok"}
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

### Verify Database

1. Go to Render PostgreSQL → **Shell** tab
2. Run: `\dt`
3. Should show all 10 tables including `chat_messages`

---

## Step 7: Update Frontend (5 mins)

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
- Verify all dependencies in `requirements.txt`
- Check Python version (needs 3.10+)

### Migration Fails

- Verify pgvector extension is enabled
- Check database connection string
- Review migration logs

### Health Check Returns 500

- Check application logs
- Verify all environment variables are set
- Check database connection

### Model Not Loading

- Verify `REMOTE_GEN_URL` is correct
- Check Modal service is running
- Test Modal endpoint directly: `curl https://your-modal.modal.run/health`

---

## Post-Deployment

- [ ] Test all endpoints
- [ ] Monitor logs for errors
- [ ] Set up Sentry (optional)
- [ ] Configure database backups
- [ ] Update frontend API URL
- [ ] Test end-to-end flow

---

## Cost Estimate

- **PostgreSQL**: $7-20/month
- **Web Service**: $7-25/month
- **Total**: ~$14-45/month

---

## Next Steps After Deployment

1. Test onboarding flow
2. Test chat functionality
3. Test workout logging
4. Monitor performance
5. Gather user feedback

---

**Ready to deploy! Follow the steps above. 🚀**


