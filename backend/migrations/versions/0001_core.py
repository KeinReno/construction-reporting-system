"""Original bootstrap schema. Existing databases may stamp 0001 ONLY after schema inspection."""
from alembic import op
import sqlalchemy as sa
revision = '0001'
down_revision = None

def upgrade():
    op.create_table('users',sa.Column('id',sa.String(36),primary_key=True),sa.Column('login',sa.String(128),unique=True,nullable=False),sa.Column('password_hash',sa.String(256),nullable=False),sa.Column('role',sa.String(32),nullable=False),sa.Column('active',sa.Boolean,nullable=False))
    op.create_table('sites',sa.Column('id',sa.String(36),primary_key=True),sa.Column('name',sa.String(255),nullable=False))
    op.create_table('assignments',sa.Column('id',sa.String(36),primary_key=True),sa.Column('user_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),sa.Column('site_id',sa.String(36),sa.ForeignKey('sites.id'),nullable=False))
    op.create_table('tokens',sa.Column('digest',sa.String(64),primary_key=True),sa.Column('user_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),sa.Column('expires',sa.DateTime(timezone=True),nullable=False))
    op.create_table('reports',sa.Column('id',sa.String(36),primary_key=True),sa.Column('client_report_id',sa.String(36),nullable=False),sa.Column('site_id',sa.String(36),sa.ForeignKey('sites.id'),nullable=False),sa.Column('author_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),sa.Column('work_date',sa.String(10),nullable=False),sa.Column('payload',sa.JSON,nullable=False),sa.Column('status',sa.String(24),nullable=False),sa.Column('revision',sa.Integer,nullable=False),sa.Column('receipt_id',sa.String(36)))
    op.create_index('ix_reports_client_report_id','reports',['client_report_id'],unique=True)
    op.create_table('photos',sa.Column('id',sa.String(36),primary_key=True),sa.Column('report_id',sa.String(36),sa.ForeignKey('reports.id'),nullable=False),sa.Column('sha256',sa.String(64),nullable=False),sa.Column('content_type',sa.String(64),nullable=False),sa.Column('filename',sa.String(120),nullable=False))
    op.create_table('changes',sa.Column('id',sa.String(36),primary_key=True),sa.Column('report_id',sa.String(36),sa.ForeignKey('reports.id'),nullable=False),sa.Column('actor_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),sa.Column('revision',sa.Integer,nullable=False),sa.Column('event',sa.String(30),nullable=False),sa.Column('payload_before',sa.JSON),sa.Column('reason',sa.String(500)))

def downgrade():
    for table in ['changes','photos','reports','tokens','assignments','sites','users']:
        op.drop_table(table)
