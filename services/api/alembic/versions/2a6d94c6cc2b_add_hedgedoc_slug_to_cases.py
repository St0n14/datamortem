"""Add HedgeDoc slug to cases

Revision ID: 2a6d94c6cc2b
Revises: 8f6e0f2be8d2
Create Date: 2025-02-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a6d94c6cc2b'
down_revision: Union[str, None] = '8f6e0f2be8d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hedgedoc_slug', sa.String(), nullable=True))

    op.create_unique_constraint(
        op.f('uq_cases_hedgedoc_slug'),
        'cases',
        ['hedgedoc_slug'],
    )


def downgrade() -> None:
    op.drop_constraint(op.f('uq_cases_hedgedoc_slug'), 'cases', type_='unique')
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.drop_column('hedgedoc_slug')
