import json
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from scripts.demo.owner_max_real_app import prepare_bundle, build_archive_context, create_owner_app, NAMESPACE
import uuid
from fastapi.testclient import TestClient


def test_private_bundle_preserves_source_without_invented_amounts(tmp_path):
    rows=[
        {"id":"ps-fakel:1","chat":"ps-fakel","work_date":"2026-07-07","message_date":"2026-07-12",
         "body":"7.07.2026\nСостав бригады:\nИван\n- разгрузка блоков\nРасходы: 1000р",
         "work":["разгрузка блоков"],"crew":["Иван"],"notes":[],"plans":[],"other_site_mentioned":False},
        {"id":"ps-fakel:2","chat":"ps-fakel","work_date":"2026-07-08","message_date":"2026-07-12",
         "body":"8.07.2026\nСостав бригады:\nИван\nДождь", "work":[],"crew":["Иван"],
         "notes":["Дождь"],"plans":[],"other_site_mentioned":True}
    ]
    (tmp_path/'data.js').write_text('window.OWNER_DEMO_DATA = '+json.dumps({'reports':rows},ensure_ascii=False)+';',encoding='utf-8')
    path=tmp_path/'bundle.json'
    ids={'fakel':'20000000-0000-4000-8000-000000000001','mixed':'20000000-0000-4000-8000-000000000002'}
    assert prepare_bundle(tmp_path,path,ids)==2
    data=json.loads(path.read_text(encoding='utf-8'))['reports']
    first,second=data
    assert first['data']['materials']==[{'name':'Блоки ФБС','direction':'mentioned'}]
    assert first['data']['work_entries']==[{'type':'разгрузка блоков','description':'разгрузка блоков'}]
    assert 'financial_entries' not in first['data'] and 'equipment' not in first['data']
    assert first['source']['text']==rows[0]['body'] and first['data']['work_date']=='2026-07-07'
    assert first['source']['message_date']=='2026-07-12'
    assert second['data']['site_id']==ids['mixed'] and second['data']['kind']=='no_work'
    assert second['data']['no_work_reason']=='Дождь'


def test_archive_photo_links_separate_direct_and_same_day(tmp_path):
    reports=[{'id':'ps-fakel:1','chat':'ps-fakel','work_date':'2026-07-07','other_site_mentioned':False}]
    messages=[{'id':'ps-fakel:1','chat':'ps-fakel'},
              {'id':'ps-fakel:2','chat':'ps-fakel'},
              {'id':'andrey:1','chat':'andrey'}]
    media=[{'id':'media:1','message_id':'ps-fakel:1','kind':'photo','file':'photos/1.jpg','message_date':'2026-07-08'},
           {'id':'media:2','message_id':'ps-fakel:2','kind':'photo','file':'photos/2.jpg','message_date':'2026-07-07'},
           {'id':'media:3','message_id':'andrey:1','kind':'photo','file':'photos/3.jpg','message_date':'2026-07-07'}]
    (tmp_path/'data.js').write_text('window.OWNER_DEMO_DATA = '+json.dumps({'reports':reports,'messages':messages,'media':media})+';',encoding='utf-8')
    context,photos=build_archive_context(tmp_path)
    rid=str(uuid.uuid5(NAMESPACE,'ps-fakel:1'))
    assert list(photos)==['media:1','media:2','media:3']
    assert [(p['id'],p['relation'],p['message_id']) for p in context[rid]['photos']]==[
        ('media:1','same_message','ps-fakel:1'),('media:2','same_work_date','ps-fakel:2')]


def test_archive_reconciliation_is_private_append_only_and_does_not_change_report(tmp_path):
    archive=tmp_path/'archive'
    archive.mkdir()
    report={'id':'ps-fakel:1','chat':'ps-fakel','work_date':'2026-07-07','message_date':'2026-07-08',
            'body':'7.07.2026\nРаботы требуют сверки объекта','work':['монтаж блока'],
            'crew':[],'notes':[],'plans':[],'other_site_mentioned':True}
    (archive/'data.js').write_text('window.OWNER_DEMO_DATA = '+json.dumps({
        'reports':[report], 'messages':[{'id':'ps-fakel:1','chat':'ps-fakel'}], 'media':[]},ensure_ascii=False)+';',encoding='utf-8')
    web=tmp_path/'web-build'
    web.mkdir()
    (web/'index.html').write_text('<html lang="ru"></html>',encoding='utf-8')
    app,credentials,count=create_owner_app(tmp_path/'private',archive,web)
    assert count==1
    client_id=str(uuid.uuid5(NAMESPACE,report['id']))
    with TestClient(app) as client:
        assert client.get('/api/v1/owner-demo/reconciliation').status_code==401
        owner=client.post('/api/v1/auth/login',json={'login':credentials['manager_login'],
            'password':credentials['manager_password']}).json()['access_token']
        importer=client.post('/api/v1/auth/login',json={'login':credentials['importer_login'],
            'password':credentials['importer_password']}).json()['access_token']
        headers={'Authorization':'Bearer '+owner}
        assert client.get('/api/v1/owner-demo/reconciliation',headers={'Authorization':'Bearer '+importer}).status_code==403
        empty=client.get('/api/v1/owner-demo/reconciliation',headers=headers)
        assert empty.status_code==200 and empty.json()=={client_id:[]}
        assert empty.headers['cache-control']=='private, no-store'
        report_before=client.get('/api/v1/reports',headers=headers).json()[0]
        payload={'decision':'fakel','reason':'Указано в первичном сообщении и проверено владельцем',
                 'expected_revision':0}
        created=client.post('/api/v1/owner-demo/reconciliation/'+client_id,json=payload,headers=headers)
        assert created.status_code==200 and created.json()['revision']==1
        assert created.json()['source_message_id']=='ps-fakel:1'
        stale=client.post('/api/v1/owner-demo/reconciliation/'+client_id,json=payload,headers=headers)
        assert stale.status_code==409
        updated=client.post('/api/v1/owner-demo/reconciliation/'+client_id,json={
            'decision':'insufficient','reason':'После сверки данных основания оказалось недостаточно',
            'expected_revision':1},headers=headers)
        assert updated.status_code==200 and updated.json()['revision']==2
        history=client.get('/api/v1/owner-demo/reconciliation',headers=headers).json()[client_id]
        assert [item['decision'] for item in history]==['fakel','insufficient']
        assert client.post('/api/v1/owner-demo/reconciliation/'+client_id,json={
            **payload,'expected_revision':2,'reason':'  '},headers=headers).status_code==422
        assert client.post('/api/v1/owner-demo/reconciliation/'+str(uuid.uuid4()),json={
            **payload,'expected_revision':0},headers=headers).status_code==404
        assert client.post('/api/v1/owner-demo/reconciliation/'+client_id,json={
            **payload,'expected_revision':2},headers={'Authorization':'Bearer '+importer}).status_code==403
        report_after=client.get('/api/v1/reports',headers=headers).json()[0]
        assert report_after['id']==report_before['id']
        assert report_after['site_id']==report_before['site_id']
        assert report_after['status']==report_before['status']
        assert report_after['revision']==report_before['revision']

    restarted, restarted_credentials, restarted_count = create_owner_app(tmp_path/'private',archive,web)
    assert restarted_count == count
    with TestClient(restarted) as client:
        token = client.post('/api/v1/auth/login',json={
            'login':restarted_credentials['manager_login'],
            'password':restarted_credentials['manager_password']}).json()['access_token']
        persisted = client.get('/api/v1/owner-demo/reconciliation',headers={
            'Authorization':'Bearer '+token}).json()[client_id]
        assert [(item['revision'],item['decision']) for item in persisted] == [
            (1,'fakel'),(2,'insufficient')]
