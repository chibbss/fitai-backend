# Migrations and Scheduler

## Alembic

- Set `DATABASE_URL` in your environment or `.env`.
- Generate a migration (if you add models):

```bash
alembic revision --autogenerate -m "message"
```

- Apply migrations:

```bash
alembic upgrade head
```

This repo includes a migration to create `user_memory` with a `vector(384)` column and indexes (HNSW for cosine).

## Scheduler (dev)

- APScheduler runs in-process when `ENABLE_SCHEDULER=1` (default) and triggers nightly memory refresh (cron hour via `MEMORY_CRON_HOUR`, default 3).

## Production workers (recommended)

- Use `tasks.py` with Celery or your preferred scheduler (Redis/Cloud Tasks/Modal). Example Celery command:

```bash
celery -A tasks.app worker --loglevel=INFO
```

- Or call the stub functions directly:

```python
from tasks import refresh_all, refresh_user
refresh_all()
```
