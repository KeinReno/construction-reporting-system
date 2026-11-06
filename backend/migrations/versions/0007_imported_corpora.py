"""Store complete, private source corpus independently of the original export."""
from alembic import op
import sqlalchemy as sa
revision='0007'
down_revision='0006'

def upgrade():
    op.create_table('imported_corpora',sa.Column('id',sa.String(36),primary_key=True),sa.Column('payload',sa.JSON(),nullable=False))

def downgrade():
    op.drop_table('imported_corpora')
