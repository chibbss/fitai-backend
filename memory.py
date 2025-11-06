from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select
import sqlalchemy as sa

from utils import get_logger
from rag import RAGService, TrainingLogModel, UserMemoryModel, ChatMessageModel, WorkoutSessionModel


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


def summarize_texts(rag_service: RAGService, texts: List[str], summary_type: str = "workout") -> str:
    """Summarize texts - supports both workout logs and conversations."""
    # Prefer remote generation if configured
    joined = "\n\n".join(texts)
    try:
        if rag_service.config.gen_backend == "remote" and rag_service._remote_session and rag_service.config.remote_gen_url:
            if summary_type == "conversation":
                prompt = (
                    "Summarize the following conversation with the user into 2-4 short sentences. "
                    "Capture preferences, feelings, goals, personality traits, injuries/concerns, and anything personal they mentioned. "
                    "Focus on what makes them unique. Avoid PII.\n\n" + joined
                )
            else:  # workout
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


def refresh_user_conversation_memory(rag_service: RAGService, user_id: str, days: int = 7) -> Dict[str, Any]:
    """Generate conversation summary from chat messages (weekly summaries for deep memory)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with rag_service.SessionLocal() as session:
        # Fetch all chat messages from last N days (all sessions)
        stmt = (
            select(ChatMessageModel)
            .where(ChatMessageModel.user_id == user_id)
            .where(ChatMessageModel.created_at >= cutoff)
            .order_by(ChatMessageModel.created_at.asc())
        )
        rows = session.execute(stmt).scalars().all()
        
        if not rows:
            return {"user_id": user_id, "updated": False, "reason": "no conversations"}
        
        # Format conversations: "user: ... assistant: ..."
        conversation_texts = []
        for row in rows:
            role_prefix = "user" if row.role == "user" else "assistant"
            conversation_texts.append(f"{role_prefix}: {row.content}")
        
        # Get date range
        first_msg_date = rows[0].created_at.isoformat() if rows[0].created_at else None
        last_msg_date = rows[-1].created_at.isoformat() if rows[-1].created_at else None
        
        summary = summarize_texts(rag_service, conversation_texts, summary_type="conversation")
        summary = redact_pii(summary)
        emb = rag_service._embed([summary])[0].tolist()
        
        # Always create NEW summary (accumulate history)
        mem = UserMemoryModel(
            id=str(uuid.uuid4()),
            user_id=user_id,
            summary=summary,
            embedding=emb,
            source="conversation_summary",
            meta_data={
                "redacted": True,
                "days": days,
                "message_count": len(rows),
                "date_range_start": first_msg_date,
                "date_range_end": last_msg_date,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
        )
        session.add(mem)
        session.commit()
        mem_id = mem.id
    return {"user_id": user_id, "updated": True, "memory_id": mem_id, "summary": summary}


def refresh_user_workout_memory(rag_service: RAGService, user_id: str, n: int = DEFAULT_SUMMARY_COUNT, milestone: Optional[int] = None) -> Dict[str, Any]:
    """Generate workout summary from training logs (monthly/milestone summaries for deep memory)."""
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

        summary = summarize_texts(rag_service, texts, summary_type="workout")
        summary = redact_pii(summary)
        emb = rag_service._embed([summary])[0].tolist()

        # Always create NEW summary (accumulate history instead of overwriting)
        meta_data = {
            "redacted": True,
            "window_size": n,  # Number of logs summarized
            "log_count": len(texts),
            "date_range_start": first_log_date,
            "date_range_end": last_log_date,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        if milestone:
            meta_data["milestone"] = milestone
        
        mem = UserMemoryModel(
            id=str(uuid.uuid4()),
            user_id=user_id,
            summary=summary,
            embedding=emb,
            source="workout_summary",
            meta_data=meta_data,
        )
        session.add(mem)
        session.commit()
        mem_id = mem.id
    return {"user_id": user_id, "updated": True, "memory_id": mem_id, "summary": summary}


# Keep old function name for backward compatibility
def refresh_user_memory(rag_service: RAGService, user_id: str, n: int = DEFAULT_SUMMARY_COUNT) -> Dict[str, Any]:
    """Backward compatibility wrapper - calls workout memory refresh."""
    return refresh_user_workout_memory(rag_service, user_id, n)


def should_generate_conversation_summary(rag_service: RAGService, user_id: str, days: int = 7) -> bool:
    """Check if conversation summary should be generated (weekly check)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with rag_service.SessionLocal() as session:
        # Check if there's a recent conversation summary
        stmt = (
            select(UserMemoryModel)
            .where(UserMemoryModel.user_id == user_id)
            .where(UserMemoryModel.source == "conversation_summary")
            .order_by(UserMemoryModel.created_at.desc())
            .limit(1)
        )
        recent_summary = session.execute(stmt).scalar_one_or_none()
        
        if not recent_summary:
            # No summary exists, check if there are conversations to summarize
            msg_stmt = (
                select(ChatMessageModel)
                .where(ChatMessageModel.user_id == user_id)
                .where(ChatMessageModel.created_at >= cutoff)
                .limit(1)
            )
            has_recent_messages = session.execute(msg_stmt).scalar_one_or_none() is not None
            return has_recent_messages
        
        # Check if last summary is older than the interval
        if recent_summary.created_at < cutoff:
            return True
        
        return False


def should_generate_workout_summary(rag_service: RAGService, user_id: str, check_milestone: bool = True) -> tuple[bool, Optional[int]]:
    """
    Check if workout summary should be generated (monthly or milestone).
    Returns (should_generate, milestone_count) where milestone_count is None if monthly trigger.
    """
    with rag_service.SessionLocal() as session:
        # Check total workout count for milestones
        total_workouts = session.execute(
            select(WorkoutSessionModel).where(WorkoutSessionModel.user_id == user_id)
        ).scalars().all()
        total_count = len(total_workouts)
        
        # Check milestones: 25, 50, 100, 200, etc.
        milestones = [25, 50, 100, 200, 500]
        if check_milestone:
            for milestone in milestones:
                # Check if we just hit this milestone (within last 5 workouts)
                if total_count >= milestone and total_count < milestone + 5:
                    # Check if we already have a summary for this milestone
                    stmt = (
                        select(UserMemoryModel)
                        .where(UserMemoryModel.user_id == user_id)
                        .where(UserMemoryModel.source == "workout_summary")
                        .order_by(UserMemoryModel.created_at.desc())
                    )
                    existing_summaries = session.execute(stmt).scalars().all()
                    # Check if any existing summary has this milestone in metadata
                    has_milestone_summary = False
                    for summary in existing_summaries:
                        if summary.meta_data and summary.meta_data.get("milestone") == milestone:
                            has_milestone_summary = True
                            break
                    if not has_milestone_summary:
                        return (True, milestone)
        
        # Check monthly interval (30 days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        stmt = (
            select(UserMemoryModel)
            .where(UserMemoryModel.user_id == user_id)
            .where(UserMemoryModel.source == "workout_summary")
            .order_by(UserMemoryModel.created_at.desc())
            .limit(1)
        )
        recent_summary = session.execute(stmt).scalar_one_or_none()
        
        if not recent_summary:
            # No summary exists, check if there are workouts to summarize
            if total_count > 0:
                return (True, None)
            return (False, None)
        
        # Check if last summary is older than 30 days
        if recent_summary.created_at < cutoff:
            return (True, None)
        
        return (False, None)


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
            res = refresh_user_workout_memory(rag_service, uid, n=n)
            if res.get("updated"):
                updated += 1
        except Exception as e:  # pragma: no cover - robustness
            logger.error("Failed to refresh memory for %s: %s", uid, e)

    return {"scanned": scanned, "updated": updated}
