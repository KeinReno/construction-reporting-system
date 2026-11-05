"""Invalidate in-flight old-password logins after credential changes."""
from alembic import op
import sqlalchemy as sa
revision='0005'
down_revision='0004'
def upgrade():
    for table in ['users','tokens']:op.add_column(table,sa.Column('auth_version',sa.Integer,nullable=False,server_default='1'))
def downgrade():
    for table in ['tokens','users']:op.drop_column(table,'auth_version')
