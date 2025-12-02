"""add unique constraint on email

Revision ID: 2025_12_01_email_unique
Revises: 2025_11_12_bug_reports
Create Date: 2025-12-01 00:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2025_12_01_email_unique"
down_revision = "b1619f3b2180"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, ensure no duplicate emails exist (except NULL)
    # This should already be handled, but just in case
    op.execute("""
        DELETE FROM users u1
        USING users u2
        WHERE u1.id < u2.id
        AND u1.email = u2.email
        AND u1.email IS NOT NULL;
    """)
    
    # Add unique constraint on email (only for non-null emails)
    # Using partial unique index to allow multiple NULL emails
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique 
        ON users (email) 
        WHERE email IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_email_unique;")

