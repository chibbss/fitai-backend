# FitAI Backend - Quick Start & Development Guide

**Local development and quick start guide for FitAI backend.**

**Last Updated:** November 26, 2025

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies (includes PyTorch for local fallback)
pip install -r requirements.txt
```

### 2. Configure Environment

Create `.env` file:

```bash
# Database (required)
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/fitai

# Supabase Authentication (required)
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# OpenAI API (recommended for production)
OPENAI_API_KEY=sk-...
GEN_BACKEND=openai
EMBEDDING_PROVIDER=openai
RERANKER_BACKEND=none

# Optional: Local fallback (for development without OpenAI)
# GEN_BACKEND=local
# EMBEDDING_PROVIDER=local
# RERANKER_BACKEND=local
```

### 3. Run Database Migration

```bash
# Apply migrations against your local database
alembic upgrade head
```

**Expected Output:**
```
INFO  [alembic.runtime.migration] Running upgrade ... -> ..., workout sessions and ragas metrics
```

### 4. Verify Migration

```bash
# Connect to your database and verify tables exist
psql $DATABASE_URL -c "\dt"
```

**Should show:**
- `workout_sessions`
- `exercise_logs`
- `ragas_metrics`
- `chat_messages`
- (plus existing tables)

### 5. Start the Server

```bash
# Development (with auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production (with gunicorn)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## 🧪 Quick Smoke Test

### Test 1: Health Check

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

### Test 2: Create Test Token

```python
python3 << EOF
from auth import create_test_token
token = create_test_token('test-user-123', 'premium')
print(f"Export this token: export TOKEN={token}")
EOF
```

### Test 3: Log a Workout

```bash
curl -X POST http://localhost:8000/log/workout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_name": "Test Push Day",
    "session_type": "strength",
    "exercises": [
      {
        "exercise_name": "Bench Press",
        "sets": 3,
        "reps": [10, 10, 8],
        "weights": ["60kg", "60kg", "65kg"]
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "session_id": "some-uuid",
  "exercise_count": 1,
  "inserted": true
}
```

### Test 4: Get Insights

```bash
# Use session_id from previous response
curl http://localhost:8000/insights/{session_id} \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "session_id": "some-uuid",
  "insights": [
    {
      "exercise": "Bench Press",
      "status": "new",
      "message": "🎉 First time logging Bench Press!"
    }
  ],
  "overall_message": "Great session! Keep it up! 💪",
  "avg_volume_change_pct": 0.0,
  "exercise_count": 1
}
```

### Test 5: Streaming Chat

```bash
curl -X POST http://localhost:8000/chat_stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What exercises should I do for chest?"}' \
  --no-buffer
```

**Expected:** Stream of SSE events with tokens appearing in real-time.

### Test 6: Regular Chat

```bash
curl -X POST http://localhost:8000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "How much protein should I eat?"}'
```

**Expected:** Fast response (< 2s with OpenAI) with AI-generated message.

---

## 🔧 Configuration

### AI Backend Options

#### Option 1: OpenAI (Recommended for Production)

```bash
OPENAI_API_KEY=sk-...
GEN_BACKEND=openai
EMBEDDING_PROVIDER=openai
RERANKER_BACKEND=none
```

**Benefits:**
- ✅ Fast responses (< 2s)
- ✅ No cold starts
- ✅ Better AI quality
- ✅ Simple infrastructure

#### Option 2: Local Models (Development/Testing)

```bash
GEN_BACKEND=local
EMBEDDING_PROVIDER=local
RERANKER_BACKEND=local
```

**Note:** Requires PyTorch and model downloads (~5GB+).

### Optional Configuration

```bash
# Redis Caching (Optional but Recommended)
REDIS_URL=redis://localhost:6379/0

# Observability
SENTRY_DSN=<your-sentry-dsn>
LOG_LEVEL=INFO
LOG_PII_REDACTION_ENABLED=1

# Performance
LOAD_LOCAL_EMBEDDING_FALLBACK=true  # Only for local development
```

---

## 📊 Monitoring RAGAS Metrics

### Query Recent Metrics

```sql
SELECT 
  user_id,
  query,
  LEFT(answer, 100) as answer_preview,
  retrieval_count,
  has_citations,
  citation_count,
  ROUND(total_time_ms::numeric, 2) as total_ms,
  created_at
FROM ragas_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🐛 Troubleshooting

### Migration Fails

```bash
# Check current migration version
alembic current

# If stuck, check migration history
alembic history

# Downgrade one step and retry
alembic downgrade -1
alembic upgrade head
```

### SSE Streaming Not Working

- Ensure `sse-starlette` is installed: `pip install sse-starlette==2.1.3`
- Check client supports SSE (EventSource API in browsers)
- Verify no proxy/nginx buffering blocking streaming

### OpenAI API Errors

- Check `OPENAI_API_KEY` is set correctly
- Verify API key has credits
- Check OpenAI rate limits (10,000 TPM for GPT-4o-mini)
- Review error logs for specific OpenAI errors

### Workout Insights Empty

- Ensure at least 2 workouts logged for same exercise
- Check `exercise_name` matches exactly (case-sensitive)
- Verify weights are parseable strings ("45kg", "135lbs", etc.)

---

## 📈 Performance Tuning

### Database Indexes (Already Created)

- `idx_workout_sessions_user`
- `idx_workout_sessions_occurred`
- `idx_exercise_logs_user`
- `idx_exercise_logs_name`
- `idx_ragas_metrics_user`
- `idx_ragas_metrics_created`

### Redis Caching (Optional but Recommended)

```bash
export REDIS_URL=redis://localhost:6379/0
export REDIS_TTL_EMBEDDINGS_SEC=3600
export REDIS_TTL_SESSION_SEC=3600
```

---

## ✅ Production Checklist

Before deploying to production:

- [ ] Run migration: `alembic upgrade head`
- [ ] Verify all environment variables set
- [ ] Test authentication with real Supabase tokens
- [ ] Configure rate limits appropriately
- [ ] Set up monitoring (Sentry, Prometheus)
- [ ] Enable Redis for caching
- [ ] Test streaming endpoint with production load
- [ ] Verify OpenAI API key has credits
- [ ] Set up database backups
- [ ] Configure CORS if needed
- [ ] Load test insights endpoint
- [ ] Set appropriate worker count for gunicorn

**See `docs/guides/RENDER_DEPLOYMENT.md` for complete production deployment guide.**

---

## 🎯 Next Steps

1. ✅ Run migration
2. ✅ Test all smoke tests above
3. ✅ Monitor RAGAS metrics for first 24 hours
4. ✅ Gather user feedback on workout insights
5. ✅ Deploy to production (see `docs/guides/RENDER_DEPLOYMENT.md`)

---

## 📚 Additional Resources

- **[Render Deployment Guide](./RENDER_DEPLOYMENT.md)** - Complete production deployment
- **[Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step checklist
- **[API Documentation](../reference/API_DOCUMENTATION.md)** - Complete API reference
- **[Observability Setup](./OBSERVABILITY_SETUP.md)** - Monitoring and alerting
- **[Redis Setup Guide](./REDIS_SETUP_GUIDE.md)** - Redis caching setup

---

**Ready to develop! 🚀**
