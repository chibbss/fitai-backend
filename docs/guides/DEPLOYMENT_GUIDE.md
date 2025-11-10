# FitAI Backend - Deployment Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Activate virtual environment
source venv/bin/activate

# Install new dependencies
pip install -r requirements.txt
```

### 2. Run Database Migration

```bash
# Run the new migration to create workout and RAGAS tables
alembic upgrade head
```

**Expected Output:**
```
INFO  [alembic.runtime.migration] Running upgrade b43c9a785a9e -> c8d4f2e1b9a3, workout sessions and ragas metrics
```

### 3. Verify Migration

```bash
# Connect to your database and verify tables exist
psql $DATABASE_URL -c "\dt"
```

**Should show:**
- `workout_sessions`
- `exercise_logs`
- `ragas_metrics`
- (plus existing tables)

### 4. Start the Server

```bash
# Development
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

### Test 6: Regular Chat with RAGAS Logging
```bash
curl -X POST http://localhost:8000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "How much protein should I eat?"}'
```

**Expected:** Normal chat response, and RAGAS metrics logged in background.

### Test 7: Verify RAGAS Logging
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM ragas_metrics;"
# Should show 1 or more rows
```

---

## ☁️ Modal vLLM Setup (Remote Generation)

### 1. Configure Modal app

- Ensure your HF token is stored in Modal secrets:
```bash
python -m modal secret create hf-token HF_TOKEN=hf_XXXXXXXXXXXXXXXXXXXX
```

- Deploy vLLM app:
```bash
python -m modal deploy infra/modal_vllm.py
```

The app uses:
- GPU: A10G (sufficient for Llama 3.1 8B Instruct)
- DType: float16
- Max model len: auto-detected from model config

### 2. Set backend env

Add these to your `.env`:
```bash
GEN_BACKEND=remote
REMOTE_GEN_URL=https://<your-modal-app>.modal.run/v1/completions
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct
```

### 3. Warm and test
```bash
curl -s https://<your-modal-app>.modal.run/health

curl -s -X POST https://<your-modal-app>.modal.run/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/Meta-Llama-3.1-8B-Instruct", "prompt":"Hello", "max_tokens":64}'
```

Then test FitAI chat:
```bash
curl -s -X POST http://localhost:8000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"Plan a leg day for me."}'
```

---

## 🔪 Chunking Configuration & QA

### 1. Recommended settings
In `.env`:
```bash
CHUNKING_MODE=token
CHUNK_SIZE_TOKENS=512
CHUNK_OVERLAP_TOKENS=64
```

### 2. Re-ingest documents (per file)
```bash
source venv/bin/activate
python scripts/ingest_local_docs.py "data/pdfs/fitness-handbook.pdf" --category kb --url "https://source-url"
```

### 3. QA checks (SQL)

- Clean starts (% of chunks starting with caps/markers):
```sql
SELECT 
  COUNT(*) FILTER (WHERE text ~ '^[A-Z0-9#•\\-\\*\\[]') AS clean_starts,
  COUNT(*) AS total,
  ROUND(COUNT(*) FILTER (WHERE text ~ '^[A-Z0-9#•\\-\\*\\[]') * 100.0 / COUNT(*), 1) AS pct
FROM chunks WHERE document_id = '<doc_id>';
```

- Random sample (start/end):
```sql
SELECT LEFT(text, 120) AS start, RIGHT(text, 120) AS end
FROM chunks WHERE document_id = '<doc_id>'
ORDER BY RANDOM() LIMIT 10;
```

If pct < 70%, re-ingest with higher overlap (e.g., `CHUNK_OVERLAP_TOKENS=96`).

---

## 🔧 Configuration

### Required Environment Variables
```bash
# Database (required)
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/fitai

# Supabase Auth (required in production)
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_URL=https://your-project.supabase.co

# Generation Backend (optional, defaults to local)
GEN_BACKEND=remote  # or "local"
REMOTE_GEN_URL=https://your-vllm.modal.run/v1/completions
REMOTE_GEN_API_KEY=your-api-key  # if needed

# Embeddings (optional, defaults to local)
EMBEDDING_PROVIDER=local  # or "modal" or "openai"
# REMOTE_EMBED_URL=https://your-embed-service.modal.run/embed
# OPENAI_API_KEY=sk-...

# Reranker (optional, defaults to local)
RERANKER_BACKEND=local  # or "remote" or "none"
# RERANKER_REMOTE_URL=https://your-rerank.modal.run/rerank
```

### Optional Toggles
```bash
# RAGAS logging (default: enabled)
RAGAS_LOGGING_ENABLED=1

# Memory refresh on user profile update (default: enabled)
REFRESH_MEMORY_ON_UPSERT=1

# Scheduled memory refresh (default: enabled, runs at 3am)
ENABLE_SCHEDULER=1
MEMORY_CRON_HOUR=3

# Rate limits (defaults shown)
RATE_LIMIT_CHAT=60/minute
RATE_LIMIT_SEARCH=120/minute
RATE_LIMIT_LOGS=120/minute
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

### Export for RAGAS Evaluation
```sql
COPY (
  SELECT 
    user_id,
    query,
    answer,
    kb_chunks_retrieved,
    logs_retrieved,
    retrieval_count,
    has_citations,
    citation_count,
    answer_length,
    retrieval_time_ms,
    generation_time_ms,
    total_time_ms
  FROM ragas_metrics
  WHERE created_at >= NOW() - INTERVAL '7 days'
) TO '/tmp/ragas_export.csv' WITH CSV HEADER;
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

### RAGAS Logging Errors
```bash
# Check if table exists
psql $DATABASE_URL -c "\d ragas_metrics"

# Disable if problematic
export RAGAS_LOGGING_ENABLED=0
```

### Workout Insights Empty
- Ensure at least 2 workouts logged for same exercise
- Check `exercise_name` matches exactly (case-sensitive)
- Verify weights are parseable strings ("45kg", "135lbs", etc.)

---

## 🔄 Rollback Plan

If you need to rollback:

```bash
# Downgrade database
alembic downgrade b43c9a785a9e

# Revert code changes
git checkout main

# Restart server
uvicorn main:app --reload
```

**Note:** Existing endpoints are NOT affected. Old `/add_training_log` still works.

---

## 📈 Performance Tuning

### Database Indexes (Already Created)
- `idx_workout_sessions_user`
- `idx_workout_sessions_occurred`
- `idx_exercise_logs_user`
- `idx_exercise_logs_name`
- `idx_ragas_metrics_user`
- `idx_ragas_metrics_created`

### Recommended Postgres Settings
```sql
-- For better HNSW index performance
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET effective_cache_size = '4GB';
SELECT pg_reload_conf();
```

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
- [ ] Verify RAGAS metrics logging
- [ ] Set up database backups
- [ ] Configure CORS if needed
- [ ] Test with production vLLM/generation backend
- [ ] Load test insights endpoint
- [ ] Set appropriate worker count for gunicorn

---

## 🎯 Next Steps

1. ✅ Run migration
2. ✅ Test all 6 smoke tests above
3. ✅ Monitor RAGAS metrics for first 24 hours
4. ✅ Gather user feedback on workout insights
5. ✅ Plan Phase 2 features

---



