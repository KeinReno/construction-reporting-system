import json
import pytest
from app.import_reports import read_bundle,import_bundle
from test_api import env,report

def bundle_file(tmp_path,items):
    path=tmp_path/'bundle.json';path.write_text(json.dumps({'format_version':1,'reports':items}));return path

def test_manual_history_import_is_idempotent_and_preserves_work_date(env,tmp_path):
    c,f,m,sid,_=env;data=report(sid);data['work_date']='2026-05-15'
    bundle,root=read_bundle(bundle_file(tmp_path,[{'source_ref':'synthetic-message-1','data':data}]))
    token=f['Authorization'][7:]
    def request(method,path,**kw):return c.request(method,'/api/v1/'+path,**kw)
    first=import_bundle(bundle,root,request,token)
    again=import_bundle(bundle,root,request,token)
    assert first==again and first[0]['receipt_id']
    rows=c.get('/api/v1/reports',headers=f).json()
    assert len(rows)==1 and rows[0]['data']['work_date']=='2026-05-15'
    data['comment']='Changed historic content'
    changed,_=read_bundle(bundle_file(tmp_path,[{'source_ref':'synthetic-message-1','data':data}]))
    with pytest.raises(ValueError,match='never overwrite'):import_bundle(changed,root,request,token)
    assert c.get('/api/v1/reports',headers=f).json()==rows

def test_history_source_is_private_immutable_and_survives_revision(env,tmp_path):
    c,f,m,sid,_=env;data=report(sid);data['work_date']='2026-05-15'
    source={'source_ref':'synthetic-message','text':'  Синтетический текст\r\nМатериалы и инциденты  ',
            'reported_author':'Synthetic author','message_date':'2026-05-16'}
    item={'source_ref':source['source_ref'],'source':source,'data':data}
    bundle,root=read_bundle(bundle_file(tmp_path,[item]))
    request=lambda method,path,**kw:c.request(method,'/api/v1/'+path,**kw)
    first=import_bundle(bundle,root,request,f['Authorization'][7:]);rid=first[0]['server_id']
    assert import_bundle(bundle,root,request,f['Authorization'][7:])==first
    path=f'/api/v1/reports/{rid}/source'
    assert c.get(path).status_code==401
    result=c.get(path,headers=m);assert result.json()==source
    assert result.headers['cache-control']=='private, no-store'
    assert c.put(path,headers=m,json=source).status_code==403
    assert c.put(path,headers=f,json={**source,'text':'changed'}).status_code==409
    conflicting,_=read_bundle(bundle_file(tmp_path,[{'source_ref':'another-message','data':data}]))
    with pytest.raises(ValueError,match='Source reference differs'):import_bundle(conflicting,root,request,f['Authorization'][7:])
    assert c.post(f'/api/v1/reports/{rid}/review',headers=m,json={'expected_revision':1,'decision':'needs_revision','reason':'Clarify'}).status_code==200
    data['comment']='Corrected structured text'
    assert c.patch(f'/api/v1/reports/{rid}',headers=f,json={'expected_revision':1,'data':data,'reason':'Correction'}).status_code==200
    assert c.get(path,headers=f).json()==source

def test_source_follows_report_access_rules(env):
    from app.main import User,Assignment,hash_password
    c,f,m,sid,_=env
    with c.api.state.db() as db:
        peer=User(login='peer',password_hash=hash_password('StrongPassword123'),role='foreman')
        outsider=User(login='outsider',password_hash=hash_password('StrongPassword123'),role='manager')
        db.add_all([peer,outsider]);db.flush();db.add(Assignment(user_id=peer.id,site_id=sid));db.commit()
    def login(name):return {'Authorization':'Bearer '+c.post('/api/v1/auth/login',json={'login':name,'password':'StrongPassword123'}).json()['access_token']}
    peer=login('peer');outsider=login('outsider')
    rid=c.post('/api/v1/reports',headers=f,json=report(sid)).json()['id'];path=f'/api/v1/reports/{rid}/source'
    source={'source_ref':'one','text':'private original'}
    assert c.put(path,headers=f,json={**source,'imported_by':'forged'}).status_code==422
    assert c.put(path,headers=f,json=source).status_code==200
    assert c.get(path,headers=peer).status_code==403
    assert c.get(path,headers=outsider).status_code==403
    assert c.get(path,headers=m).status_code==200

def test_source_preflight_and_legacy_reports(env,tmp_path):
    c,f,m,sid,_=env;data=report(sid)
    item={'source_ref':'one','source':{'source_ref':'different','text':'Original'},'data':data}
    with pytest.raises(ValueError,match='must match'):read_bundle(bundle_file(tmp_path,[item]))
    r=c.post('/api/v1/reports',headers=f,json=data).json();path=f"/api/v1/reports/{r['id']}/source"
    assert c.get(path,headers=m).json() is None
    assert c.post(f"/api/v1/reports/{r['id']}/submit",headers=f,json={'expected_revision':1}).status_code==200
    assert c.put(path,headers=f,json={'source_ref':'one','text':'Late original'}).status_code==409

def test_import_preflights_entire_bundle_permissions(env,tmp_path):
    c,f,m,sid,other=env
    bundle,root=read_bundle(bundle_file(tmp_path,[{'source_ref':'ok','data':report(sid)},{'source_ref':'forbidden','data':report(other)}]))
    with pytest.raises(ValueError,match='not assigned'):import_bundle(bundle,root,lambda method,path,**kw:c.request(method,'/api/v1/'+path,**kw),f['Authorization'][7:])
    assert c.get('/api/v1/reports',headers=f).json()==[]

def test_import_validates_source_photo_associations_before_network(env,tmp_path):
    from PIL import Image
    c,f,m,sid,_=env;data=report(sid,photos=['10000000-0000-4000-8000-000000000001'])
    path=bundle_file(tmp_path,[{'source_ref':'photo','data':data,'photos':[]}])
    with pytest.raises(ValueError,match='exactly match'):read_bundle(path)
    photo={'id':data['required_photo_ids'][0],'file':'../outside.png','mime':'image/png'}
    path=bundle_file(tmp_path,[{'source_ref':'photo','data':data,'photos':[photo]}])
    with pytest.raises(ValueError,match='inside'):read_bundle(path)
    Image.new('RGB',(2,2)).save(tmp_path/'photo.png');photo['file']='photo.png'
    bundle,root=read_bundle(bundle_file(tmp_path,[{'source_ref':'photo','data':data,'photos':[photo]}]))
    result=import_bundle(bundle,root,lambda method,path,**kw:c.request(method,'/api/v1/'+path,**kw),f['Authorization'][7:])
    assert result[0]['receipt_id']

def test_dry_run_never_initializes_server_or_database(env,tmp_path):
    import os,subprocess,sys
    from pathlib import Path
    c,f,m,sid,_=env
    path=bundle_file(tmp_path,[{'source_ref':'synthetic','data':report(sid)}])
    settings=os.environ.copy();settings.update({'DATABASE_URL':'invalid-driver://never-connect','AUTO_CREATE_SCHEMA':'1','PYTHONPATH':str(Path(__file__).resolve().parents[1])})
    result=subprocess.run([sys.executable,'-m','app.import_reports',str(path)],env=settings,capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert 'VALIDATED: 1' in result.stdout

def test_import_cannot_claim_another_authors_receipt(env,tmp_path):
    c,f,m,sid,_=env;data=report(sid)
    bundle,root=read_bundle(bundle_file(tmp_path,[{'source_ref':'synthetic','data':data}]))
    request=lambda method,path,**kw:c.request(method,'/api/v1/'+path,**kw)
    first=import_bundle(bundle,root,request,f['Authorization'][7:])
    with pytest.raises(ValueError,match='another author'):import_bundle(bundle,root,request,m['Authorization'][7:])
    assert import_bundle(bundle,root,request,f['Authorization'][7:])==first

def test_receipt_output_cannot_destroy_sources_or_unrelated_files(tmp_path):
    from PIL import Image
    from app.import_reports import validate_output,atomic_result
    data=report('20000000-0000-4000-8000-000000000002',photos=['10000000-0000-4000-8000-000000000001'])
    Image.new('RGB',(2,2)).save(tmp_path/'photo.png')
    path=bundle_file(tmp_path,[{'source_ref':'source','data':data,'photos':[{'id':data['required_photo_ids'][0],'file':'photo.png','mime':'image/png'}]}])
    bundle,root=read_bundle(path)
    for output in [path,tmp_path/'photo.png']:
        before=output.read_bytes()
        with pytest.raises(ValueError,match='must not replace'):validate_output(output,path,bundle,root)
        assert output.read_bytes()==before
    unrelated=tmp_path/'important.json';unrelated.write_text('{"private":"keep"}')
    with pytest.raises(ValueError,match='already exists'):validate_output(unrelated,path,bundle,root)
    assert unrelated.read_text()=='{"private":"keep"}'
    out=tmp_path/'receipts.json';validate_output(out,path,bundle,root)
    row={'client_report_id':str(bundle.reports[0].data.client_report_id),'source_ref':'source','receipt_id':'synthetic'}
    atomic_result(out,[row]);validate_output(out,path,bundle,root)
    atomic_result(out,[]);assert json.loads(out.read_text())['results']==[row]
