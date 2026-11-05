"""Synthetic API acceptance for Codex proposals; never invokes the external CLI."""
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import codex_provider
from app.main import (AdminEvent, Assignment, Change, Report, ReportSource, Site,
                      User, create_app, hash_password)
from test_api import report


@pytest.fixture
def codex_env(tmp_path, monkeypatch):
    monkeypatch.delenv('WEB_DIR', raising=False)
    monkeypatch.setenv('CRS_CODEX_ENABLED', '1')
    api = create_app(database_url=f'sqlite:///{tmp_path}/codex.db',
                     storage=str(tmp_path/'uploads'), initialize=True)
    with api.state.db() as db:
        owner = User(login='qa-owner', role='manager', password_hash=hash_password('SyntheticPassword123'))
        other = User(login='qa-other', role='manager', password_hash=hash_password('SyntheticPassword123'))
        worker = User(login='qa-worker', role='foreman', password_hash=hash_password('SyntheticPassword123'))
        site, forbidden = Site(name='Synthetic site'), Site(name='Forbidden synthetic site')
        db.add_all([owner, other, worker, site, forbidden]); db.flush()
        db.add_all([Assignment(user_id=u.id, site_id=site.id) for u in (owner, other, worker)])
        db.commit()
        ids = dict(owner=owner.id, other=other.id, worker=worker.id, site=site.id, forbidden=forbidden.id)
    client = TestClient(api)
    headers = {}
    for role, name in [('owner','qa-owner'), ('other','qa-other'), ('worker','qa-worker')]:
        r = client.post('/api/v1/auth/login', json={'login':name,'password':'SyntheticPassword123'})
        assert r.status_code == 200
        headers[role] = {'Authorization':'Bearer '+r.json()['access_token']}
    state = SimpleNamespace(api=api, c=client, ids=ids, headers=headers, calls=[], actions=[], sources=[])

    def fake_run(question, summary, catalog, history, owner_id):
        state.calls.append(copy.deepcopy(dict(question=question, catalog=catalog, history=history, owner=owner_id)))
        return {'answer':'Synthetic response', 'sources':state.sources, 'actions':state.actions}

    monkeypatch.setattr(codex_provider, 'run', fake_run)
    monkeypatch.setattr(codex_provider, 'status', lambda: {'enabled':True,'mode':'codex_cli'})
    yield state
    client.close()
    api.state.db.kw['bind'].dispose()


def handle(kind, identity):
    return kind+hashlib.sha256(identity.encode()).hexdigest()[:12]


def action(kind, target, value='', reason='Synthetic requested change'):
    return dict(kind=kind, target=target, value=value, reason=reason)


def chat(e, actions, role='owner'):
    e.actions = actions
    return e.c.post('/api/v1/ai/chat', headers=e.headers[role],
                    json={'question':'Please make this synthetic change', 'history':[], 'filters':{}})


def proposal(e, change):
    r = chat(e, [change]); assert r.status_code == 200, r.text
    assert len(r.json()['actions']) == 1, r.text
    return r.json()['actions'][0]['token']


def apply(e, token, role='owner'):
    return e.c.post('/api/v1/ai/actions', headers=e.headers[role], json={'token':token})


def create_report(e, status='draft', extras=None):
    data = report(e.ids['site'])
    data.update(extras or {})
    r = e.c.post('/api/v1/reports', headers=e.headers['worker'], json=data)
    assert r.status_code == 201, r.text
    rid = r.json()['id']
    if status != 'draft':
        with e.api.state.db() as db:
            row = db.get(Report,rid); row.status=status; db.commit()
    return rid


def test_acl_and_no_external_calls_for_unauthorized(codex_env):
    e=codex_env
    for endpoint, method, body in [('/ai/status','get',None),('/ai/chat','post',{'question':'Hello'}),
                                    ('/ai/actions','post',{'token':'x'*32})]:
        kwargs={} if body is None else {'json':body}
        assert getattr(e.c,method)('/api/v1'+endpoint,**kwargs).status_code == 401
        assert getattr(e.c,method)('/api/v1'+endpoint,headers=e.headers['worker'],**kwargs).status_code == 403
    assert e.calls == []


def test_proposal_no_mutation_apply_rename_audit_and_idempotency(codex_env):
    e=codex_env
    token=proposal(e,action('rename_site',handle('S',e.ids['site']),'New synthetic name'))
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name == 'Synthetic site'
        assert db.scalars(select(AdminEvent)).all() == []
    assert apply(e,token).status_code == 200
    assert apply(e,token).status_code == 200
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name == 'New synthetic name'
        events=db.scalars(select(AdminEvent)).all()
        assert len(events)==1 and events[0].action=='site_renamed'
        assert events[0].actor_id==e.ids['owner']
        assert events[0].details=={'before':'Synthetic site','after':'New synthetic name'}


def test_confirmation_owner_and_current_assignment(codex_env):
    e=codex_env
    token=proposal(e,action('rename_site',handle('S',e.ids['site']),'New synthetic name'))
    assert apply(e,token,'other').status_code == 410
    with e.api.state.db() as db:
        assignment=db.scalar(select(Assignment).where(Assignment.user_id==e.ids['owner']))
        db.delete(assignment); db.commit()
    assert apply(e,token).status_code == 403
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name == 'Synthetic site'
        assert db.scalars(select(AdminEvent)).all()==[]


def test_stale_site_name_conflict(codex_env):
    e=codex_env
    token=proposal(e,action('rename_site',handle('S',e.ids['site']),'Requested name'))
    with e.api.state.db() as db:
        db.get(Site,e.ids['site']).name='Concurrent name'; db.commit()
    assert apply(e,token).status_code==409
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name=='Concurrent name'


@pytest.mark.parametrize('kind,expected',[('review_report','reviewed'),('return_report','needs_revision')])
def test_review_and_return_use_existing_audit(codex_env,kind,expected):
    e=codex_env;rid=create_report(e,'submitted')
    token=proposal(e,action(kind,handle('R',rid),reason='Synthetic review reason'))
    with e.api.state.db() as db: assert db.get(Report,rid).status=='submitted'
    assert apply(e,token).status_code==200
    assert apply(e,token).status_code==200
    with e.api.state.db() as db:
        assert db.get(Report,rid).status==expected
        events=db.scalars(select(Change).where(Change.report_id==rid,Change.event==expected)).all()
        assert len(events)==1 and events[0].reason=='Synthetic review reason'
        assert events[0].actor_id==e.ids['owner']


@pytest.mark.parametrize('status',['draft','needs_revision'])
def test_comment_preserves_payload_and_audit(codex_env,status):
    e=codex_env
    rid=create_report(e,status,{'comment':'Original comment','crew':'Synthetic crew',
        'materials':[{'name':'Synthetic steel','quantity':'2','unit':'m'}],
        'incidents':[{'description':'Synthetic delay'}],
        'financial_entries':[{'id':'10000000-0000-4000-8000-000000000001','kind':'expense',
                              'operation_date':'2026-10-25','amount_kopecks':12345,'category':'Synthetic cost'}],
        'equipment':[{'type':'Synthetic crane','hours':'2','hired':True}],
        'next_shift_plans':['Synthetic next step']})
    with e.api.state.db() as db: before=copy.deepcopy(db.get(Report,rid).payload)
    token=proposal(e,action('set_comment',handle('R',rid),'New comment','Requested comment change'))
    assert apply(e,token).status_code==200
    with e.api.state.db() as db:
        row=db.get(Report,rid)
        assert row.payload=={**before,'comment':'New comment'}
        assert row.revision==2
        event=db.scalar(select(Change).where(Change.report_id==rid,Change.event=='edited'))
        assert event.payload_before==before and event.reason=='Requested comment change'


@pytest.mark.parametrize('bad',[
    action('rename_site','Sunknown','Bad'), action('rename_site','Runknown','Bad'),
    action('delete_report','Runknown'), action('rename_site','Sunknown',''),
    {'kind':'rename_site'}, 'invalid', None,
    {'kind':'rename_site','target':{},'value':'Bad','reason':'Bad'},
])
def test_malformed_actions_and_handles_do_not_mutate(codex_env,bad):
    e=codex_env
    r=chat(e,[bad]);assert r.status_code==200,r.text;assert r.json()['actions']==[]
    assert apply(e,'unknown-token-with-sufficient-length').status_code==410
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name=='Synthetic site'
        assert db.scalars(select(AdminEvent)).all()==[]


def test_catalog_excludes_unassigned_site_and_raw_report_data(codex_env):
    e=codex_env;rid=create_report(e,extras={'comment':'PRIVATE_SYNTHETIC_COMMENT','crew':'PRIVATE_SYNTHETIC_CREW'})
    assert chat(e,[]).status_code==200
    catalog=str(e.calls[-1]['catalog'])
    assert e.ids['forbidden'] not in catalog and 'Forbidden synthetic site' not in catalog
    assert rid not in catalog and e.ids['worker'] not in catalog
    assert 'PRIVATE_SYNTHETIC_COMMENT' not in catalog and 'PRIVATE_SYNTHETIC_CREW' not in catalog


@pytest.mark.parametrize('status',['draft','needs_revision','reviewed'])
def test_review_only_submitted_reports(codex_env,status):
    e=codex_env;rid=create_report(e,status)
    assert chat(e,[action('review_report',handle('R',rid))]).json()['actions']==[]


def test_historical_reports_and_blank_return_reason_are_not_actionable(codex_env):
    e=codex_env;rid=create_report(e,'submitted')
    assert chat(e,[action('return_report',handle('R',rid),reason=' ')]).json()['actions']==[]
    with e.api.state.db() as db:
        db.add(ReportSource(report_id=rid,payload={'_trusted_import':True}));db.commit()
    assert chat(e,[action('review_report',handle('R',rid))]).json()['actions']==[]


def test_stale_report_version_refuses_mutation(codex_env):
    e=codex_env;rid=create_report(e,'submitted')
    token=proposal(e,action('review_report',handle('R',rid)))
    with e.api.state.db() as db:
        row=db.get(Report,rid);row.payload={**row.payload,'comment':'Concurrent comment'};db.commit()
    assert apply(e,token).status_code==409
    with e.api.state.db() as db: assert db.get(Report,rid).status=='submitted'


def test_disabling_assistant_prevents_pending_action(codex_env,monkeypatch):
    e=codex_env
    token=proposal(e,action('rename_site',handle('S',e.ids['site']),'Must not apply'))
    monkeypatch.setenv('CRS_CODEX_ENABLED','0')
    assert apply(e,token).status_code==503
    with e.api.state.db() as db:
        assert db.get(Site,e.ids['site']).name=='Synthetic site'
        assert db.scalars(select(AdminEvent)).all()==[]


@pytest.mark.parametrize('invalid',[
    None, [], 'invalid',
    {'answer':'ok','sources':None,'actions':[]},
    {'answer':'ok','sources':[{}],'actions':[]},
    {'answer':'ok','sources':[],'actions':[{'kind':'delete','target':'R1','value':'','reason':''}]},
    {'answer':'ok','sources':[],'actions':[{'kind':'rename_site','target':'S1','value':{},'reason':''}]},
])
def test_adapter_rejects_malformed_cli_output_without_external_process(tmp_path,monkeypatch,invalid):
    monkeypatch.setenv('CRS_CODEX_WORK',str(tmp_path/'codex-work'))
    monkeypatch.setenv('PRIVATE_TEST_SECRET','Never inherit this synthetic value')
    monkeypatch.setattr(codex_provider,'status',lambda:{'enabled':True})
    monkeypatch.setattr(codex_provider,'executable',lambda:'synthetic-codex.exe')
    monkeypatch.setattr(codex_provider,'_reserve',lambda _:None)

    class FakeProcess:
        returncode=0
        def __init__(self,command,**kwargs):
            assert 'PRIVATE_TEST_SECRET' not in kwargs['env']
            assert kwargs['stdout']==codex_provider.subprocess.DEVNULL
            assert kwargs['stderr']==codex_provider.subprocess.DEVNULL
            output=Path(command[command.index('--output-last-message')+1])
            output.write_text(json.dumps(invalid),encoding='utf-8')
        def communicate(self,prompt,timeout):
            assert timeout==90

    monkeypatch.setattr(codex_provider.subprocess,'Popen',FakeProcess)
    summary={'report_count':0,'no_work_count':0,'incident_count':0,'material_count':0,
             'period':{},'volumes':[],'financial_totals_kopecks':{},'equipment_hours':[],
             'material_movements':[],'daily':[]}
    with pytest.raises(codex_provider.AIUnavailable):
        codex_provider.run('Synthetic question',summary,{'sites':[],'reports':[]},[],'synthetic-owner')
    assert list((tmp_path/'codex-work').iterdir())==[]
