"""Versioned work catalog and explicit owner labor-day ledger; no historical data rewriting."""
from alembic import op
import sqlalchemy as sa
import uuid
revision='0008'
down_revision='0007'
def upgrade():
    op.create_table('work_types',sa.Column('id',sa.String(36),primary_key=True),sa.Column('name',sa.String(200),nullable=False,unique=True),sa.Column('kind',sa.String(16),nullable=False),sa.Column('parent_id',sa.String(36),sa.ForeignKey('work_types.id')),sa.Column('active',sa.Boolean(),nullable=False),sa.Column('revision',sa.Integer(),nullable=False),sa.Column('aliases',sa.JSON(),nullable=False))
    op.create_table('workers',sa.Column('id',sa.String(36),primary_key=True),sa.Column('name',sa.String(200),nullable=False),sa.Column('active',sa.Boolean(),nullable=False))
    op.create_table('labor_days',sa.Column('id',sa.String(36),primary_key=True),sa.Column('worker_id',sa.String(36),sa.ForeignKey('workers.id'),nullable=False),sa.Column('site_id',sa.String(36),sa.ForeignKey('sites.id'),nullable=False),sa.Column('work_date',sa.String(10),nullable=False),sa.Column('payload',sa.JSON(),nullable=False),sa.Column('revision',sa.Integer(),nullable=False),sa.UniqueConstraint('worker_id','work_date',name='uq_worker_day'))
    table=sa.table('work_types',sa.column('id'),sa.column('name'),sa.column('kind'),sa.column('parent_id'),sa.column('active'),sa.column('revision'),sa.column('aliases',sa.JSON()))
    roots=['Заливка бетона','Монтаж блоков','Армопояс и плиты','Монтаж металлоконструкций','Сварка металлоконструкций','Монтаж сетки','Погрузка и разгрузка материалов']
    ids={name:str(uuid.uuid5(uuid.NAMESPACE_URL,'crs:work-type:'+name)) for name in roots}
    rows=[dict(id=ids[name],name=name,kind='main',parent_id=None,active=True,revision=1,aliases=[]) for name in roots]
    for name,parent in [('Опалубка','Заливка бетона'),('Уход за бетоном','Заливка бетона'),('Приёмка блоков','Монтаж блоков'),('Армирование и вязка арматуры','Армопояс и плиты'),('Покраска','Монтаж металлоконструкций'),('Монтаж троса','Монтаж сетки')]:
        rows.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL,'crs:work-type:'+name)),name=name,kind='auxiliary',parent_id=ids[parent],active=True,revision=1,aliases=[]))
    op.bulk_insert(table,rows)
def downgrade():
    op.drop_table('labor_days');op.drop_table('workers');op.drop_table('work_types')
