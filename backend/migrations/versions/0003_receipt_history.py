"""Keep receipts per event/revision even after the current report is corrected."""
from alembic import op
import sqlalchemy as sa
revision = '0003'
down_revision = '0002'

def upgrade():
    op.add_column('changes',sa.Column('receipt_id',sa.String(36),nullable=True))

def downgrade():
    op.drop_column('changes','receipt_id')
