"""Add email verification and OTP fields to users

Revision ID: 7b4f50a1e0e0
Revises: 8f6e0f2be8d2
Create Date: 2025-11-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b4f50a1e0e0"
down_revision: Union[str, None] = "8f6e0f2be8d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)

    # Check if users table exists
    if 'users' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('users')]
        indexes = [idx['name'] for idx in inspector.get_indexes('users')]

        with op.batch_alter_table("users", schema=None) as batch_op:
            # Only add columns if they don't exist
            if 'email_verified' not in columns:
                batch_op.add_column(
                    sa.Column(
                        "email_verified",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.text("FALSE"),
                    )
                )
            if 'email_verification_token' not in columns:
                batch_op.add_column(
                    sa.Column("email_verification_token", sa.String(), nullable=True)
                )
            if 'email_verification_sent_at' not in columns:
                batch_op.add_column(
                    sa.Column("email_verification_sent_at", sa.DateTime(), nullable=True)
                )
            if 'otp_enabled' not in columns:
                batch_op.add_column(
                    sa.Column(
                        "otp_enabled",
                        sa.Boolean(),
                        nullable=False,
                        server_default=sa.text("FALSE"),
                    )
                )
            if 'otp_secret' not in columns:
                batch_op.add_column(sa.Column("otp_secret", sa.String(), nullable=True))

        # Create index for email_verification_token if it doesn't exist
        # Re-check columns and indexes after potential additions
        columns_after = [c['name'] for c in inspector.get_columns('users')]
        indexes_after = [idx['name'] for idx in inspector.get_indexes('users')]
        
        if 'email_verification_token' in columns_after and 'ix_users_email_verification_token' not in indexes_after:
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.create_index(
                    batch_op.f("ix_users_email_verification_token"),
                    ["email_verification_token"],
                    unique=True,
                )

        # Remove server defaults only if we just added the columns
        with op.batch_alter_table("users", schema=None) as batch_op:
            if 'email_verified' not in columns:
                batch_op.alter_column("email_verified", server_default=None)
            if 'otp_enabled' not in columns:
                batch_op.alter_column("otp_enabled", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_email_verification_token"))
        batch_op.drop_column("otp_secret")
        batch_op.drop_column("otp_enabled")
        batch_op.drop_column("email_verification_sent_at")
        batch_op.drop_column("email_verification_token")
        batch_op.drop_column("email_verified")

