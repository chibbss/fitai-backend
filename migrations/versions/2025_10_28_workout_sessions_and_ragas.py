"""workout sessions and ragas metrics

Revision ID: c8d4f2e1b9a3
Revises: b43c9a785a9e
Create Date: 2025-10-28 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c8d4f2e1b9a3"
down_revision = "b43c9a785a9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # workout_sessions table
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

    # exercise_logs table
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

    # ragas_metrics table for RAG pipeline evaluation
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


def downgrade() -> None:
    op.drop_table("ragas_metrics")
    op.drop_table("exercise_logs")
    op.drop_table("workout_sessions")

