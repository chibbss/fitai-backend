"""workout sessions and ragas metrics

Revision ID: c8d4f2e1b9a3
Revises: b43c9a785a9e
Create Date: 2025-10-28 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


revision = "c8d4f2e1b9a3"
down_revision = "b43c9a785a9e"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    try:
        bind = op.get_bind()
        inspector = inspect(bind)
        indexes = inspector.get_indexes(table_name)
        return any(idx["name"] == index_name for idx in indexes)
    except Exception:
        return False


def create_index_if_not_exists(index_name: str, table_name: str, columns: list) -> None:
    """Create an index only if it doesn't already exist."""
    if not index_exists(table_name, index_name):
        try:
            op.create_index(index_name, table_name, columns)
        except Exception:
            # Index might have been created concurrently, ignore
            pass


def upgrade() -> None:
    # workout_sessions table
    if not table_exists("workout_sessions"):
    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_name", sa.String(), nullable=True),
        sa.Column("session_type", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_workout_sessions_user", "workout_sessions", ["user_id"])
    op.create_index("idx_workout_sessions_occurred", "workout_sessions", ["occurred_at"])
    op.create_index("idx_workout_sessions_type", "workout_sessions", ["session_type"])
    else:
        # Create indexes if they don't exist (table already exists)
        create_index_if_not_exists("idx_workout_sessions_user", "workout_sessions", ["user_id"])
        create_index_if_not_exists("idx_workout_sessions_occurred", "workout_sessions", ["occurred_at"])
        create_index_if_not_exists("idx_workout_sessions_type", "workout_sessions", ["session_type"])

    # exercise_logs table
    if not table_exists("exercise_logs"):
    op.create_table(
        "exercise_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), sa.ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exercise_name", sa.String(), nullable=False),
        sa.Column("exercise_category", sa.String(), nullable=True),
        sa.Column("sets", sa.Integer(), nullable=True),
        sa.Column("reps", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("weights", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("distance_meters", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_exercise_logs_session", "exercise_logs", ["session_id"])
    op.create_index("idx_exercise_logs_user", "exercise_logs", ["user_id"])
    op.create_index("idx_exercise_logs_name", "exercise_logs", ["exercise_name"])
    op.create_index("idx_exercise_logs_category", "exercise_logs", ["exercise_category"])
    else:
        # Create indexes if they don't exist (table already exists)
        create_index_if_not_exists("idx_exercise_logs_session", "exercise_logs", ["session_id"])
        create_index_if_not_exists("idx_exercise_logs_user", "exercise_logs", ["user_id"])
        create_index_if_not_exists("idx_exercise_logs_name", "exercise_logs", ["exercise_name"])
        create_index_if_not_exists("idx_exercise_logs_category", "exercise_logs", ["exercise_category"])

    # ragas_metrics table for RAG pipeline evaluation
    if not table_exists("ragas_metrics"):
    op.create_table(
        "ragas_metrics",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("kb_chunks_retrieved", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("logs_retrieved", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("memories_retrieved", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("retrieval_count", sa.Integer(), server_default=sa.text("0")),
        sa.Column("pre_rerank_scores", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("post_rerank_scores", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("rerank_changed_order", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("answer_length", sa.Integer(), server_default=sa.text("0")),
        sa.Column("has_citations", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("citation_count", sa.Integer(), server_default=sa.text("0")),
        sa.Column("retrieval_time_ms", sa.Float(), nullable=True),
        sa.Column("generation_time_ms", sa.Float(), nullable=True),
        sa.Column("total_time_ms", sa.Float(), nullable=True),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_ragas_metrics_user", "ragas_metrics", ["user_id"])
    op.create_index("idx_ragas_metrics_created", "ragas_metrics", ["created_at"])
    else:
        # Create indexes if they don't exist (table already exists)
        create_index_if_not_exists("idx_ragas_metrics_user", "ragas_metrics", ["user_id"])
        create_index_if_not_exists("idx_ragas_metrics_created", "ragas_metrics", ["created_at"])


def downgrade() -> None:
    op.drop_table("ragas_metrics")
    op.drop_table("exercise_logs")
    op.drop_table("workout_sessions")

