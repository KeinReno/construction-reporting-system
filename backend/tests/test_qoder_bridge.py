"""Synthetic acceptance for the Qoder file bridge. Nothing external is invoked; the answer envelope
is written by the test as if the desktop assistant had produced it."""
import hashlib, json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import qoder_bridge
from app.main import Site, User, Assignment, create_app, hash_password

REQUEST_ID = 'deadbeefdeadbeefdeadbeefdeadbeef'


@pytest.fixture
def bridge_env(tmp_path, monkeypatch):
    monkeypatch.delenv('WEB_DIR', raising=False)
    monkeypatch.setenv('CRS_AI_PROVIDER', 'qoder')
    monkeypatch.setenv('CRS_QODER_BRIDGE', str(tmp_path / 'bridge'))
    qoder_bridge.root()
    api = create_app(database_url=f'sqlite:///{tmp_path}/bridge.db',
                     storage=str(tmp_path / 'uploads'), initialize=True)
    with api.state.db() as db:
        owner = User(login='br-owner', role='manager', password_hash=hash_password('SyntheticPassword123'))
        worker = User(login='br-worker', role='foreman', password_hash=hash_password('SyntheticPassword123'))
        site = Site(name='Bridge site')
        db.add_all([owner, worker, site]); db.flush()
        for u in (owner, worker):
            db.add(Assignment(user_id=u.id, site_id=site.id))
        db.commit()
        ids = dict(owner=owner.id, worker=worker.id, site=site.id)
    client = TestClient(api)
    headers = {}
    for role, name in [('owner', 'br-owner'), ('worker', 'br-worker')]:
        r = client.post('/api/v1/auth/login', json={'login': name, 'password': 'SyntheticPassword123'})
        assert r.status_code == 200
        headers[role] = {'Authorization': 'Bearer ' + r.json()['access_token']}
    state = SimpleNamespace(api=api, c=client, ids=ids, headers=headers, root=tmp_path / 'bridge', calls=[])

    def fake_enqueue(question, summary, catalog, history, owner_id):
        state.calls.append({'question': question, 'catalog': catalog, 'owner': owner_id})
        return REQUEST_ID

    monkeypatch.setattr(qoder_bridge, 'enqueue', fake_enqueue)
    yield state
    client.close()
    api.state.db.kw['bind'].dispose()


def handle(kind, identity):
    return kind + hashlib.sha256(identity.encode()).hexdigest()[:12]


def seed(state, payload, folder='answered'):
    qoder_bridge._atomic(Path(state.root) / folder / (REQUEST_ID + '.json'), payload)


def ask(state, role='owner'):
    return state.c.post('/api/v1/ai/chat', headers=state.headers[role],
                        json={'question': 'Переименуй объект', 'history': [], 'filters': {}})


def test_status_and_acl(bridge_env):
    e = bridge_env
    assert e.c.get('/api/v1/ai/status').status_code == 401
    assert e.c.get('/api/v1/ai/status', headers=e.headers['worker']).status_code == 403
    assert e.c.get('/api/v1/ai/status', headers=e.headers['owner']).json()['mode'] == 'qoder_bridge'
    assert e.c.post('/api/v1/ai/chat', headers=e.headers['worker'], json={'question': 'x'}).status_code == 403
    assert e.calls == []


def test_answer_and_proposal_apply_without_mutation_before_confirm(bridge_env):
    e = bridge_env
    seed(e, {'answer': 'Готово, это предложение.', 'sources': [],
             'actions': [{'kind': 'rename_site', 'target': handle('S', e.ids['site']),
                          'value': 'Новое имя', 'reason': 'Запрошено пользователем'}]})
    r = ask(e)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload['mode'] == 'qoder_bridge' and payload['answer'] == 'Готово, это предложение.'
    assert len(payload['actions']) == 1
    assert e.calls and e.calls[0]['catalog']['sites']
    with e.api.state.db() as db:
        assert db.get(Site, e.ids['site']).name == 'Bridge site'
    applied = e.c.post('/api/v1/ai/actions', headers=e.headers['owner'],
                       json={'token': payload['actions'][0]['token']})
    assert applied.status_code == 200 and applied.json()['applied'] is True
    with e.api.state.db() as db:
        assert db.get(Site, e.ids['site']).name == 'Новое имя'


def test_unknown_action_and_foreign_source_are_dropped(bridge_env):
    e = bridge_env
    seed(e, {'answer': 'Ответ', 'sources': ['R' + 'z' * 12],
             'actions': [{'kind': 'delete_report', 'target': 'R' + 'z' * 12, 'value': '', 'reason': 'r'}]})
    body = ask(e).json()
    assert body['actions'] == [] and body['source_report_ids'] == []
    assert not (Path(e.root) / 'answered').exists() or list((Path(e.root) / 'answered').glob('*.json')) == []


def test_failure_envelope_surfaces_reason(bridge_env):
    e = bridge_env
    seed(e, {'error': 'Не смог разобрать запрос.'}, folder='failed')
    r = ask(e)
    assert r.status_code == 503 and 'разобрать' in r.json()['detail']


def test_timeout_without_answer(bridge_env):
    e = bridge_env
    monkey = qoder_bridge
    original = monkey.poll
    monkey.poll = lambda request_id: {'state': 'pending', 'request_id': request_id}
    try:
        with pytest.raises(monkey.AIUnavailable) as exc:
            monkey.run('Ответь', {}, {'sites': [], 'reports': []}, [], 'owner', wait_seconds=1)
        assert 'не ответил' in str(exc.value)
    finally:
        monkey.poll = original


def test_envelope_written_by_enqueue(tmp_path, monkeypatch):
    monkeypatch.setenv('CRS_QODER_BRIDGE', str(tmp_path / 'unit'))
    catalog = {'sites': [{'ref': 'S1', 'name': 'Объект'}], 'reports': [], 'truncated': False}
    summary = {'report_count': 0, 'no_work_count': 0, 'incident_count': 0, 'material_count': 0,
               'period': {'from_date': None, 'to_date': None}, 'volumes': [], 'financial_totals_kopecks': {},
               'equipment_hours': [], 'material_movements': [], 'daily': []}
    request_id = qoder_bridge.enqueue('Вопрос', summary, catalog, [], 'f' * 32)
    path = Path(qoder_bridge.root()) / 'pending' / (request_id + '.json')
    payload = json.loads(path.read_text(encoding='utf-8'))
    assert payload['question'] == 'Вопрос' and payload['sites'] == catalog['sites']
    assert payload['request_id'] == request_id and payload['owner_id'] == 'f' * 32
    assert qoder_bridge.poll(request_id)['state'] == 'pending'
