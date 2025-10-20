"""base schema

Revision ID: b43c9a785a9e
Revises: 
Create Date: 2025-10-20 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "b43c9a785a9e"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("profile", postgresql.JSONB, nullable=True),
        sa.Column("goals", postgresql.JSONB, nullable=True),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )

    # documents table
    op.create_table(
        "documents",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_documents_user", "documents", ["user_id"])

    # chunks table (vector embedding added via raw SQL)
    op.create_table(
        "chunks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_chunks_document", "chunks", ["document_id"])
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(384);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chunks_metadata_gin ON chunks USING gin (meta_data);")

    # training_logs table (vector embedding added via raw SQL)
    op.create_table(
        "training_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default=sa.text("'event'")),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("occurred_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("meta_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.execute("ALTER TABLE training_logs ADD COLUMN embedding vector(384);")

    # Indexes for logs
    op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_embedding_hnsw ON training_logs USING hnsw (embedding vector_cosine_ops);")
    op.create_index("idx_training_logs_user", "training_logs", ["user_id"])
    op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_time ON training_logs(occurred_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_tags_gin ON training_logs USING gin (tags);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_metadata_gin ON training_logs USING gin (meta_data);")


def downgrade() -> None:
    op.drop_table("training_logs")
    op.drop_table("chunks")
    op.drop_table("documents")
    op.drop_table("users")
