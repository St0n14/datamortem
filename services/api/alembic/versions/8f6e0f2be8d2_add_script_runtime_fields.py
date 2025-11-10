"""Add python_version and requirements to custom_scripts

Revision ID: 8f6e0f2be8d2
Revises: c6e23e92af16
Create Date: 2025-11-08 21:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f6e0f2be8d2'
down_revision: Union[str, None] = 'c6e23e92af16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('python_version', sa.String(), nullable=False, server_default='3.11'))
        batch_op.add_column(sa.Column('requirements', sa.Text(), nullable=True))

    # Remove the temporary server default
    with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
        batch_op.alter_column('python_version', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
        batch_op.drop_column('requirements')
        batch_op.drop_column('python_version')
