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
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "email_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(
            sa.Column("email_verification_token", sa.String(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("email_verification_sent_at", sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "otp_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(sa.Column("otp_secret", sa.String(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_users_email_verification_token"),
            ["email_verification_token"],
            unique=True,
        )

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("email_verified", server_default=None)
        batch_op.alter_column("otp_enabled", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_email_verification_token"))
        batch_op.drop_column("otp_secret")
        batch_op.drop_column("otp_enabled")
        batch_op.drop_column("email_verification_sent_at")
        batch_op.drop_column("email_verification_token")
        batch_op.drop_column("email_verified")

