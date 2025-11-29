# Load Testing Quick Start

## ✅ Ready to Run!

The load test script is ready. Here's how to use it:

## Installation (if needed)

```bash
pip install locust httpx
```

## Run Tests

### Option 1: Quick Test (10 users, 5 minutes)
```bash
./tests/load/run_load_test.sh 10 2 5m
```

### Option 2: Medium Load (25 users, 10 minutes)
```bash
./tests/load/run_load_test.sh 25 5 10m
```

### Option 3: Heavy Load (50 users, 10 minutes)
```bash
./tests/load/run_load_test.sh 50 10 10m
```

### Option 4: Web UI (Interactive)
```bash
locust -f tests/load/locustfile.py --host=https://fitai-api.onrender.com
```
Then open http://localhost:8089

## What Gets Tested

1. **Chat Stream** (5x weight) - Core feature
2. **Log Workout** (3x weight)
3. **Get Stats** (2x weight)
4. **Weekly Summary** (2x weight)
5. **Calendar** (1x weight)

## Expected Results

- ✅ Error rate < 1%
- ✅ p95 response time < 5s (non-streaming)
- ✅ Chat stream completes in < 30s
- ✅ Time to first token < 20s

## Monitor During Test

- Render dashboard (CPU/Memory)
- Database connection pool
- OpenAI API status
- Response times in Locust UI

## Next Steps

1. Run light load test (10 users) - verify baseline
2. Run medium load (25 users) - typical beta load
3. Run heavy load (50 users) - stress test
4. Review results and fix any issues

---

**Ready? Start with:**
```bash
./tests/load/run_load_test.sh 10 2 5m
```

