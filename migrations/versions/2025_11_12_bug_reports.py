"""add bug_reports table

Revision ID: 2025_11_12_bug_reports
Revises: 2025_11_01_deep_memory_chat_messages
Create Date: 2025-11-12 10:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "2025_11_12_bug_reports"
down_revision = "d8e5f3a2b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bug_reports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'open'")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_bug_reports_status", "bug_reports", ["status"])
    op.create_index("idx_bug_reports_created_at", "bug_reports", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_bug_reports_created_at", table_name="bug_reports")
    op.drop_index("idx_bug_reports_status", table_name="bug_reports")
    op.drop_table("bug_reports")

