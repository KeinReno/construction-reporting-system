"""Preserve the historical message separately from the structured report."""
from alembic import op
import sqlalchemy as sa

revision='0006'
down_revision='0005'

def upgrade():
    op.create_table('report_sources',
        sa.Column('report_id',sa.String(36),sa.ForeignKey('reports.id'),primary_key=True),
        sa.Column('payload',sa.JSON(),nullable=False))

def downgrade():
    op.drop_table('report_sources')
