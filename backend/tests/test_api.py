import uuid, hashlib, io, os
from PIL import Image
import pytest
from fastapi.testclient import TestClient
from app.main import create_app,User,Site,Assignment,hash_password,Base
from sqlalchemy import create_engine

def uid():return str(uuid.uuid4())
@pytest.fixture
def env(tmp_path):
    if os.getenv('TEST_DATABASE_URL'):
        engine=create_engine(os.environ['TEST_DATABASE_URL']);Base.metadata.drop_all(engine);engine.dispose()
    api=create_app(database_url=os.getenv('TEST_DATABASE_URL',f'sqlite:///{tmp_path}/t.db'),storage=str(tmp_path/'photos'),initialize=True)
    with api.state.db() as db:
        s=Site(name='Synthetic object');s2=Site(name='Other object')
        u=User(login='foreman',password_hash=hash_password('StrongPassword123'),role='foreman')
        manager=User(login='manager',password_hash=hash_password('StrongPassword123'),role='manager')
        db.add_all([s,s2,u,manager]);db.flush();db.add_all([Assignment(user_id=u.id,site_id=s.id),Assignment(user_id=manager.id,site_id=s.id)]);db.commit();sid=s.id;forbidden=s2.id
    c=TestClient(api)
    c.api=api
    def token(name):return {'Authorization':'Bearer '+c.post('/api/v1/auth/login',json={'login':name,'password':'StrongPassword123'}).json()['access_token']}
    return c,token('foreman'),token('manager'),sid,forbidden

def report(sid,kind='work',photos=None):
    return {'client_report_id':uid(),'site_id':sid,'work_date':'2026-10-25','kind':kind,'no_work_reason':'No access' if kind=='no_work' else None,
            'work_entries':[] if kind=='no_work' else [{'type':'Weld','quantity':'2','unit':'pcs'}],'required_photo_ids':photos or []}

def test_auth_acl(env):
    c,f,m,sid,other=env
    assert c.get('/api/v1/sites').status_code==401
    assert len(c.get('/api/v1/sites',headers=f).json())==1
    assert c.post('/api/v1/reports',headers=f,json=report(other)).status_code==403

def test_idempotent_receipt_summary(env):
    c,f,m,sid,_=env;d=report(sid)
    one=c.post('/api/v1/reports',headers=f,json=d);assert one.status_code==201,one.text
    again=c.post('/api/v1/reports',headers=f,json=d);assert again.json()['id']==one.json()['id']
    rid=one.json()['id'];submitted=c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1});assert submitted.status_code==200
    assert submitted.json()['receipt_id']
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).json()['receipt_id']==submitted.json()['receipt_id']
    assert c.get('/api/v1/analytics/summary',headers=m).json()['volumes'][0]['quantity']=='2'
    assert c.get(f'/api/v1/reports/by-client/{d["client_report_id"]}',headers=f).json()['id']==rid

def test_revision_no_work(env):
    c,f,m,sid,_=env;d=report(sid,'no_work');r=c.post('/api/v1/reports',headers=f,json=d).json();rid=r['id']
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==200
    assert c.post(f'/api/v1/reports/{rid}/review',headers=m,json={'expected_revision':1,'decision':'needs_revision','reason':'Clarify'}).status_code==200
    d['no_work_reason']='Permit not granted'
    ed=c.patch(f'/api/v1/reports/{rid}',headers=f,json={'expected_revision':1,'data':d,'reason':'Clarify reason'});assert ed.status_code==200,ed.text
    assert ed.json()['revision']==2
    assert c.patch(f'/api/v1/reports/{rid}',headers=f,json={'expected_revision':1,'data':d,'reason':'Outdated'}).status_code==409

def test_photos_required(env):
    c,f,m,sid,_=env;pid=uid();r=c.post('/api/v1/reports',headers=f,json=report(sid,photos=[pid])).json();rid=r['id']
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==422
    image=io.BytesIO();Image.new('RGB',(2,2)).save(image,format='JPEG');blob=image.getvalue();sha=hashlib.sha256(blob).hexdigest();headers={**f,'Content-Type':'image/jpeg','X-Content-SHA256':sha}
    put=c.put(f'/api/v1/reports/{rid}/attachments/{pid}',headers=headers,content=blob)
    assert put.status_code==200,put.text
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==200
    assert c.get(f'/api/v1/attachments/{pid}',headers=f).content==blob

def test_extended_report_survives_legacy_retries_and_edits(env):
    c,f,m,sid,_=env;legacy=report(sid)
    first=c.post('/api/v1/reports',headers=f,json=legacy)
    assert c.post('/api/v1/reports',headers=f,json=legacy).json()['id']==first.json()['id']
    data=report(sid);data.update({'crew':'Synthetic crew','materials':[{'name':'Synthetic steel','quantity':'2.5','unit':'m'}],'incidents':[{'description':'No access'}]})
    result=c.post('/api/v1/reports',headers=f,json=data);assert result.status_code==201,result.text
    rid=result.json()['id'];assert c.post('/api/v1/reports',headers=f,json=data).status_code==200
    capable={**f,'X-Report-Capabilities':'report-extras-v1'}
    assert c.get(f'/api/v1/reports/by-client/{data["client_report_id"]}',headers=f).status_code==409
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==409
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=capable,json={'expected_revision':1}).status_code==200
    assert c.post(f'/api/v1/reports/{rid}/review',headers=m,json={'expected_revision':1,'decision':'needs_revision','reason':'Clarify'}).status_code==200
    without_new={k:v for k,v in data.items() if k not in ('crew','materials','incidents')}
    edit={'expected_revision':1,'reason':'Correction','data':without_new}
    assert c.patch(f'/api/v1/reports/{rid}',headers=f,json=edit).status_code==409
    assert c.get(f'/api/v1/reports/{rid}',headers=m).json()['data']['crew']=='Synthetic crew'
    data['comment']='Clarified';edit['data']=data
    response=c.patch(f'/api/v1/reports/{rid}',headers=f,json=edit);assert response.status_code==200,response.text
    assert response.json()['data']['materials'][0]['quantity']=='2.5'
    assert response.json()['data']['incidents'][0]['description']=='No access'
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=capable,json={'expected_revision':2}).status_code==200
    assert c.post(f'/api/v1/reports/{rid}/review',headers=m,json={'expected_revision':2,'decision':'needs_revision','reason':'Clarify again'}).status_code==200
    data['materials']=None
    response=c.patch(f'/api/v1/reports/{rid}',headers=f,json={'expected_revision':2,'reason':'Remove material','data':data})
    assert response.status_code==200 and 'materials' not in response.json()['data']
    events=c.get(f'/api/v1/reports/{rid}/history',headers=m).json()
    assert any(e['payload_before'].get('materials') for e in events if e['payload_before'])

def test_no_work_can_preserve_materials_and_incidents_without_fake_work(env):
    c,f,m,sid,_=env;data=report(sid,'no_work')
    data.update({'materials':[{'name':'Synthetic delivery'}],'incidents':[{'description':'No access'}]})
    result=c.post('/api/v1/reports',headers=f,json=data)
    assert result.status_code==201,result.text
    assert result.json()['data']['work_entries']==[]
    assert result.json()['data']['incidents'][0]['description']=='No access'
