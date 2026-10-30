"""Optimistic locking and event timestamps.
Legacy timestamps remain NULL: the migration date must not impersonate the event date.
"""
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'

def upgrade():
    op.add_column('reports',sa.Column('lock_version',sa.Integer,nullable=False,server_default='1'))
    op.add_column('reports',sa.Column('created_at',sa.DateTime(timezone=True),nullable=True))
    op.add_column('reports',sa.Column('submitted_at',sa.DateTime(timezone=True),nullable=True))
    op.add_column('changes',sa.Column('occurred_at',sa.DateTime(timezone=True),nullable=True))

def downgrade():
    op.drop_column('changes','occurred_at')
    for name in ['submitted_at','created_at','lock_version']:
        op.drop_column('reports',name)
