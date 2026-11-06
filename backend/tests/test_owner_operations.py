import uuid
from sqlalchemy import select
from app.main import User, AdminEvent
from test_api import env

def owner(c):
    with c.api.state.db() as db:c.api.state.owner_user_id=db.scalar(select(User.id).where(User.login=='manager'))

def test_catalog_owner_revision_archive_and_acl(env):
    c,f,m,sid,other=env
    data={'name':'Synthetic main','kind':'main'}
    assert c.post('/api/v1/owner/work-types',headers=m,json=data).status_code==403
    owner(c)
    assert c.post('/api/v1/owner/work-types',headers=f,json=data).status_code==403
    w=c.post('/api/v1/owner/work-types',headers=m,json=data).json()
    child=c.post('/api/v1/owner/work-types',headers=m,json={'name':'Synthetic aux','kind':'auxiliary','parent_id':w['id']}).json()
    changed={**data,'name':'Synthetic renamed','expected_revision':w['revision']}
    updated=c.patch('/api/v1/owner/work-types/'+w['id'],headers=m,json=changed)
    assert updated.status_code==200 and updated.json()['revision']==2
    assert c.post('/api/v1/owner/work-types',headers=m,json=data).status_code==409
    assert c.post('/api/v1/owner/work-types',headers=m,json={**data,'name':data['name'].upper()}).status_code==409
    assert c.patch('/api/v1/owner/work-types/'+w['id'],headers=m,json=changed).status_code==409
    assert c.patch('/api/v1/owner/work-types/'+w['id'],headers=m,json={**changed,'expected_revision':2,'active':False}).status_code==409
    assert c.patch('/api/v1/owner/work-types/'+child['id'],headers=m,json={'name':child['name'],'kind':'auxiliary','parent_id':w['id'],'active':False,'expected_revision':1}).status_code==200
    assert c.patch('/api/v1/owner/work-types/'+w['id'],headers=m,json={**changed,'expected_revision':2,'active':False}).status_code==200
    assert len(c.get('/api/v1/reference/work-types',headers=f).json())==2

def test_labor_day_fixed_rate_idempotency_revision_audit_and_acl(env):
    c,f,m,sid,other=env;owner(c)
    worker=c.post('/api/v1/owner/workers',headers=m,json={'name':'Synthetic Worker'}).json()
    did=str(uuid.uuid4())
    data={'id':did,'worker_id':worker['id'],'site_id':sid,'work_date':'2026-11-06','worked':True,'business_trip':True,'allowance_kopecks':10000,'fine_kopecks':2000,'reason':'Synthetic adjustment'}
    path='/api/v1/owner/labor-days/'+did
    assert c.put(path,headers=f,json=data).status_code==403
    assert c.put(path,headers=m,json={**data,'site_id':other}).status_code==403
    assert c.put(path,headers=m,json={**data,'reason':''}).status_code==422
    first=c.put(path,headers=m,json=data);assert first.status_code==200,first.text
    assert first.json()['base_kopecks']==500000 and first.json()['total_kopecks']==508000
    assert c.put(path,headers=m,json=data).json()==first.json()
    assert c.put(path,headers=m,json={**data,'worked':False}).status_code==409
    updated=c.put(path,headers=m,json={**data,'worked':False,'expected_revision':1})
    assert updated.status_code==200 and updated.json()['base_kopecks']==0 and updated.json()['revision']==2
    duplicate=str(uuid.uuid4())
    assert c.put('/api/v1/owner/labor-days/'+duplicate,headers=m,json={**data,'id':duplicate}).status_code==409
    assert len(c.get('/api/v1/owner/labor-days',headers=m).json())==1
    assert c.get('/api/v1/owner/labor-days',headers=f).status_code==403
    with c.api.state.db() as db:
        events=db.scalars(select(AdminEvent).where(AdminEvent.action=='labor_day_saved')).all()
        assert len(events)==2 and events[1].details['before']['base_kopecks']==500000


def test_custom_work_catalog_analytics_keeps_renamed_archived_types(env):
    from test_production_analytics import submit
    c,f,m,sid,_=env;owner(c)
    main=c.post('/api/v1/owner/work-types',headers=m,json={'name':'Synthetic special installation','kind':'main'}).json()
    submit(c,f,sid,date='2026-03-10',entries=['Synthetic special installation'])
    changed=c.patch('/api/v1/owner/work-types/'+main['id'],headers=m,json={'name':'Synthetic renamed installation','kind':'main','active':False,'expected_revision':1})
    assert changed.status_code==200
    result=c.get('/api/v1/analytics/production',headers=m).json()
    assert next(k for k in result['work_kinds'] if k['key']==main['id'])['day_count']==1


def test_conversation_source_fallback_and_object_acl(env):
    from test_api import report
    c,f,m,sid,other=env
    data=report(sid);rid=c.post('/api/v1/reports',headers=f,json=data).json()['id']
    assert c.put('/api/v1/reports/'+rid+'/source',headers=f,json={'source_ref':'synthetic-message','text':'Synthetic conversation','message_date':'2026-10-24'}).status_code==200
    path='/api/v1/reports/'+rid+'/conversation'
    assert c.get(path).status_code==401 and c.get(path,headers=f).status_code==403
    response=c.get(path,headers=m);assert response.status_code==200
    assert response.json()['items'][0]['relation']=='same_report'
    assert response.json()['items'][0]['date']=='2026-10-24'
    with c.api.state.db() as db:
        from app.main import Assignment
        from sqlalchemy import delete
        db.execute(delete(Assignment).where(Assignment.site_id==sid,Assignment.user_id==db.scalar(select(User.id).where(User.login=='manager'))));db.commit()
    assert c.get(path,headers=m).status_code==403


def test_labor_summary_filters_acl_and_distinct_worker_identity(env):
    from app.main import Assignment
    from sqlalchemy import delete
    c,f,m,sid,other=env;owner(c)
    workers=[c.post('/api/v1/owner/workers',headers=m,json={'name':'Synthetic same name'}).json()['id'] for _ in range(2)]
    with c.api.state.db() as db:
        db.add(Assignment(user_id=c.api.state.owner_user_id,site_id=other));db.commit()
    def day(worker,date,site,**extras):
        did=str(uuid.uuid4())
        data={'id':did,'worker_id':worker,'site_id':site,'work_date':date,**extras}
        response=c.put('/api/v1/owner/labor-days/'+did,headers=m,json=data)
        assert response.status_code==200,response.text
        return did
    first=day(workers[0],'2026-03-01',sid,allowance_kopecks=1000,fine_kopecks=200,reason='Synthetic adjustment')
    second=day(workers[0],'2026-03-02',sid,worked=False,business_trip=True,allowance_kopecks=300,reason='Synthetic trip')
    third=day(workers[1],'2026-03-01',sid)
    fourth=day(workers[0],'2026-03-03',other)
    path='/api/v1/owner/labor-summary'
    assert c.get(path,headers=f).status_code==403
    result=c.get(path,headers=m).json()
    assert result['totals']['worked_days']==3
    assert result['totals']['worked_calendar_days']==2
    assert result['totals']['total_kopecks']==3*500000+1000+300-200
    assert set(result['totals']['source_day_ids'])=={d['id'] for d in result['days']}
    assert len(result['by_worker'])==2, 'identical display names must not merge identities'
    assert {r['worker_id'] for r in result['by_worker']}==set(workers)
    selected=c.get(path+'?site_id='+sid+'&from_date=2026-03-01&to_date=2026-03-01',headers=m).json()
    assert selected['totals']['worked_days']==2 and selected['totals']['worked_calendar_days']==1
    assert set(selected['totals']['source_day_ids'])=={first,third}
    assert {d['id'] for d in selected['days']}=={first,third}
    assert selected['totals']['total_kopecks']==2*500000+1000-200
    with c.api.state.db() as db:
        db.execute(delete(Assignment).where(Assignment.user_id==c.api.state.owner_user_id,Assignment.site_id==other));db.commit()
    visible=c.get(path,headers=m).json()
    assert set(visible['totals']['source_day_ids'])=={first,second,third}
    assert fourth not in visible['totals']['source_day_ids']
    assert c.get(path+'?site_id='+other,headers=m).status_code==403
    assert c.get(path+'?from_date=2026-03-03&to_date=2026-03-01',headers=m).status_code==422
