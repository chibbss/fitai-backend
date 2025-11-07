"""deep memory: chat messages table

Revision ID: d8e5f3a2b0c1
Revises: c5b9f9b4b1c1, c8d4f2e1b9a3
Create Date: 2025-11-01 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d8e5f3a2b0c1"
down_revision = ("c5b9f9b4b1c1", "c8d4f2e1b9a3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # chat_messages table for persistent conversation history (deep memory)
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),  # "user" or "assistant"
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
    )
    op.create_index("idx_chat_messages_user", "chat_messages", ["user_id"])
    op.create_index("idx_chat_messages_session", "chat_messages", ["session_id"])
    op.create_index("idx_chat_messages_created", "chat_messages", ["created_at"])
    op.create_index("idx_chat_messages_user_session", "chat_messages", ["user_id", "session_id"])


def downgrade() -> None:
    op.drop_index("idx_chat_messages_user_session", table_name="chat_messages")
    op.drop_index("idx_chat_messages_created", table_name="chat_messages")
    op.drop_index("idx_chat_messages_session", table_name="chat_messages")
    op.drop_index("idx_chat_messages_user", table_name="chat_messages")
    op.drop_table("chat_messages")

