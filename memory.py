from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select
import sqlalchemy as sa

from utils import get_logger
from rag import RAGService, TrainingLogModel, UserMemoryModel


logger = get_logger("memory")

DEFAULT_SUMMARY_COUNT = 10
MEMORY_SUMMARY_INTERVAL_HOURS = int(
    __import__("os").getenv("MEMORY_SUMMARY_INTERVAL_HOURS", "24")
)


PII_PATTERNS = [
    re.compile(r"[\w\.-]+@[\w\.-]+\.[A-Za-z]{2,}", re.IGNORECASE),  # emails
    re.compile(r"\+?\d[\d\s\-()]{7,}\d"),  # phone-like numbers
    re.compile(r"\b\d{3}-?\d{2}-?\d{4}\b"),  # SSN-like
]


def redact_pii(text: str) -> str:
    redacted = text
    for pat in PII_PATTERNS:
        redacted = pat.sub("[REDACTED]", redacted)
    return redacted


def _simple_summarize(texts: List[str], max_chars: int = 1200) -> str:
    if not texts:
        return ""
    joined = "\n".join(t.strip() for t in texts if t and t.strip())
    return joined[:max_chars]


def summarize_texts(rag_service: RAGService, texts: List[str]) -> str:
    # Prefer remote generation if configured
    joined = "\n\n".join(texts)
    try:
        if rag_service.config.gen_backend == "remote" and rag_service._remote_session and rag_service.config.remote_gen_url:
            prompt = (
                "Summarize the following user's recent training logs into 2-4 short sentences. "
                "Capture habits, goals, preferences, and recent achievements. Avoid PII.\n\n" + joined
            )
            payload = {
                "model": rag_service.config.hf_model_id,
                "prompt": prompt,
                "max_tokens": 256,
                "temperature": 0.1,
            }
            resp = rag_service._remote_session.post(rag_service.config.remote_gen_url, json=payload, timeout=rag_service.config.gen_timeout_ms / 1000.0)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and data.get("choices"):
                choice = data["choices"][0]
                if "text" in choice:
                    return str(choice["text"]).strip()
                if "message" in choice and "content" in choice["message"]:
                    return str(choice["message"]["content"]).strip()
            return _simple_summarize(texts)
    except Exception as e:  # pragma: no cover - robustness
        logger.warning("Remote summarization failed, falling back: %s", e)
    return _simple_summarize(texts)


def refresh_user_memory(rag_service: RAGService, user_id: str, n: int = DEFAULT_SUMMARY_COUNT) -> Dict[str, Any]:
    """Accumulate historical memory summaries instead of overwriting (deep memory)."""
    with rag_service.SessionLocal() as session:
        # Fetch last n logs
        stmt = (
            select(TrainingLogModel)
            .where(TrainingLogModel.user_id == user_id)
            .order_by(TrainingLogModel.occurred_at.desc())
            .limit(n)
        )
        rows = session.execute(stmt).scalars().all()
        texts = [r.notes for r in rows if r.notes]
        if not texts:
            return {"user_id": user_id, "updated": False, "reason": "no logs"}

        # Get date range of logs being summarized
        first_log_date = rows[-1].occurred_at.isoformat() if rows[-1].occurred_at else None
        last_log_date = rows[0].occurred_at.isoformat() if rows[0].occurred_at else None

        summary = summarize_texts(rag_service, texts)
        summary = redact_pii(summary)
        emb = rag_service._embed([summary])[0].tolist()

        # Always create NEW summary (accumulate history instead of overwriting)
        with session.begin():
            mem = UserMemoryModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                summary=summary,
                embedding=emb,
                source="auto_summary",
                meta_data={
                    "redacted": True,
                    "window_size": n,  # Number of logs summarized
                    "log_count": len(texts),
                    "date_range_start": first_log_date,
                    "date_range_end": last_log_date,
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
            )
            session.add(mem)
            mem_id = mem.id
    return {"user_id": user_id, "updated": True, "memory_id": mem_id, "summary": summary}


def refresh_all_users_memories(rag_service: RAGService, n: int = DEFAULT_SUMMARY_COUNT) -> Dict[str, Any]:
    """Refresh memories for users who have new logs since their last summary or within interval."""
    updated = 0
    scanned = 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MEMORY_SUMMARY_INTERVAL_HOURS)
    with rag_service.SessionLocal() as session:
        # Users with recent logs
        users_with_logs = session.execute(
            sa.text(
                """
                SELECT DISTINCT user_id
                FROM training_logs
                WHERE occurred_at >= :cutoff
                """
            ),
            {"cutoff": cutoff},
        ).fetchall()
        user_ids = [row[0] for row in users_with_logs]

    for uid in user_ids:
        scanned += 1
        try:
            res = refresh_user_memory(rag_service, uid, n=n)
            if res.get("updated"):
                updated += 1
        except Exception as e:  # pragma: no cover - robustness
            logger.error("Failed to refresh memory for %s: %s", uid, e)

    return {"scanned": scanned, "updated": updated}
