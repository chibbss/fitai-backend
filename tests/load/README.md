# FitAI Load Testing

Production-grade load testing for FitAI backend using Locust.

## Installation

```bash
pip install locust httpx
```

## Quick Start

### Option 1: Web UI (Recommended for first run)

```bash
locust -f tests/load/locustfile.py --host=https://fitai-api.onrender.com
```

Then open http://localhost:8089 in your browser and:
1. Set number of users (start with 10)
2. Set spawn rate (users per second, start with 2)
3. Click "Start Swarming"

### Option 2: Headless (Command Line)

```bash
# Test with 10 users, spawn 2 per second, run for 5 minutes
locust -f tests/load/locustfile.py \
  --headless \
  --host=https://fitai-api.onrender.com \
  -u 10 \
  -r 2 \
  -t 5m

# Test with 50 users, spawn 10 per second, run for 10 minutes
locust -f tests/load/locustfile.py \
  --headless \
  --host=https://fitai-api.onrender.com \
  -u 50 \
  -r 10 \
  -t 10m
```

## Test Scenarios

The load test simulates real users performing:

1. **Chat with FitAI (5x weight)** - Streaming chat endpoint
2. **Log Workout (3x weight)** - Workout logging
3. **Get Workout Stats (2x weight)** - Stats retrieval
4. **Get Weekly Summary (2x weight)** - Weekly summary
5. **Get Workout Calendar (1x weight)** - Calendar view

## Recommended Test Progression

### Phase 1: Light Load (Baseline)
```bash
locust -f tests/load/locustfile.py --headless --host=https://fitai-api.onrender.com -u 10 -r 2 -t 5m
```
**Goal:** Verify system works under minimal load

### Phase 2: Medium Load
```bash
locust -f tests/load/locustfile.py --headless --host=https://fitai-api.onrender.com -u 25 -r 5 -t 10m
```
**Goal:** Test typical beta user load

### Phase 3: Heavy Load
```bash
locust -f tests/load/locustfile.py --headless --host=https://fitai-api.onrender.com -u 50 -r 10 -t 10m
```
**Goal:** Test system limits

### Phase 4: Stress Test
```bash
locust -f tests/load/locustfile.py --headless --host=https://fitai-api.onrender.com -u 100 -r 20 -t 10m
```
**Goal:** Find breaking point

## Metrics to Monitor

### During Test:
- **Response Times**: p50, p95, p99
- **Error Rate**: Should be < 1%
- **Time to First Token**: For chat_stream (should be < 20s)
- **Total Chat Time**: Should be < 30s

### Backend Monitoring:
- Render instance CPU/Memory
- Database connection pool usage
- Redis cache hit rate
- OpenAI API rate limits

## Expected Results

### Success Criteria:
- ✅ Error rate < 1%
- ✅ p95 response time < 5s (non-streaming)
- ✅ p95 chat_stream time < 30s
- ✅ Time to first token < 20s
- ✅ No database connection pool exhaustion
- ✅ No OpenAI rate limit errors

### Red Flags:
- ❌ Error rate > 5%
- ❌ p95 response time > 10s
- ❌ Database connection pool maxed out
- ❌ OpenAI rate limit errors
- ❌ Render instance OOM (out of memory)

## Troubleshooting

### "SUPABASE_JWT_SECRET not set"
Set the environment variable:
```bash
export SUPABASE_JWT_SECRET=your_secret_here
```

### "Cannot import auth module"
Run from project root:
```bash
cd /path/to/fitai-backend
locust -f tests/load/locustfile.py
```

### Chat streaming timeouts
- Check OpenAI API status
- Verify backend is awake (not sleeping)
- Check Render logs for errors

## Output

Results are displayed in:
- **Web UI**: Real-time charts and stats
- **Console**: Summary at test end
- **CSV Export**: Use `--csv=results` flag

```bash
locust -f tests/load/locustfile.py --headless --host=https://fitai-api.onrender.com -u 50 -r 10 -t 10m --csv=results
```

This creates:
- `results_stats.csv` - Request statistics
- `results_failures.csv` - Failure details
- `results_exceptions.csv` - Exception details

