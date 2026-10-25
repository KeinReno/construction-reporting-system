import pytest
from fastapi.testclient import TestClient
from app.main import User,hash_password,create_app
from test_api import env,report

@pytest.fixture
def admin_env(env):
    c,f,m,sid,other=env
    with c.api.state.db() as db:
        admin=User(login='admin',password_hash=hash_password('SyntheticAdmin123'),role='admin');db.add(admin);db.commit();uid=admin.id
    token=c.post('/api/v1/auth/login',json={'login':'admin','password':'SyntheticAdmin123'}).json()['access_token']
    return c,{'Authorization':'Bearer '+token},f,m,sid,uid

def test_admin_create_grant_revoke_and_audit(admin_env):
    c,a,f,m,sid,_=admin_env
    for headers in [f,m,{}]:
        assert c.get('/api/v1/admin/users',headers=headers).status_code in (401,403)
        assert c.post('/api/v1/admin/sites',headers=headers,json={'name':'Blocked'}).status_code in (401,403)
    u=c.post('/api/v1/admin/users',headers=a,json={'login':'new','password':'SyntheticSecret123','role':'foreman'});assert u.status_code==201,u.text
    uid=u.json()['id'];assert 'password' not in u.text and 'hash' not in u.text
    site=c.post('/api/v1/admin/sites',headers=a,json={'name':'New synthetic site'}).json()
    granted=c.post('/api/v1/admin/assignments',headers=a,json={'user_id':uid,'site_id':site['id']});assert granted.status_code==201
    assert c.post('/api/v1/admin/assignments',headers=a,json={'user_id':uid,'site_id':site['id']}).status_code==200
    t=c.post('/api/v1/auth/login',json={'login':'new','password':'SyntheticSecret123'}).json()['access_token'];h={'Authorization':'Bearer '+t}
    assert c.get('/api/v1/sites',headers=h).json()==[site]
    assert c.delete('/api/v1/admin/assignments/'+granted.json()['id'],headers=a).status_code==200
    assert c.get('/api/v1/sites',headers=h).json()==[]
    assert c.post('/api/v1/reports',headers=h,json=report(site['id'])).status_code==403
    audit=c.get('/api/v1/admin/audit',headers=a).json()
    assert {'access_granted','access_revoked','user_created','site_created'} <= {x['action'] for x in audit}
    assert 'SyntheticSecret123' not in str(audit) and all(x['actor_id'] for x in audit)

def test_admin_deactivate_password_reset_and_self_protection(admin_env):
    c,a,f,m,sid,admin_id=admin_env
    uid=c.post('/api/v1/admin/users',headers=a,json={'login':'new','password':'SyntheticSecret123'}).json()['id']
    def token(password):return c.post('/api/v1/auth/login',json={'login':'new','password':password})
    old=token('SyntheticSecret123').json()['access_token']
    assert c.patch('/api/v1/admin/users/'+uid,headers=a,json={'password':'ChangedSecret123'}).status_code==200
    assert c.get('/api/v1/me',headers={'Authorization':'Bearer '+old}).status_code==401
    assert token('SyntheticSecret123').status_code==401
    current=token('ChangedSecret123').json()['access_token']
    assert c.patch('/api/v1/admin/users/'+uid,headers=a,json={'active':False}).status_code==200
    assert c.get('/api/v1/me',headers={'Authorization':'Bearer '+current}).status_code==401
    assert c.patch('/api/v1/admin/users/'+admin_id,headers=a,json={'active':False}).status_code==409
    assert c.patch('/api/v1/admin/users/'+uid,headers=a,json={'role':'admin'}).status_code==422
    denied=c.post('/api/v1/admin/users',headers=a,json={'login':'bad','password':'secret'})
    assert denied.status_code==422 and 'secret' not in denied.text

def test_static_and_ready(tmp_path,monkeypatch):
    public=tmp_path/'www';public.mkdir();(public/'index.html').write_text('<html>synthetic</html>')
    monkeypatch.setenv('WEB_DIR',str(public))
    api=create_app(database_url=f'sqlite:///{tmp_path}/t.db',storage=tmp_path/'private',initialize=True)
    c=TestClient(api)
    assert c.get('/').status_code==200
    assert c.get('/ready').json()=={'status':'ready'}
    assert c.get('/api/v1/admin/users').status_code==401
    assert c.get('/api/v1/no-such-route').status_code==404
    empty=create_app(database_url=f'sqlite:///{tmp_path}/empty.db',storage=tmp_path/'private')
    assert TestClient(empty).get('/ready').status_code==503
    with pytest.raises(RuntimeError,match='separate'):create_app(database_url=f'sqlite:///{tmp_path}/t.db',storage=public/'photos')
