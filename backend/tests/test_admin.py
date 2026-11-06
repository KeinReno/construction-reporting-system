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

def test_admin_does_not_review_as_second_checker(admin_env):
    c,a,f,m,sid,_=admin_env
    created=c.post('/api/v1/reports',headers=f,json=report(sid)).json()
    rid=created['id']
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==200
    assert c.post(f'/api/v1/reports/{rid}/review',headers=a,json={'expected_revision':1,'decision':'reviewed'}).status_code==403
    assert c.post(f'/api/v1/reports/{rid}/review',headers=m,json={'expected_revision':1,'decision':'reviewed'}).status_code==200

def test_static_and_ready(tmp_path,monkeypatch):
    public=tmp_path/'www';public.mkdir();(public/'index.html').write_text('<html>synthetic</html>')
    monkeypatch.setenv('WEB_DIR',str(public))
    api=create_app(database_url=f'sqlite:///{tmp_path}/t.db',storage=tmp_path/'private',initialize=True)
    c=TestClient(api)
    assert c.get('/').status_code==200
    (public/'private.env').write_text('SecretNotServed')
    assert c.get('/private.env').status_code==404
    assert c.get('/ready').json()=={'status':'ready'}
    assert c.get('/api/v1/admin/users').status_code==401
    assert c.get('/api/v1/no-such-route').status_code==404
    empty=create_app(database_url=f'sqlite:///{tmp_path}/empty.db',storage=tmp_path/'private')
    assert TestClient(empty).get('/ready').status_code==503
    with pytest.raises(RuntimeError,match='separate'):create_app(database_url=f'sqlite:///{tmp_path}/t.db',storage=public/'photos')

def test_old_password_login_cannot_survive_concurrent_reset(admin_env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    from app.main import Token
    c,a,f,m,sid,_=admin_env
    uid=c.post('/api/v1/admin/users',headers=a,json={'login':'racing','password':'SyntheticSecret123'}).json()['id']
    issued=Event();release=Event()
    def before_flush(session,ctx,instances):
        if any(isinstance(x,Token) and x.user_id==uid for x in session.new):
            issued.set();assert release.wait(10)
    event.listen(Session,'before_flush',before_flush)
    try:
        with ThreadPoolExecutor(1) as pool:
            login=pool.submit(lambda:c.post('/api/v1/auth/login',json={'login':'racing','password':'SyntheticSecret123'}))
            try:
                assert issued.wait(10)
                assert c.patch('/api/v1/admin/users/'+uid,headers=a,json={'password':'ChangedSecret123'}).status_code==200
            finally:release.set()
            response=login.result(timeout=10)
    finally:event.remove(Session,'before_flush',before_flush)
    if response.status_code==200:
        assert c.get('/api/v1/me',headers={'Authorization':'Bearer '+response.json()['access_token']}).status_code==401
    else:assert response.status_code==401
    new=c.post('/api/v1/auth/login',json={'login':'racing','password':'ChangedSecret123'}).json()['access_token']
    assert c.get('/api/v1/me',headers={'Authorization':'Bearer '+new}).status_code==200

def test_concurrent_password_resets_increment_generation_atomically(admin_env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy import event
    c,a,*_=admin_env
    uid=c.post('/api/v1/admin/users',headers=a,json={'login':'double','password':'SyntheticSecret123'}).json()['id']
    with c.api.state.db() as db:engine=db.bind
    barrier=Barrier(2)
    def before_sql(conn,cursor,statement,parameters,ctx,many):
        if statement.startswith('DELETE FROM tokens'):barrier.wait(timeout=10)
    event.listen(engine,'before_cursor_execute',before_sql)
    try:
        with ThreadPoolExecutor(2) as pool:responses=list(pool.map(lambda i:c.patch('/api/v1/admin/users/'+uid,headers=a,json={'password':f'ChangedSecret{i}123'}),range(2)))
    finally:event.remove(engine,'before_cursor_execute',before_sql)
    assert [r.status_code for r in responses]==[200,200]
    with c.api.state.db() as db:assert db.get(User,uid).auth_version==3

def test_proxy_limiter_separates_clients_and_rejects_untrusted_forwarded_headers(env):
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
    c,f,m,sid,_=env
    proxy=TestClient(ProxyHeadersMiddleware(c.api,trusted_hosts=['127.0.0.1']),client=('127.0.0.1',5000))
    for _ in range(10):assert proxy.post('/api/v1/auth/login',headers={'X-Forwarded-For':'198.51.100.1'},json={'login':'foreman','password':'bad'}).status_code==401
    assert proxy.post('/api/v1/auth/login',headers={'X-Forwarded-For':'198.51.100.2'},json={'login':'foreman','password':'StrongPassword123'}).status_code==200
    untrusted=TestClient(ProxyHeadersMiddleware(c.api,trusted_hosts=['127.0.0.1']),client=('198.51.100.3',5000))
    for i in range(10):assert untrusted.post('/api/v1/auth/login',headers={'X-Forwarded-For':f'203.0.113.{i}'},json={'login':'foreman','password':'bad'}).status_code==401
    assert untrusted.post('/api/v1/auth/login',headers={'X-Forwarded-For':'203.0.113.100'},json={'login':'foreman','password':'StrongPassword123'}).status_code==429
