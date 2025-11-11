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
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)

    # Check if custom_scripts table exists
    if 'custom_scripts' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('custom_scripts')]

        with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
            # Only add python_version if it doesn't exist
            if 'python_version' not in columns:
                batch_op.add_column(sa.Column('python_version', sa.String(), nullable=False, server_default='3.11'))

            # Only add requirements if it doesn't exist
            if 'requirements' not in columns:
                batch_op.add_column(sa.Column('requirements', sa.Text(), nullable=True))

        # Remove the temporary server default only if we just added it
        if 'python_version' not in columns:
            with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
                batch_op.alter_column('python_version', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('custom_scripts', schema=None) as batch_op:
        batch_op.drop_column('requirements')
        batch_op.drop_column('python_version')
