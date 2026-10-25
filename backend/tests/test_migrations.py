from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


def test_upgrade_preserves_legacy_rows_and_roundtrip(tmp_path,monkeypatch):
    monkeypatch.delenv('DATABASE_URL',raising=False)
    cfg=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    url=f'sqlite:///{tmp_path}/migration.db';cfg.set_main_option('sqlalchemy.url',url)
    command.upgrade(cfg,'0001')
    engine=create_engine(url)
    with engine.begin() as db:
        db.execute(text("INSERT INTO users (id,login,password_hash,role,active) VALUES ('u','synthetic','hash','admin',1)"))
        db.execute(text("INSERT INTO sites (id,name) VALUES ('s','synthetic')"))
        db.execute(text("INSERT INTO reports (id,client_report_id,site_id,author_id,work_date,payload,status,revision) VALUES ('r','c','s','u','2026-10-25','{}','draft',1)"))
    command.upgrade(cfg,'head')
    with engine.connect() as db:
        row=db.execute(text('SELECT lock_version,created_at FROM reports')).one()
        assert row==(1,None)
    assert 'submitted_at' in {x['name'] for x in inspect(engine).get_columns('reports')}
    command.downgrade(cfg,'base')
    command.upgrade(cfg,'head')
    assert inspect(engine).has_table('reports')
