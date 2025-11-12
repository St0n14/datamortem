"""add_feature_flags_table

Revision ID: 431f727a1611
Revises: 408e07f64f51
Create Date: 2025-11-12 11:48:54.289868

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '431f727a1611'
down_revision: Union[str, None] = '408e07f64f51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)

    # Check if feature_flags table already exists
    if 'feature_flags' not in inspector.get_table_names():
        op.create_table(
            'feature_flags',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('feature_key', sa.String(), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('updated_at_utc', sa.DateTime(), nullable=False),
            sa.Column('updated_by_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_feature_flags_feature_key'), 'feature_flags', ['feature_key'], unique=True)
        op.create_index(op.f('ix_feature_flags_id'), 'feature_flags', ['id'], unique=False)
        op.create_index(op.f('ix_feature_flags_updated_by_id'), 'feature_flags', ['updated_by_id'], unique=False)

        # Insert default feature flags
        from datetime import datetime
        now = datetime.utcnow()
        op.execute(
            sa.text("""
                INSERT INTO feature_flags (feature_key, enabled, description, updated_at_utc)
                VALUES 
                    (:key1, :enabled1, :desc1, :now),
                    (:key2, :enabled2, :desc2, :now),
                    (:key3, :enabled3, :desc3, :now)
            """),
            {
                "key1": "account_creation",
                "enabled1": True,
                "desc1": "Permet la création de nouveaux comptes utilisateurs",
                "key2": "marketplace",
                "enabled2": True,
                "desc2": "Permet l'accès au marketplace de scripts",
                "key3": "pipeline",
                "enabled3": True,
                "desc3": "Permet l'utilisation de la pipeline d'analyse",
                "now": now,
            }
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_feature_flags_updated_by_id'), table_name='feature_flags')
    op.drop_index(op.f('ix_feature_flags_id'), table_name='feature_flags')
    op.drop_index(op.f('ix_feature_flags_feature_key'), table_name='feature_flags')
    op.drop_table('feature_flags')
