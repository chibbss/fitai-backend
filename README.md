# FitAI Backend

> **Production-Ready AI Fitness Coach Backend**  
> A world-class RAG-powered fitness assistant with deep memory, workout tracking, and personalized insights.

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.117-green.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue.svg)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-0.8.1-orange.svg)](https://github.com/pgvector/pgvector)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

---

## Overview

FitAI is an AI-powered fitness coaching platform that combines:
- **Deep Memory System**: Remembers every conversation, workout, and user preference
- **RAG-Powered Chat**: Context-aware AI coach powered by Llama 3 with a growing fitness knowledge base
- **Workout Tracking**: Structured logging with instant insights and progress analysis
- **Personalized Stats**: Comprehensive analytics with calendar visualization

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **AI Chat** | Llama 3-powered fitness assistant with RAG | ✅ Production Ready |
| **Workout Logger** | Structured exercise tracking (sets, reps, weights) | ✅ Production Ready |
| **Instant Insights** | PR detection, progress tracking, recovery alerts | ✅ Production Ready |
| **Calendar & Stats** | Visual progress tracking with comprehensive metrics | ✅ Production Ready |
| **Deep Memory** | Persistent conversation history and user patterns | ✅ Production Ready |
| **Voice Input** | Speech-to-text for hands-free logging | ✅ Production Ready(paywall) |

---

## Quick Start

### Prerequisites

- Python 3.10+
- PostgreSQL 13+ with pgvector extension
- Supabase account (for authentication)

### Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd fitai-backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your configuration (see Configuration section)

# 5. Set up database
# Option A: Local PostgreSQL with Docker
docker run --name fitai-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fitai \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16

# Option B: Use Supabase/Neon/RDS (enable pgvector extension)

# 6. Run migrations
alembic upgrade head

# 7. Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Verify Installation

```bash
# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# API documentation
open http://localhost:8000/docs
```

---

## Architecture

```
fitai-backend/
├── main.py                 # FastAPI application & endpoints
├── rag.py                  # RAG service, embeddings, retrieval
├── memory.py               # Deep memory system & summarization
├── auth.py                 # Supabase JWT authentication
├── utils.py                # Configuration & utilities
├── migrations/             # Alembic database migrations
│   └── versions/           # Migration files
├── infra/                  # Infrastructure services
│   ├── modal_vllm.py       # Remote LLM service (Modal)
│   ├── embed_service_modal.py
│   └── rerank_service_modal.py
├── scripts/                # Utility scripts
│   ├── ingest_local_docs.py
│   └── verify_phase1.py
└── data/                   # Knowledge base documents
    └── pdfs/
```

### Technology Stack

- **Framework**: FastAPI (async, high-performance)
- **Database**: PostgreSQL 16 + pgvector (vector similarity search)
- **Authentication**: Supabase JWT
- **LLM**: Llama 3.1 8B Instruct (via vLLM/Modal or local)
- **Embeddings**: SentenceTransformers (all-MiniLM-L6-v2)
- **Reranking**: Cross-encoder (ms-marco-MiniLM-L-6-v2)
- **Monitoring**: Sentry, Prometheus, RAGAS metrics

---

## Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql+psycopg2://user:password@host:5432/fitai

# Supabase Authentication
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# LLM Configuration
HF_MODEL_ID=meta-llama/Meta-Llama-3.1-8B-Instruct
GEN_BACKEND=remote  # or "local"
REMOTE_GEN_URL=https://your-vllm.modal.run/v1/completions
```

### Optional Configuration

```bash
# Embeddings
EMBEDDING_PROVIDER=local  # or "modal" or "openai"
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2

# Reranking
RERANKER_BACKEND=local  # or "remote" or "none"
RERANKER_MODEL_NAME=cross-encoder/ms-marco-MiniLM-L-6-v2

# Performance
DEVICE=auto  # auto | cpu | cuda | mps
TOP_K=5
CHUNK_SIZE_TOKENS=512
CHUNK_OVERLAP_TOKENS=64

# Monitoring
SENTRY_DSN=your-sentry-dsn
RAGAS_LOGGING_ENABLED=1
LOG_PII_REDACTION_ENABLED=1

# Production
ENVIRONMENT=production
ENABLE_SCHEDULER=1
```

See `.env.example` for complete configuration options.

---

## API Documentation

### Core Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Health check | ❌ |
| `POST` | `/chat` | AI chat (non-streaming) | ✅ |
| `POST` | `/chat_stream` | AI chat (SSE streaming) | ✅ |
| `POST` | `/log/workout` | Log structured workout | ✅ |
| `GET` | `/insights/{session_id}` | Get workout insights | ✅ |
| `GET` | `/workouts/calendar` | Get workout history | ✅ |
| `GET` | `/stats/{session_id}` | Get comprehensive stats | ✅ |
| `POST` | `/onboarding_step` | Progressive onboarding | ✅ |
| `GET` | `/users/{user_id}` | Get user profile | ✅ |
| `PUT` | `/users/{user_id}` | Update user profile | ✅ |
| `POST` | `/users/{user_id}/preload-context` | Pre-load user context | ✅ |

### Interactive API Docs

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI JSON**: `http://localhost:8000/openapi.json`

### Complete API Reference

**[Full API Documentation](./docs/reference/API_DOCUMENTATION.md)** - Comprehensive endpoint reference with examples

---

## Database Schema

### Core Tables

- **`users`**: User profiles, goals, metadata
- **`workout_sessions`**: Workout session metadata
- **`exercise_logs`**: Individual exercise tracking (sets, reps, weights)
- **`training_logs`**: Legacy text-based logs
- **`user_memory`**: AI-generated memory summaries
- **`chat_messages`**: Persistent conversation history
- **`documents`**: Knowledge base documents
- **`chunks`**: Document chunks with vector embeddings
- **`ragas_metrics`**: RAG quality metrics

### Migrations

```bash
# Check current version
alembic current

# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Rollback
alembic downgrade -1
```

---

## Security

### Authentication

All protected endpoints require Supabase JWT Bearer tokens:

```python
headers = {
    'Authorization': f'Bearer {supabase_token}',
    'Content-Type': 'application/json'
}
```

### Security Features

- ✅ **JWT Verification**: Supabase token validation
- ✅ **PII Redaction**: Automatic redaction in logs
- ✅ **TLS Enforcement**: HTTP → HTTPS redirect in production
- ✅ **Security Headers**: X-Frame-Options, CSP, HSTS
- ✅ **Rate Limiting**: Per-endpoint rate limits
- ✅ **Input Validation**: Pydantic models for all inputs
- ✅ **SQL Injection Protection**: SQLAlchemy ORM

---

## Monitoring & Observability

### Metrics

- **Prometheus**: `/metrics` endpoint
- **RAGAS Metrics**: Automatic logging of RAG quality
- **Performance**: Request timing, latency tracking

### Error Tracking

- **Sentry**: Automatic error tracking and alerting
- **Structured Logging**: JSON-formatted logs with correlation IDs

### Health Checks

```bash
# Basic health
curl http://localhost:8000/health

# Detailed metrics
curl http://localhost:8000/metrics
```

---

## Deployment

### Production Readiness

✅ **Status**: 98% Production Ready

- ✅ All core features implemented
- ✅ Security hardened
- ✅ Monitoring configured
- ✅ Database migrations ready
- ✅ Error handling comprehensive

### Deployment Options

#### Option 1: Render (Recommended for MVP)

**Pros**: Fastest setup, managed infrastructure, auto SSL  
**Cons**: Can be expensive at scale  
**Cost**: ~$14-45/month

**[Render Deployment Guide](./docs/guides/DEPLOYMENT_GUIDE.md#render-deployment)**

#### Option 2: Docker + Self-Hosted

**Pros**: Full control, cost-effective at scale  
**Cons**: More setup complexity  
**Cost**: ~$10-20/month (VPS)

**[Docker Deployment Guide](./docs/guides/DEPLOYMENT_GUIDE.md#docker-deployment)**

#### Option 3: AWS/Google Cloud

**Pros**: Enterprise-grade, highly scalable  
**Cons**: Complex setup  
**Cost**: Variable (pay-as-you-go)

### Pre-Deployment Checklist

- [ ] Run `alembic upgrade head` on production database
- [ ] Configure production environment variables
- [ ] Set `ENVIRONMENT=production`
- [ ] Enable pgvector extension on production DB
- [ ] Configure Supabase production credentials
- [ ] Set up monitoring (Sentry, Prometheus)
- [ ] Configure database backups
- [ ] Test all endpoints with production config
- [ ] Load testing (optional but recommended)

**[Complete Deployment Guide](./docs/guides/DEPLOYMENT_GUIDE.md)**

---

## Testing

### Manual Testing

```bash
# Create test token
source venv/bin/activate
python3 -c "from auth import create_test_token; print(create_test_token('test-user', 'premium'))"

# Test chat endpoint
export TOKEN="your-test-token"
curl -X POST http://localhost:8000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "How should I train for strength?"}'

# Test workout logging
curl -X POST http://localhost:8000/log/workout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_name": "Push Day",
    "exercises": [{
      "exercise_name": "Bench Press",
      "sets": 3,
      "reps": [10, 10, 8],
      "weights": ["60kg", "60kg", "65kg"]
    }]
  }'
```

### Verification Script

```bash
# Run verification
python scripts/verify_phase1.py
```

---

## Documentation

### Core Documentation

- **[API Documentation](./docs/reference/API_DOCUMENTATION.md)** - Complete API reference
- **[Deployment Guide](./docs/guides/DEPLOYMENT_GUIDE.md)** - Production deployment steps
- **[Onboarding Guide](./docs/guides/ONBOARDING_GUIDE.md)** - Frontend integration guide

### Technical Deep Dives

- **[Deep Memory Implementation](./docs/reference/DEEP_MEMORY_IMPLEMENTATION.md)** - Memory system architecture
- **[Workout Insights](./docs/reference/INSIGHTS_PHASE1_IMPLEMENTATION.md)** - Insights algorithm details

### Documentation Index

**[Complete Documentation Index](./docs/README.md)** - All documentation organized by category

---

## Development

### Project Structure

```
fitai-backend/
├── main.py              # FastAPI app, endpoints, middleware
├── rag.py              # RAG service (embeddings, retrieval, generation)
├── memory.py           # Memory summarization & retrieval
├── auth.py             # JWT authentication & authorization
├── utils.py            # Configuration management
├── migrations/         # Database migrations (Alembic)
├── infra/              # Infrastructure services (Modal)
├── scripts/            # Utility scripts
└── data/              # Knowledge base documents
```

### Running in Development

```bash
# Development mode (auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production mode (gunicorn)
gunicorn main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 60
```

### Code Quality

- **Type Hints**: Full type coverage
- **Linting**: No linting errors
- **Error Handling**: Comprehensive try/catch blocks
- **Documentation**: Docstrings on all methods
- **Testing**: Manual testing scripts included

---

## Key Features

### 1. Deep Memory System

FitAI remembers everything:
- **Conversation History**: Full chat history from onboarding
- **Memory Summaries**: AI-generated summaries of user patterns
- **Workout History**: Complete exercise and session history
- **User Patterns**: Long-term behavior analysis

**[Deep Memory Details](./docs/reference/DEEP_MEMORY_IMPLEMENTATION.md)**

### 2. RAG-Powered Chat

Context-aware AI coaching:
- **Knowledge Base**: Fitness science, protocols, guidelines
- **User Context**: Profile, goals, history, patterns
- **Semantic Retrieval**: Vector similarity search
- **Reranking**: Improved relevance with cross-encoder

### 3. Workout Tracking

Structured exercise logging:
- **Sets, Reps, Weights**: Detailed exercise tracking
- **Instant Insights**: PR detection, progress tracking
- **Recovery Alerts**: Overtraining prevention
- **Volume Analysis**: Advanced metrics

**[Insights Details](./docs/reference/INSIGHTS_PHASE1_IMPLEMENTATION.md)**

### 4. Comprehensive Stats

Data-driven progress tracking:
- **Consistency**: Streaks, frequency, sessions
- **Volume**: Total volume, trends, by muscle group
- **Progress**: PRs, strength progression, plateaus
- **Recovery**: Recovery days, rest patterns

---

## Contributing

### Development Workflow

1. Create feature branch
2. Implement changes
3. Test locally
4. Run migrations if schema changes
5. Submit pull request

### Code Standards

- Follow existing code style
- Add type hints
- Write docstrings
- Handle errors gracefully
- Test before submitting

---

## License

Proprietary - All rights reserved

---

## Support

### Common Issues

**Database Connection Errors**
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running
- Ensure pgvector extension is enabled

**Authentication Errors**
- Verify Supabase credentials
- Check JWT token is valid
- Ensure token hasn't expired

**Migration Errors**
- Check current migration version: `alembic current`
- Verify database permissions
- Review migration files

### Getting Help

- **Documentation**: Check relevant `.md` files
- **API Docs**: Visit `/docs` endpoint
- **Logs**: Check application logs for errors

---

## Roadmap

### Phase 1 ✅ (Complete)
- Core RAG chat
- Workout logging
- Instant insights
- Deep memory system
- Calendar & stats

### Phase 2 (Planned)
- Workout plan generation
- Nutrition tracking
- Social features
- Advanced analytics
- Mobile app optimization

---

## Acknowledgments

- **FastAPI** - Modern web framework
- **pgvector** - Vector similarity search
- **Supabase** - Authentication & database
- **Hugging Face** - Model hosting
- **SentenceTransformers** - Embeddings

---

**Built for fitness enthusiasts**

*Last Updated: November 2025*
