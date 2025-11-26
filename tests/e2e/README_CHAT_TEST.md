# AI Chatbot Test - Retry Logic & Streaming

## Purpose

This test script specifically verifies:
1. ✅ `/chat_stream` endpoint (streaming chat with SSE)
2. ✅ `/chat` endpoint (non-streaming chat)
3. ✅ Retry logic behavior for Modal cold starts
4. ✅ Response times and token streaming
5. ✅ Error handling (502/503/504)

## Running the Test

```bash
# From project root
cd tests/e2e
python3 test_chat_retry.py
```

## Requirements

- `SUPABASE_JWT_SECRET` environment variable set
- `PyJWT` installed: `pip install PyJWT`
- Backend deployed and accessible

## What It Tests

### 1. Authentication
- Creates test JWT token
- Verifies token is valid

### 2. Backend Health
- Checks `/health` endpoint
- Checks `/readiness` endpoint

### 3. Non-Streaming Chat
- Tests `/chat` endpoint
- Measures response time
- Verifies answer quality
- Detects cold starts (>30s response)

### 4. Streaming Chat (Main Test)
- Tests `/chat_stream` endpoint with SSE
- Parses streaming tokens
- Measures total response time
- Verifies retry behavior
- Tests multiple queries to verify warm-up

### 5. Retry Logic Verification
- Explicitly tests error handling
- Verifies 502/503/504 are retryable
- Confirms frontend retry logic would work

## Expected Results

### Cold Start Scenario
- First request: 10-30 seconds (Modal cold start)
- Subsequent requests: <5 seconds (Modal warm)
- Retry logic should handle 502/503 automatically

### Warm Scenario
- All requests: <5 seconds
- No retries needed
- Smooth streaming experience

## Output

Results are saved to: `tests/results/chat_test_results.json`

Includes:
- Test status (PASS/FAIL/WARN)
- Response times
- Token counts
- Answer previews
- Retry detection

## Notes

- Test uses same test user as E2E test (`john-doe-e2e-test`)
- Waits for backend wake-up (Render free tier)
- Handles timeouts gracefully
- Provides detailed logging for debugging

