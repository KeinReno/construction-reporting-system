"""Actual pg_dump/pg_restore drill, enabled only by explicit CI database URL."""
import os
from pathlib import Path
import shutil
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from fastapi.testclient import TestClient
from app.backup import backup,restore
from app.main import create_app
from test_api import env,report,uid


def test_postgres_backup_restore(env,tmp_path):
    source=os.getenv('TEST_DATABASE_URL','')
    if not source.startswith('postgresql'):pytest.skip('Requires PostgreSQL test database')
    if not shutil.which('pg_dump') or not shutil.which('pg_restore'):pytest.fail('PostgreSQL client tools required for restore drill')
    c,f,m,sid,_=env
    rid=c.post('/api/v1/reports',headers=f,json=report(sid)).json()['id']
    name='crs_restore_'+uid().replace('-','')
    target=make_url(source).set(database=name).render_as_string(hide_password=False)
    admin=create_engine(source,isolation_level='AUTOCOMMIT')
    with admin.connect() as db:db.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        snapshot=tmp_path/'pg-snapshot'
        backup(source,tmp_path/'photos',snapshot,service_stopped=True)
        restored_media=tmp_path/'pg-restored'
        restore(snapshot,target,restored_media,service_stopped=True)
        api=create_app(database_url=target,storage=restored_media)
        client=TestClient(api)
        assert client.get(f'/api/v1/reports/{rid}',headers=f).status_code==200
        with api.state.db() as db:engine=db.bind
        engine.dispose()
    finally:
        with admin.connect() as db:db.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()
