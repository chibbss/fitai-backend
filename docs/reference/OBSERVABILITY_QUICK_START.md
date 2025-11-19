# Observability Quick Start Checklist

## ✅ What's Already Implemented

- ✅ Request/response timing middleware (logs all requests with duration)
- ✅ Sentry integration (ready, just needs DSN)
- ✅ Prometheus metrics endpoint (`/metrics`)
- ✅ Correlation IDs (`X-Request-ID` header)
- ✅ Modal call timing wrapper (ready for when Modal is deployed)
- ✅ Production-ready logging with PII redaction
- ✅ Error context logging (user ID, correlation ID, endpoint)

## 🔧 What You Need to Hook Up

### 1. Sentry (5 minutes)

**Get DSN:**
1. Go to https://sentry.io → Sign up (free)
2. Create project → Python → FastAPI
3. Copy your DSN

**Add to Render:**
1. Render Dashboard → `fitai-api` → Environment
2. Add: `SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
3. (Optional) Add: `SENTRY_TRACES=0.1` (10% sampling)
4. Redeploy service

**Verify:**
- Check Render logs for: "Sentry initialized for error tracking"
- Make a test request that errors → Check Sentry dashboard

### 2. Uptime Monitoring (5 minutes)

**Option A: UptimeRobot (Recommended)**
1. Sign up at https://uptimerobot.com (free)
2. Add monitor:
   - URL: `https://your-render-app.onrender.com/health`
   - Interval: 5 minutes
   - Alert: Your email
3. Add second monitor:
   - URL: `https://your-render-app.onrender.com/readiness`
   - Expected: `{"ok":true,"db_ok":true,"gen_ok":true}`

**Option B: Render Built-in**
- Go to Render Dashboard → Service → Metrics
- View uptime stats (already available)

### 3. Modal Health Checks (When Modal is Deployed)

Once Modal services are live (Nov 20):
1. Test endpoints:
   ```bash
   curl https://your-username--fitai-vllm-serve.modal.run/health
   curl https://your-username--fitai-embed-serve.modal.run/health
   ```
2. Add to uptime monitoring (same as step 2)

## 📊 What You'll See

### In Logs (Render Dashboard)

```
INFO main - Request: POST /chat_stream -> 200 (duration=234.56ms, correlation_id=abc123)
INFO RAGService - Modal embed call succeeded (duration=45.23ms, url=https://...)
WARNING main - Request: GET /workouts/calendar -> 200 (duration=1234.56ms, correlation_id=def456)
```

### In Sentry (When Configured)

- Real-time error tracking
- Stack traces with context
- User ID and correlation ID attached
- Performance monitoring for slow requests

### In Uptime Monitoring

- Service availability percentage
- Response time trends
- Alert notifications when down

## 🚀 Testing

After setting up Sentry:

1. **Test normal request:**
   ```bash
   curl https://your-app.onrender.com/health
   ```
   - Should see timing log in Render logs

2. **Test error (optional):**
   - Trigger an error endpoint
   - Check Sentry dashboard for error report

3. **Verify correlation IDs:**
   ```bash
   curl -H "X-Request-ID: test-123" https://your-app.onrender.com/health
   ```
   - Check logs for `correlation_id=test-123`

## 📝 Next Steps

1. ✅ Set up Sentry DSN in Render
2. ✅ Set up uptime monitoring
3. ⏳ Wait for Modal deployment (Nov 20)
4. ⏳ Add Modal health checks to monitoring
5. ⏳ Review logs/metrics after 24 hours

## 🆘 Troubleshooting

**No timing logs?**
- Check `LOG_LEVEL=INFO` in Render environment
- Verify middleware is loaded (check startup logs)

**Sentry not working?**
- Verify DSN format (starts with `https://`)
- Check for "Sentry initialized" in startup logs
- Ensure Sentry project is set to Python/FastAPI

**Questions?**
- See full guide: `docs/guides/OBSERVABILITY_SETUP.md`

