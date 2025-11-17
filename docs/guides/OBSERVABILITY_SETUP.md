# Observability & Alerting Setup Guide

This guide covers setting up production-ready observability for FitAI, including error tracking, performance monitoring, and uptime alerts.

## Overview

FitAI includes built-in observability features:

- **Sentry**: Error tracking and performance monitoring
- **Prometheus Metrics**: `/metrics` endpoint for scraping
- **Request Timing**: Automatic logging of request duration
- **Modal Call Tracking**: Timing and error logging for remote AI services
- **Correlation IDs**: Request tracing via `X-Request-ID` header

## 1. Sentry Setup

### Get a Sentry DSN (Free Tier)

1. Go to [sentry.io](https://sentry.io) and sign up (free tier available)
2. Create a new project:
   - **Platform**: Python
   - **Framework**: FastAPI
3. Copy your **DSN** (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

### Configure in Render

1. Go to your `fitai-api` service in Render Dashboard
2. Navigate to **Environment** tab
3. Add environment variable:
   ```
   SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```
4. (Optional) Configure sampling rate:
   ```
   SENTRY_TRACES=0.1  # 10% of requests traced (default)
   ```
5. (Optional) Set release version:
   ```
   SENTRY_RELEASE=4c0db4d9  # Git commit hash
   ```

### What Gets Tracked

- **All exceptions** with full stack traces
- **Request context**: User ID, correlation ID, endpoint path
- **Performance**: Slow requests (>1s) automatically tracked
- **Environment**: Automatically tagged as `production` or `development`

### Viewing Errors

- Go to your Sentry project dashboard
- Errors appear in real-time with:
  - Full stack trace
  - Request details (method, path, headers)
  - User context (if authenticated)
  - Correlation ID for tracing

## 2. Request Timing & Logging

### Automatic Features

All requests are automatically logged with:
- **Duration** (in milliseconds)
- **Correlation ID** (`X-Request-ID` header)
- **User ID** (if authenticated)
- **Status code**

### Log Levels

- **INFO**: Normal requests (<1s, status 200-399)
- **WARNING**: Slow requests (>1s) or client errors (400-499)
- **ERROR**: Server errors (500+) or exceptions

### Response Headers

All responses include:
```
X-Response-Time-Ms: 123.45
```

### Example Logs

```
2025-11-14T10:30:15 INFO main - Request: POST /chat_stream -> 200 (duration=234.56ms, correlation_id=abc123)
2025-11-14T10:30:20 WARNING main - Request: GET /workouts/calendar -> 200 (duration=1234.56ms, correlation_id=def456, user_id=user-123)
2025-11-14T10:30:25 ERROR main - Request failed: POST /chat -> 500 (duration=567.89ms, correlation_id=ghi789, user_id=user-123)
```

## 3. Modal Service Monitoring

### Automatic Tracking

When Modal services are deployed, all calls are automatically tracked:

- **Embedding calls**: Timing and success/failure
- **Generation calls**: Timing and fallback triggers
- **Reranker calls**: Timing and performance

### Log Format

```
INFO RAGService - Modal embed call succeeded (duration=45.23ms, url=https://...)
ERROR RAGService - Modal generation call failed (duration=5000.00ms, url=https://..., error=Timeout)
WARNING RAGService - Falling back to local generation after Modal failure
```

### Fallback Logging

When Modal calls fail and fallback to local services:
- Warning logged with fallback reason
- Error logged if fallback also fails
- Full context preserved for debugging

## 4. Uptime Monitoring

### Option 1: UptimeRobot (Free)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add a new monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://your-render-app.onrender.com/health`
   - **Interval**: 5 minutes
   - **Alert Contacts**: Your email/SMS
3. Add a second monitor for readiness:
   - **URL**: `https://your-render-app.onrender.com/readiness`
   - **Expected**: `{"ok":true,"db_ok":true,"gen_ok":true}`

### Option 2: Healthchecks.io (Free)

1. Sign up at [healthchecks.io](https://healthchecks.io)
2. Create a check:
   - **Name**: FitAI Health
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
   - **URL**: `https://your-render-app.onrender.com/health`
3. Configure alerts (email, Slack, etc.)

### Option 3: Render Built-in

Render provides basic health monitoring:
- Go to your service → **Metrics** tab
- View uptime and response times
- Set up alerts in Render dashboard

### Option 4: Custom Script (Cron)

```bash
#!/bin/bash
# check_fitai.sh
RESPONSE=$(curl -s https://your-render-app.onrender.com/readiness)
if [[ $RESPONSE != *"\"ok\":true"* ]]; then
    echo "FitAI is down!" | mail -s "FitAI Alert" your@email.com
fi
```

Run via cron:
```bash
*/5 * * * * /path/to/check_fitai.sh
```

## 5. Modal Health Checks (When Deployed)

Once Modal services are live, you can monitor them:

### Check Generation Service

```bash
curl https://your-username--fitai-vllm-serve.modal.run/health
# Expected: {"status":"ok","model":"meta-llama/Meta-Llama-3.1-8B-Instruct"}
```

### Check Embedding Service

```bash
curl https://your-username--fitai-embed-serve.modal.run/health
# Expected: {"status":"ok"}
```

### Automated Monitoring

Add these to your uptime monitoring:
- Generation service health endpoint
- Embedding service health endpoint
- Alert if either returns non-200 status

## 6. Prometheus Metrics

### Endpoint

Metrics are available at:
```
GET /metrics
```

### Scraping

If you have a Prometheus instance:

```yaml
scrape_configs:
  - job_name: 'fitai-api'
    scrape_interval: 15s
    static_configs:
      - targets: ['your-render-app.onrender.com']
        metrics_path: '/metrics'
```

### Key Metrics

- `http_requests_total`: Total request count
- `http_request_duration_seconds`: Request duration histogram
- `http_request_size_bytes`: Request size
- `http_response_size_bytes`: Response size

## 7. Production Logging

### Log Format

All logs include:
- **Timestamp**: ISO 8601 format
- **Level**: INFO, WARNING, ERROR
- **Logger Name**: Component name (e.g., `main`, `RAGService`)
- **Message**: PII-redacted log message

### PII Redaction

Enabled by default (`LOG_PII_REDACTION_ENABLED=1`):
- Email addresses → `[REDACTED]`
- Phone numbers → `[REDACTED]`
- User IDs in logs → `[REDACTED]`

### Structured Logging

For production, consider JSON logging:

```python
# In utils.py, add JSON formatter option
import json
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": getattr(record, "correlation_id", None),
        })
```

## 8. Alerting Best Practices

### Critical Alerts

Set up alerts for:
- **Service down**: `/readiness` returns `ok:false`
- **Database down**: `db_ok:false` in readiness check
- **High error rate**: >5% of requests return 500
- **Slow responses**: >2s average response time

### Warning Alerts

Monitor but don't page:
- **Slow requests**: Individual requests >1s
- **Modal failures**: Modal service calls failing
- **High latency**: Average response time >500ms

### Alert Channels

- **Email**: For non-critical alerts
- **SMS/PagerDuty**: For critical outages
- **Slack/Discord**: For team notifications

## 9. Troubleshooting

### Sentry Not Receiving Events

1. Check `SENTRY_DSN` is set correctly
2. Verify DSN format (should start with `https://`)
3. Check Sentry project settings (correct platform selected)
4. Look for "Sentry initialized" log on startup

### No Request Timing Logs

1. Verify middleware is added (should see in startup logs)
2. Check log level (set `LOG_LEVEL=INFO` or lower)
3. Verify correlation ID middleware is working

### Modal Calls Not Logged

1. Ensure Modal services are deployed
2. Check `REMOTE_GEN_URL`, `REMOTE_EMBED_URL` are set
3. Verify `_call_modal_with_timing` wrapper is used (will be added in future updates)

## 10. Next Steps

Once observability is set up:

1. **Monitor for 24-48 hours** to establish baseline
2. **Set up dashboards** (Grafana, Datadog, or Sentry's built-in)
3. **Create runbooks** for common alerts
4. **Review weekly** to identify trends and optimization opportunities

## Support

For issues or questions:
- Check Render logs: Dashboard → Service → Logs
- Check Sentry: Dashboard → Issues
- Review this guide for configuration steps

