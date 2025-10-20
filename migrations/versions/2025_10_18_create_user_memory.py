"""create user_memory table

Revision ID: c5b9f9b4b1c1
Revises: 
Create Date: 2025-10-18 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c5b9f9b4b1c1"
down_revision = "b43c9a785a9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure pgvector extension exists
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # Create base table (without embedding to allow vector column via raw SQL)
    op.create_table(
        "user_memory",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )

    # Add embedding vector column with explicit dimension
    op.execute("ALTER TABLE user_memory ADD COLUMN embedding vector(384);")

    # Indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);"
    )
    op.create_index("idx_user_memory_user", "user_memory", ["user_id"])
    op.create_index(
        "idx_user_memory_meta_gin",
        "user_memory",
        ["meta_data"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("idx_user_memory_meta_gin", table_name="user_memory")
    op.drop_index("idx_user_memory_user", table_name="user_memory")
    op.drop_table("user_memory")
