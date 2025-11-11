"""Merge multiple heads

Revision ID: 7c6ac304c575
Revises: 2a6d94c6cc2b, 7b4f50a1e0e0
Create Date: 2025-11-11 17:46:47.075621

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c6ac304c575'
down_revision: Union[str, None] = ('2a6d94c6cc2b', '7b4f50a1e0e0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
