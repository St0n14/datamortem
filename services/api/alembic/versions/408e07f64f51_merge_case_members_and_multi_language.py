"""merge_case_members_and_multi_language

Revision ID: 408e07f64f51
Revises: a1b2c3d4e5f6, 0879ed3e0c27
Create Date: 2025-11-12 08:42:05.388638

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '408e07f64f51'
down_revision: Union[str, None] = ('a1b2c3d4e5f6', '0879ed3e0c27')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
