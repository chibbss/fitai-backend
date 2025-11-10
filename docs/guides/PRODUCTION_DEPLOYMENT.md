# Production Deployment Guide - FitAI Backend

## Overview

FitAI backend is now fully configured for production deployment with remote Modal services. All heavy model workloads (embeddings, generation, reranking) are offloaded to Modal, allowing the Render backend to scale efficiently.

## Architecture

```
┌─────────────────┐
│  Render Backend │  (FastAPI - Lightweight, no models)
│  (fitai-api)    │
└────────┬────────┘
         │
         ├───► Modal vLLM Service (Generation + Reranking)
         │     └─> meta-llama/Meta-Llama-3.1-8B-Instruct
         │
         └───► Modal Embed Service (Embeddings)
               └─> sentence-transformers/all-MiniLM-L6-v2
```

## Prerequisites

1. **Render Account** - For backend hosting
2. **Modal Account** - For model inference services
3. **PostgreSQL Database** - With pgvector extension (Render provides this)
4. **Supabase Account** - For authentication

## Deployment Steps

### 1. Deploy Modal Services

#### Deploy Generation Service (vLLM)

```bash
cd infra
modal deploy modal_vllm.py
```

This creates the `fitai-vllm` Modal app with:
- Generation endpoint: `/v1/chat/completions`
- Reranking endpoint: `/rerank`
- Health check: `/health`

**Get the URL:**
```bash
modal app list
# Note the URL: https://your-username--fitai-vllm-serve.modal.run
```

#### Deploy Embedding Service

```bash
cd infra
modal deploy embed_service_modal.py
```

This creates the `fitai-embed` Modal app with:
- Embedding endpoint: `/embed`
- Health check: `/health`

**Get the URL:**
```bash
modal app list
# Note the URL: https://your-username--fitai-embed-serve.modal.run
```

### 2. Configure Render Environment Variables

In your Render dashboard, set the following environment variables:

```bash
# Backend Configuration
ENVIRONMENT=production
GEN_BACKEND=remote
EMBEDDING_PROVIDER=modal
RERANKER_BACKEND=remote

# Modal Service URLs (from step 1)
REMOTE_GEN_URL=https://your-username--fitai-vllm-serve.modal.run/v1/chat/completions
REMOTE_EMBED_URL=https://your-username--fitai-embed-serve.modal.run/embed
RERANKER_REMOTE_URL=https://your-username--fitai-vllm-serve.modal.run/rerank

# Database (auto-configured by Render)
DATABASE_URL=<auto-set-by-render>

# Authentication
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>

# HuggingFace (for model access)
HF_TOKEN=<your-hf-token>
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct

# Optional: Database Connection Pooling
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600

# Optional: Observability
SENTRY_DSN=<your-sentry-dsn>
LOG_LEVEL=INFO
LOG_PII_REDACTION_ENABLED=1
```

### 3. Deploy to Render

The `render.yaml` file is already configured. Simply:

1. Connect your GitHub repository to Render
2. Render will automatically detect `render.yaml` and create the service
3. The service will deploy automatically on every push to main

### 4. Verify Deployment

#### Check Backend Health

```bash
curl https://fitai-api.onrender.com/health
# Expected: {"status":"ok"}
```

#### Check Readiness

```bash
curl https://fitai-api.onrender.com/readiness
# Expected: {"ok":true,"db_ok":true,"gen_ok":true}
```

#### Test Modal Services

```bash
# Test generation service
curl https://your-username--fitai-vllm-serve.modal.run/health

# Test embedding service
curl https://your-username--fitai-embed-serve.modal.run/health
```

## Production Optimizations

### Connection Pooling

The backend uses SQLAlchemy connection pooling:
- **Pool Size**: 10 connections per process
- **Max Overflow**: 20 additional connections
- **Pool Timeout**: 30 seconds
- **Pool Recycle**: 3600 seconds (1 hour)

Configure via environment variables if needed.

### Request Retry Logic

Remote API calls (Modal services) include automatic retries:
- **Total Retries**: 3 attempts
- **Backoff Factor**: Exponential backoff (0.3s, 0.6s, 1.2s)
- **Retry Status Codes**: 429, 500, 502, 503, 504
- **Connection Pooling**: 10 pools, 20 connections per pool

### Non-Blocking Startup

The backend starts accepting requests immediately while models initialize in the background. This ensures:
- Fast health check responses
- No startup blocking
- Graceful degradation if Modal services are unavailable

## Scaling Considerations

### Render Backend

- **Free Tier**: 512MB RAM, 1 worker
- **Starter Tier**: 512MB RAM, can scale workers
- **Standard Tier**: 2GB+ RAM, auto-scaling

**Recommendation**: Start with Starter tier for production.

### Modal Services

- **Generation Service**: A10G GPU (auto-scales based on demand)
- **Embedding Service**: T4 GPU (cost-effective, auto-scales)

**Cost Optimization**:
- Services scale to zero when idle
- Pay only for actual inference time
- Container idle timeout: 60 seconds

## Monitoring

### Health Checks

- `/health` - Basic health check (always responds)
- `/readiness` - Readiness check (checks DB and Modal services)

### Metrics

- `/metrics` - Prometheus metrics (if configured)
- Sentry integration for error tracking
- Logs available in Render dashboard

## Troubleshooting

### Service Won't Start

1. Check Render logs for errors
2. Verify environment variables are set correctly
3. Ensure Modal services are deployed and accessible
4. Check database connection string

### Modal Services Unavailable

1. Verify Modal services are deployed: `modal app list`
2. Check Modal service logs: `modal app logs fitai-vllm`
3. Verify URLs are correct in environment variables
4. Check Modal account has sufficient credits

### Database Connection Issues

1. Verify `DATABASE_URL` is set correctly
2. Check database is linked in Render dashboard
3. Verify pgvector extension is installed
4. Run migrations: `alembic upgrade head`

## Cost Estimation

### Render

- **Starter Plan**: $7/month (512MB RAM)
- **Standard Plan**: $25/month (2GB RAM)

### Modal

- **Generation Service**: ~$0.10-0.50 per 1000 requests (depending on model size)
- **Embedding Service**: ~$0.01-0.05 per 1000 requests

**Total Estimated Cost**: $10-30/month for moderate traffic (1000-10000 requests/day)

## Next Steps

1. Set up monitoring and alerts (Sentry, Datadog, etc.)
2. Configure CDN for static assets
3. Set up backup strategy for database
4. Implement rate limiting for production
5. Set up CI/CD pipeline for automated deployments

## Support

For issues or questions:
- Check Render logs: Render Dashboard → Logs
- Check Modal logs: `modal app logs <app-name>`
- Review application logs in Render dashboard

