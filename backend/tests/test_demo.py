import importlib.util,json,shutil,sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[2]

def demo_module():
    spec=importlib.util.spec_from_file_location('windows_demo',ROOT/'scripts/demo/windows_demo.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

@pytest.fixture
def bundle(tmp_path,monkeypatch):
    for key in ['WEB_DIR','DATABASE_URL','UPLOAD_DIR']:monkeypatch.setenv(key,'')
    spec=importlib.util.spec_from_file_location('prepare_demo',ROOT/'scripts/prepare_demo.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    generated=m.prepare();root=tmp_path/'bundle';(root/'web').mkdir(parents=True);(root/'web/index.html').write_text('<h1>Synthetic demo</h1>');shutil.copytree(generated,root/'demo');return root

def test_demo_seed_photos_and_persistence(bundle,tmp_path):
    module=demo_module();private=tmp_path/'private'
    app=module.create_demo(private,bundle);c=TestClient(app)
    assert c.get('/').status_code==200
    info=c.get('/demo-info').json();assert 'ДЕМО' in info['notice']
    token=c.post('/api/v1/auth/login',json={'login':info['accounts']['manager'],'password':info['password']}).json()['access_token'];h={'Authorization':'Bearer '+token}
    rows=c.get('/api/v1/reports',headers=h).json();assert len(rows)==6
    assert all('Демо' in s['name'] for s in c.get('/api/v1/sites',headers=h).json())
    summary=c.get('/api/v1/analytics/summary',headers=h).json()
    assert summary['report_count']==5 and summary['no_work_count']==1
    assert len(summary['volumes'])==1 and summary['volumes'][0]['quantity']=='8.5'
    assert summary['incident_count']==1
    synthetic=next(r for r in rows if r['data'].get('crew'))
    assert synthetic['data']['materials'][0]['name']=='Учебный материал'
    assert synthetic['data']['incidents'][0]['description'].startswith('Учебное событие')
    assert synthetic['data']['financial_entries'][0]['amount_kopecks']==12550
    assert synthetic['data']['equipment'][0]['hours']=='7.5'
    assert synthetic['data']['next_shift_plans']==['Проверить допуск на участок']
    assert summary['financial_totals_kopecks']=={'expense':12550}
    assert c.get('/api/v1/reports/by-client/'+synthetic['client_report_id'],headers=h).status_code==409
    assert c.get('/api/v1/reports/by-client/'+synthetic['client_report_id'],headers={**h,'X-Report-Capabilities':'report-extras-v1'}).status_code==409
    assert c.get('/api/v1/reports/by-client/'+synthetic['client_report_id'],headers={**h,'X-Report-Capabilities':'report-extras-v2'}).status_code==200
    photo=rows[0]['data']['required_photo_ids'][0]
    assert c.get('/api/v1/attachments/'+photo).status_code==401
    assert c.get('/api/v1/attachments/'+photo,headers=h).content.startswith(b'\x89PNG')
    selected=next(r for r in rows if r['status']=='submitted')
    assert c.post('/api/v1/reports/'+selected['id']+'/review',headers=h,json={'expected_revision':1,'decision':'reviewed'}).status_code==200
    again=module.create_demo(private,bundle);c2=TestClient(again)
    assert len(c2.get('/api/v1/reports',headers=h).json())==6
    assert c2.get('/api/v1/reports/'+selected['id'],headers=h).json()['status']=='reviewed'
    app.state.db.kw['bind'].dispose();again.state.db.kw['bind'].dispose()
