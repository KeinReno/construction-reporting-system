"""Editable worker tariff. Existing people keep the 5000 ₽ day rate until an admin changes it."""
from alembic import op
import sqlalchemy as sa
revision='0009'
down_revision='0008'
def upgrade():
    op.add_column('workers',sa.Column('rate_kopecks',sa.Integer(),nullable=False,server_default='500000'))
    op.add_column('workers',sa.Column('travel_kopecks',sa.Integer(),nullable=False,server_default='0'))
    op.add_column('workers',sa.Column('bonus_kopecks',sa.Integer(),nullable=False,server_default='0'))
    op.add_column('workers',sa.Column('fine_kopecks',sa.Integer(),nullable=False,server_default='0'))
    op.add_column('workers',sa.Column('revision',sa.Integer(),nullable=False,server_default='1'))
def downgrade():
    op.drop_column('workers','revision')
    op.drop_column('workers','fine_kopecks')
    op.drop_column('workers','bonus_kopecks')
    op.drop_column('workers','travel_kopecks')
    op.drop_column('workers','rate_kopecks')
