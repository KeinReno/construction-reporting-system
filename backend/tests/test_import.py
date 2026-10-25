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
