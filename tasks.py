from __future__ import annotations

from typing import Any, Dict

try:
    from celery import Celery
except Exception:  # pragma: no cover - Celery optional
    Celery = None  # type: ignore

from rag import RAGService
from memory import refresh_all_users_memories, refresh_user_memory


rag_service = RAGService()
rag_service.startup()


if Celery:
    app = Celery("fitai_tasks")
    app.conf.update(broker_url="redis://localhost:6379/0", result_backend="redis://localhost:6379/0")

    @app.task
    def refresh_all(n: int = 10) -> Dict[str, Any]:
        return refresh_all_users_memories(rag_service, n=n)

    @app.task
    def refresh_user(user_id: str, n: int = 10) -> Dict[str, Any]:
        return refresh_user_memory(rag_service, user_id=user_id, n=n)
else:
    # Fallback stubs
    def refresh_all(n: int = 10) -> Dict[str, Any]:  # type: ignore
        return refresh_all_users_memories(rag_service, n=n)

    def refresh_user(user_id: str, n: int = 10) -> Dict[str, Any]:  # type: ignore
        return refresh_user_memory(rag_service, user_id=user_id, n=n)
