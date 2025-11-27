"""update embedding dimensions to 1536

Revision ID: b1619f3b2180
Revises: 
Create Date: 2025-11-26 00:00:00

This migration updates vector embedding dimensions from 384 (old model) to 1536 (OpenAI text-embedding-3-small).
Note: HNSW index limit is 2000 dimensions, so we use text-embedding-3-small (1536) instead of large (3072).
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1619f3b2180'
down_revision = '2025_11_12_bug_reports'  # Latest migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Update all vector embedding columns from 384 to 1536 dimensions.
    This is required for OpenAI text-embedding-3-small which returns 1536 dimensions.
    Note: Using 'small' instead of 'large' (3072) because HNSW index limit is 2000 dimensions.
    """
    # Note: PostgreSQL requires dropping and recreating the column to change vector dimensions
    # We'll do this carefully to preserve data where possible
    
    # 1. Update chunks table
    try:
        # Drop the old column and index
        op.execute("DROP INDEX IF EXISTS idx_chunks_embedding_hnsw;")
        op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;")
        # Add new column with 1536 dimensions
        op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(1536);")
        # Recreate index
        op.execute("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);")
    except Exception as e:
        # If column doesn't exist, just create it
        op.execute("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);")
    
    # 2. Update training_logs table
    try:
        op.execute("DROP INDEX IF EXISTS idx_training_logs_embedding_hnsw;")
        op.execute("ALTER TABLE training_logs DROP COLUMN IF EXISTS embedding;")
        op.execute("ALTER TABLE training_logs ADD COLUMN embedding vector(1536);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_embedding_hnsw ON training_logs USING hnsw (embedding vector_cosine_ops);")
    except Exception as e:
        op.execute("ALTER TABLE training_logs ADD COLUMN IF NOT EXISTS embedding vector(1536);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_embedding_hnsw ON training_logs USING hnsw (embedding vector_cosine_ops);")
    
    # 3. Update user_memory table
    try:
        op.execute("DROP INDEX IF EXISTS idx_user_memory_embedding_hnsw;")
        op.execute("ALTER TABLE user_memory DROP COLUMN IF EXISTS embedding;")
        op.execute("ALTER TABLE user_memory ADD COLUMN embedding vector(1536);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);")
    except Exception as e:
        op.execute("ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);")
        op.execute("CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);")


def downgrade() -> None:
    """
    Revert embedding dimensions back to 384 (for old model compatibility).
    WARNING: This will drop all existing embeddings!
    """
    # 1. Revert chunks table
    op.execute("DROP INDEX IF EXISTS idx_chunks_embedding_hnsw;")
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;")
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(384);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);")
    
    # 2. Revert training_logs table
    op.execute("DROP INDEX IF EXISTS idx_training_logs_embedding_hnsw;")
    op.execute("ALTER TABLE training_logs DROP COLUMN IF EXISTS embedding;")
    op.execute("ALTER TABLE training_logs ADD COLUMN embedding vector(384);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_training_logs_embedding_hnsw ON training_logs USING hnsw (embedding vector_cosine_ops);")
    
    # 3. Revert user_memory table
    op.execute("DROP INDEX IF EXISTS idx_user_memory_embedding_hnsw;")
    op.execute("ALTER TABLE user_memory DROP COLUMN IF EXISTS embedding;")
    op.execute("ALTER TABLE user_memory ADD COLUMN embedding vector(384);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);")
