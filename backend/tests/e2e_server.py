"""Ephemeral synthetic API for browser tests. Never targets DATABASE_URL or customer storage."""
import sys, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import uvicorn
from fastapi.testclient import TestClient
from app.main import create_app, User, Site, Assignment, hash_password, new_id

scratch=tempfile.TemporaryDirectory(prefix='crs-e2e-')
api=create_app(database_url=f'sqlite:///{scratch.name}/test.db',storage=f'{scratch.name}/photos',initialize=True)
with api.state.db() as db:
    admin=User(login='admin',password_hash=hash_password('SyntheticPassword123'),role='admin')
    manager=User(login='manager',password_hash=hash_password('SyntheticPassword123'),role='manager')
    other=User(login='other',password_hash=hash_password('SyntheticPassword123'),role='manager')
    foreman=User(login='foreman',password_hash=hash_password('SyntheticPassword123'),role='foreman')
    site=Site(name='Synthetic site A');site_b=Site(name='Synthetic site B')
    db.add_all([admin,manager,other,foreman,site,site_b]);db.flush()
    db.add_all([Assignment(user_id=manager.id,site_id=site.id),Assignment(user_id=foreman.id,site_id=site.id),Assignment(user_id=other.id,site_id=site_b.id)])
    db.commit();sid=site.id
client=TestClient(api)
token=client.post('/api/v1/auth/login',json={'login':'manager','password':'SyntheticPassword123'}).json()['access_token']
headers={'Authorization':'Bearer '+token}
foreman_token=client.post('/api/v1/auth/login',json={'login':'foreman','password':'SyntheticPassword123'}).json()['access_token']
for day,quantity in [('2026-10-24','1.5'),('2026-10-25','2.5')]:
    data={'client_report_id':new_id(),'site_id':sid,'work_date':day,'kind':'work','work_entries':[{'type':'Synthetic weld','quantity':quantity,'unit':'m','description':'Synthetic work description'}]}
    if day=='2026-10-25':data.update({'crew':'Synthetic crew','materials':[{'name':'Synthetic material','quantity':'2.5','unit':'m'},{'name':'Synthetic paint','unit':'bucket'}],'incidents':[{'description':'Synthetic incident'}],
        'financial_entries':[{'id':new_id(),'kind':'expense','operation_date':'2026-10-20','amount_kopecks':12550,'category':'Synthetic fuel'}],
        'equipment':[{'type':'Synthetic crane','hours':'7.5','hired':True}],
        'next_shift_plans':['Synthetic next step']})
    author_headers=headers if day=='2026-10-25' else {'Authorization':'Bearer '+foreman_token}
    r=client.post('/api/v1/reports',headers=author_headers,json=data).json()
    if day=='2026-10-25':
        response=client.put(f"/api/v1/reports/{r['id']}/source",headers=headers,json={'source_ref':'synthetic-message','text':'Synthetic historical source','reported_author':'Synthetic author','message_date':'2026-10-26'})
        assert response.status_code==200,response.text
    response=client.post(f"/api/v1/reports/{r['id']}/submit",headers={**author_headers,'X-Report-Capabilities':'report-extras-v2'},json={'expected_revision':1})
    assert response.status_code==200,response.text
if __name__=='__main__':uvicorn.run(api,host='127.0.0.1',port=8000)
