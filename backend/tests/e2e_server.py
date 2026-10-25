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
    manager=User(login='manager',password_hash=hash_password('SyntheticPassword123'),role='manager')
    other=User(login='other',password_hash=hash_password('SyntheticPassword123'),role='manager')
    site=Site(name='Synthetic site A');site_b=Site(name='Synthetic site B')
    db.add_all([manager,other,site,site_b]);db.flush()
    db.add_all([Assignment(user_id=manager.id,site_id=site.id),Assignment(user_id=other.id,site_id=site_b.id)])
    db.commit();sid=site.id
client=TestClient(api)
token=client.post('/api/v1/auth/login',json={'login':'manager','password':'SyntheticPassword123'}).json()['access_token']
headers={'Authorization':'Bearer '+token}
for day,quantity in [('2026-10-24','1.5'),('2026-10-25','2.5')]:
    r=client.post('/api/v1/reports',headers=headers,json={'client_report_id':new_id(),'site_id':sid,'work_date':day,'kind':'work','work_entries':[{'type':'Synthetic weld','quantity':quantity,'unit':'m'}]}).json()
    client.post(f"/api/v1/reports/{r['id']}/submit",headers=headers,json={'expected_revision':1})
if __name__=='__main__':uvicorn.run(api,host='127.0.0.1',port=8000)
