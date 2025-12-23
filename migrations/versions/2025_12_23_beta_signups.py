"""beta signups table

Revision ID: a1b2c3d4e5f6
Revises: 2025_12_01_add_email_unique_constraint
Create Date: 2025-12-23 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a1b2c3d4e5f6"
down_revision = "2025_12_01_email_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # beta_signups table
    op.create_table(
        "beta_signups",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("device", sa.String(), nullable=False),  # "iOS" or "Android"
        sa.Column("status", sa.String(), nullable=False, default="pending"),  # "pending", "sent", "active"
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    
    # Indexes
    op.create_index("idx_beta_signups_email", "beta_signups", ["email"])
    op.create_index("idx_beta_signups_status", "beta_signups", ["status"])
    op.create_index("idx_beta_signups_created", "beta_signups", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_beta_signups_created", table_name="beta_signups")
    op.drop_index("idx_beta_signups_status", table_name="beta_signups")
    op.drop_index("idx_beta_signups_email", table_name="beta_signups")
    op.drop_table("beta_signups")

