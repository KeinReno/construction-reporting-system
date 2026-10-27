import hashlib
import io
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from app.backup import backup,restore,verify
from app.main import create_app,Photo
from test_api import env,report,uid


def test_backup_restore_and_corruption(env,tmp_path):
    c,f,m,sid,_=env
    rid=c.post('/api/v1/reports',headers=f,json=report(sid)).json()['id'];aid=uid()
    source={'source_ref':'synthetic','text':'Original text'}
    assert c.put(f'/api/v1/reports/{rid}/source',headers=f,json=source).status_code==200
    image=io.BytesIO();Image.new('RGB',(2,2),'green').save(image,format='PNG');blob=image.getvalue()
    assert c.put(f'/api/v1/reports/{rid}/attachments/{aid}',headers={**f,'Content-Type':'image/png','X-Content-SHA256':hashlib.sha256(blob).hexdigest()},content=blob).status_code==200
    with c.api.state.db() as db:url=str(db.bind.url)
    # This test exercises SQLite snapshots; PostgreSQL API tests are a separate CI job.
    if not url.startswith('sqlite:'):pytest.skip('SQLite restore drill')
    snapshot=tmp_path/'snapshot'
    backup(url,tmp_path/'photos',snapshot,service_stopped=True)
    verify(snapshot)
    target=f'sqlite:///{tmp_path}/restored.db';media=tmp_path/'restored-photos'
    restore(snapshot,target,media,service_stopped=True)
    restored=create_app(database_url=target,storage=media)
    client=TestClient(restored)
    assert client.get(f'/api/v1/reports/{rid}',headers=f).status_code==200
    assert client.get(f'/api/v1/reports/{rid}/source',headers=f).json()['text']==source['text']
    assert client.get(f'/api/v1/attachments/{aid}',headers=f).content==blob
    with pytest.raises(ValueError,match='must not exist'):restore(snapshot,target,tmp_path/'new-media',service_stopped=True)
    path=next((snapshot/'uploads').iterdir());path.write_bytes(b'corrupt')
    with pytest.raises(ValueError,match='checksum'):verify(snapshot)
    with pytest.raises(ValueError,match='checksum'):restore(snapshot,f'sqlite:///{tmp_path}/bad.db',tmp_path/'bad-media',service_stopped=True)
    assert not (tmp_path/'bad.db').exists()


def test_backup_requires_offline_ack(tmp_path):
    with pytest.raises(ValueError,match='Stop the API'):backup('sqlite:///unused.db',tmp_path,tmp_path/'copy')
