import json
from pathlib import Path
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from app.main import create_app, Report, ReportSource
from app.import_evidence import materialize_evidence
from app.backup import backup,restore
from test_api import env,report


def test_source_placeholder_completion_cannot_race_past_submit(env):
    from test_reliability import concurrent
    c,f,m,sid,_=env
    row=c.post('/api/v1/reports',headers={**f,'X-Import-Reference':'synthetic-race'},json=report(sid)).json()
    path='/api/v1/reports/'+row['id']
    source={'source_ref':'synthetic-race','text':'Original facts'}
    def write(i):
        return c.put(path+'/source',headers=f,json=source) if i==0 else c.post(path+'/submit',headers=f,json={'expected_revision':1})
    replies=concurrent(write)
    assert sorted(r.status_code for r in replies)==[200,409]
    if replies[1].status_code==200:
        assert c.get(path+'/source',headers=f).json() is None
        assert c.put(path+'/source',headers=f,json=source).status_code==409
    else:
        assert c.get(path,headers=f).json()['status']=='draft'
        assert c.get(path+'/source',headers=f).json()['text']==source['text']


def test_import_origin_without_raw_text_is_stable_and_author_labels_ignore_date_filters(env):
    c,f,m,sid,_=env
    data=report(sid)
    imported_headers={**f,'X-Import-Reference':'synthetic-import-reference'}
    row=c.post('/api/v1/reports',headers=imported_headers,json=data).json()
    assert row['origin']=='imported'
    assert c.get('/api/v1/reports/'+row['id']+'/source',headers=f).json() is None
    assert c.post('/api/v1/reports',headers=imported_headers,json=data).json()['id']==row['id']
    assert c.post('/api/v1/reports',headers={**f,'X-Import-Reference':'another-source'},json=data).status_code==409
    native=c.post('/api/v1/reports',headers=m,json=report(sid)).json()
    assert native['origin']=='direct'
    authors=c.get('/api/v1/reports/authors',headers=m).json()
    assert {a['login']:a['imported_only'] for a in authors}=={'foreman':True,'manager':False}
    assert c.get('/api/v1/reports?from_date=2026-12-01',headers=m).json()==[]
    assert c.get('/api/v1/reports/authors',headers=m).json()==authors
    assert [a['login'] for a in c.get('/api/v1/reports/authors',headers=f).json()]==['foreman']
    original={'source_ref':'synthetic-import-reference','text':'Actual primary text'}
    assert c.put('/api/v1/reports/'+row['id']+'/source',headers=f,json=original).status_code==200
    assert c.get('/api/v1/reports/'+row['id'],headers=f).json()['origin']=='imported'
    assert c.put('/api/v1/reports/'+row['id']+'/source',headers=f,json={**original,'text':'changed'}).status_code==409


def test_ordinary_foreman_cannot_hide_a_shift_by_claiming_import_origin(env):
    c,f,m,sid,_=env
    c.api.state.import_user_ids=set()
    assert c.post('/api/v1/reports',headers={**f,'X-Import-Reference':'forged-import'},json=report(sid)).status_code==403
    row=c.post('/api/v1/reports',headers=f,json=report(sid)).json()
    assert c.put('/api/v1/reports/'+row['id']+'/source',headers=f,json={'source_ref':'own-note','text':'Own note'}).status_code==200
    assert c.get('/api/v1/reports/'+row['id'],headers=m).json()['origin']=='direct'
    assert c.post('/api/v1/reports',headers={**m,'X-Import-Reference':'forged-import'},json=report(sid)).status_code==403


def test_evidence_survives_standalone_backup_without_export_and_preserves_report(env,tmp_path):
    c,f,m,sid,other=env
    original=report(sid)
    row=c.post('/api/v1/reports',headers=f,json=original).json();path='/api/v1/reports/'+row['id']
    source={'source_ref':'synthetic-source','text':'Original facts, no inferred quantities','message_date':'2026-10-24','reported_author':'Synthetic author'}
    assert c.put(path+'/source',headers=f,json=source).status_code==200
    before=c.post(path+'/submit',headers=f,json={'expected_revision':1}).json()
    media_root=tmp_path/'legacy-media';media_root.mkdir()
    Image.new('RGB',(3,3),'blue').save(media_root/'direct.jpg')
    Image.new('RGB',(3,3),'red').save(media_root/'candidate.jpg')
    context={original['client_report_id']:{'other_site_mentioned':True,'photos':[
        {'id':'old-photo-1','relation':'same_message','message_date':'2026-10-24'},
        {'id':'old-photo-2','relation':'same_work_date','message_date':'2026-10-25'}]}}
    media={'old-photo-1':{'file':'direct.jpg'},'old-photo-2':{'file':'candidate.jpg'}}
    for _ in range(2):
        with c.api.state.db() as db:
            materialize_evidence(db,tmp_path/'photos',media_root,context,media);db.commit()
    after=c.get(path,headers=f).json()
    for key in ('data','revision','status','receipt_id','submitted_at','author_id','client_report_id'):
        assert after[key]==before[key]
    assert after['origin']=='imported' and after['evidence']['requires_site_confirmation'] is True
    assert [p['relation'] for p in after['evidence']['photos']]==['same_message','same_work_date']
    assert c.get(path+'/source',headers=f).json()==source
    # Metadata is not a modification of the original source and cannot break import retries.
    with c.api.state.db() as db:
        saved=db.get(ReportSource,row['id']);saved_source={k:v for k,v in saved.payload.items() if k!='_evidence'}
        assert saved_source==source
    ids=[p['id'] for p in after['evidence']['photos']]
    blobs=[c.get('/api/v1/attachments/'+pid,headers=m).content for pid in ids]
    assert all(c.get('/api/v1/attachments/'+pid).status_code==401 for pid in ids)
    history=c.get(path+'/history',headers=f).json()
    assert [event['event'] for event in history]==['created','submitted']
    snapshot=tmp_path/'backup'
    backup(f'sqlite:///{tmp_path}/t.db',tmp_path/'photos',snapshot,service_stopped=True)
    restored_db=f'sqlite:///{tmp_path}/standalone.db';restored_photos=tmp_path/'standalone-photos'
    restore(snapshot,restored_db,restored_photos,service_stopped=True)
    # Remove the old media: normal API must use only the restored DB/storage.
    for file in media_root.iterdir():file.unlink()
    media_root.rmdir()
    standalone=create_app(database_url=restored_db,storage=restored_photos)
    try:
        with TestClient(standalone) as client:
            assert client.get(path,headers=m).json()==after
            assert client.get(path+'/source',headers=m).json()==source
            assert client.get(path+'/history',headers=m).json()==history
            for pid,blob in zip(ids,blobs):assert client.get('/api/v1/attachments/'+pid,headers=m).content==blob
            # Assignment removal immediately revokes both evidence metadata and image access.
            from app.main import Assignment,User
            from sqlalchemy import delete
            with standalone.state.db() as db:
                manager=db.scalar(select(User).where(User.login=='manager'))
                db.execute(delete(Assignment).where(Assignment.user_id==manager.id));db.commit()
            assert client.get(path,headers=m).status_code==403
            assert client.get('/api/v1/attachments/'+ids[0],headers=m).status_code==403
    finally:standalone.state.db.kw['bind'].dispose()


def test_legacy_launcher_restart_keeps_new_android_reports_and_does_not_need_original_export(tmp_path):
    import sys,uuid
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
    from scripts.demo.owner_max_real_app import create_owner_app,ARCHIVE_REVIEWS
    old=tmp_path/'old';old.mkdir();web=tmp_path/'web';web.mkdir()
    (web/'index.html').write_text('<html lang="ru"></html>',encoding='utf-8')
    payload={'reports':[{'id':'ps-fakel:1','chat':'ps-fakel','work_date':'2026-07-07','message_date':'2026-07-08','body':'Synthetic source','work':['Synthetic work'],'crew':[],'notes':[],'plans':[],'other_site_mentioned':True}],
             'messages':[{'id':'ps-fakel:1','chat':'ps-fakel'}],'media':[]}
    (old/'data.js').write_text('window.OWNER_DEMO_DATA = '+json.dumps(payload)+';',encoding='utf-8')
    root=tmp_path/'private';app,credentials,count=create_owner_app(root,old,web)
    try:
        with TestClient(app) as client:
            token=client.post('/api/v1/auth/login',json={'login':credentials['importer_login'],'password':credentials['importer_password']}).json()['access_token']
            headers={'Authorization':'Bearer '+token}
            sid=client.get('/api/v1/sites',headers=headers).json()[0]['id']
            new=report(sid);new['client_report_id']=str(uuid.uuid4())
            row=client.post('/api/v1/reports',headers=headers,json=new).json()
            assert client.post('/api/v1/reports/'+row['id']+'/submit',headers=headers,json={'expected_revision':1}).status_code==200
            assert row['origin']=='direct'
        with app.state.db() as db:
            from app.main import User
            from datetime import datetime,timezone
            old_id=db.scalar(select(Report.client_report_id).where(Report.client_report_id!=new['client_report_id']))
            manager=db.scalar(select(User).where(User.login==credentials['manager_login']))
            db.execute(ARCHIVE_REVIEWS.insert().values(id=str(uuid.uuid4()),client_report_id=old_id,source_message_id='ps-fakel:1',decision='fakel',reason='Confirmed using synthetic primary evidence',actor_id=manager.id,revision=1,created_at=datetime.now(timezone.utc)))
            db.commit()
    finally:app.state.db.kw['bind'].dispose()
    (old/'data.js').unlink();old.rmdir()
    restarted,_,new_count=create_owner_app(root,old,web)
    try:
        assert count==new_count==1
        with restarted.state.db() as db:
            rows=db.scalars(select(Report)).all()
            assert len(rows)==2 and any(r.client_report_id==new['client_report_id'] for r in rows)
            evidence=db.get(ReportSource,next(r.id for r in rows if r.client_report_id==old_id)).payload['_evidence']
            assert evidence['requires_site_confirmation'] is True
            assert evidence['decisions'][0]['reason']=='Confirmed using synthetic primary evidence'
    finally:restarted.state.db.kw['bind'].dispose()
