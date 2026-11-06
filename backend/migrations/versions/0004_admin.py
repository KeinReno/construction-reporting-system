"""Admin audit and race-safe object assignments."""
from alembic import op
import sqlalchemy as sa
revision='0004'
down_revision='0003'

def upgrade():
    # Existing duplicate links grant exactly the same permission; keep one stable UUID.
    op.execute('DELETE FROM assignments WHERE id NOT IN (SELECT MIN(id) FROM assignments GROUP BY user_id,site_id)')
    with op.batch_alter_table('assignments') as batch:
        batch.create_unique_constraint('uq_assignment_user_site',['user_id','site_id'])
    op.create_table('admin_events',sa.Column('id',sa.String(36),primary_key=True),sa.Column('actor_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),sa.Column('action',sa.String(40),nullable=False),sa.Column('target_id',sa.String(36),nullable=False),sa.Column('details',sa.JSON,nullable=False),sa.Column('occurred_at',sa.DateTime(timezone=True),nullable=False))

def downgrade():
    op.drop_table('admin_events')
    with op.batch_alter_table('assignments') as batch:batch.drop_constraint('uq_assignment_user_site',type_='unique')
