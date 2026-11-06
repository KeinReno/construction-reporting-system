"""Server console access and the employee stop switch. No live network is required."""
import json

from fastapi.testclient import TestClient

from app.main import Assignment, Site, User, create_app, hash_password
from app.server_console import router_is_public, vpn_from_route


def test_route_and_address_classification():
    assert vpn_from_route('0.0.0.0 0.0.0.0 192.168.1.1 192.168.1.20 25\n') is False
    assert vpn_from_route(
        '0.0.0.0 0.0.0.0 192.168.1.1 192.168.1.20 25\n'
        '0.0.0.0 0.0.0.0 On-link 172.19.0.1 0\n'
    ) is True
    assert router_is_public('203.0.113.10') is True
    assert router_is_public('100.64.1.1') is False
    assert router_is_public('192.168.1.1') is False
    assert router_is_public(None) is False


def test_owner_can_stop_employee_access(tmp_path, monkeypatch):
    monkeypatch.setenv('CRS_HOLD_FILE', str(tmp_path / 'service-hold.json'))
    monkeypatch.delenv('WEB_DIR', raising=False)
    api = create_app(database_url=f'sqlite:///{tmp_path}/server.db', storage=str(tmp_path / 'uploads'), initialize=True)
    with api.state.db() as db:
        owner = User(login='console-owner', role='manager', password_hash=hash_password('SyntheticPassword123'))
        worker = User(login='console-worker', role='foreman', password_hash=hash_password('SyntheticPassword123'))
        site = Site(name='Console site')
        db.add_all([owner, worker, site])
        db.flush()
        db.add(Assignment(user_id=worker.id, site_id=site.id))
        db.add(Assignment(user_id=owner.id, site_id=site.id))
        db.commit()
        api.state.owner_user_id = owner.id
    client = TestClient(api)
    owner_token = client.post('/api/v1/auth/login', json={'login': 'console-owner', 'password': 'SyntheticPassword123'}).json()['access_token']
    worker_token = client.post('/api/v1/auth/login', json={'login': 'console-worker', 'password': 'SyntheticPassword123'}).json()['access_token']
    owner_headers = {'Authorization': 'Bearer ' + owner_token}
    worker_headers = {'Authorization': 'Bearer ' + worker_token}
    assert client.get('/api/v1/server/status', headers=worker_headers).status_code == 403
    status = client.get('/api/v1/server/status', headers=owner_headers)
    assert status.status_code == 200
    assert status.json()['accepting'] is True
    stopped = client.post('/api/v1/server/power', headers=owner_headers, json={'running': False})
    assert stopped.status_code == 200
    assert stopped.json()['accepting'] is False
    assert json.loads((tmp_path / 'service-hold.json').read_text(encoding='utf-8'))['stopped'] is True
    assert client.get('/api/v1/sites', headers=worker_headers).status_code == 503
    assert client.get('/api/v1/server/status', headers=owner_headers).status_code == 200
    assert client.post('/api/v1/server/power', headers=owner_headers, json={'running': True}).json()['accepting'] is True
    assert client.get('/api/v1/sites', headers=worker_headers).status_code == 200
    client.close()
