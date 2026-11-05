import json,uuid
import pytest
from copy import deepcopy
from pathlib import Path
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from app.main import Report,ReportSource,ImportedCorpus,create_app
from app.normalize_import import normalize,analysis_payload,apply,NAMESPACE,fingerprint
from app.backup import backup,restore
from test_api import env,report


def test_normalization_never_invents_volumes_ownership_or_expenses():
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','kind':'work','work_entries':[
        {'type':s,'description':s,'quantity':None,'unit':None} for s in
        ['допуск на площадке 8:30','монтаж блоков 14 ряда','монтаж проводов 110кв','разгрузка блоков +-50шт','монтаж блоков 3шт','дождь']]}
    text='\n'.join(w['type'] for w in payload['work_entries'])+'\nРабота спецтехники:\nКран 2.5 часа\nВышка 3 часа (наемная)\nВыполненные работы:\nСварка 3 часа\nРасходы:\nНа дорогу 1234,56р\nВыдача аванса 5000р\nИтого 9000р\nЦена 239р за лист\n-500руб\nВозврат 500руб\nПланы на завтра:\nКупить инструмент 1000р'
    original=deepcopy(payload);result=normalize(payload,text);fields=result['fields']
    assert payload==original
    assert [w['quantity'] for w in fields['work_entries']]==[None,None,None,'3']
    assert len(fields['incidents'])==1
    assert [e['hired'] for e in fields['equipment']]==[None,True]
    totals={kind:sum(e['amount_kopecks'] for e in fields['financial_entries'] if e['kind']==kind) for kind in ('expense','advance_issued')}
    assert totals=={'expense':123456,'advance_issued':500000}
    assert all(e['date_basis']=='report_date' for e in fields['financial_entries'])
    assert result['pending']
    for item in result['facts']:assert text[item['start']:item['end']]==item['text']
    source={'text':text,'_normalization':result}
    assert analysis_payload(payload,source)['equipment'][0]['hired'] is None
    assert analysis_payload({**payload,'comment':'new revision'},source).get('equipment') is None
    assert analysis_payload(payload,{**source,'text':text+' changed'}).get('equipment') is None


def test_existing_quantities_negations_and_multiple_amounts_are_preserved():
    entries=[{'type':'Кабель','description':'Монтаж кабеля','quantity':'2.5','unit':'м'},
        *[{'type':s,'description':s,'quantity':None,'unit':None} for s in ('Не установлено 10шт','Монтаж 10шт из 20шт','Уборка после дождя')]]
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':entries}
    fields=normalize(payload,'\n'.join(x['description'] for x in entries))['fields']
    assert fields['work_entries'][0]['quantity']=='2.5'
    assert fields['work_entries'][0]['unit']=='м'
    assert fields['work_entries'][1]['quantity'] is None
    assert fields['work_entries'][2]['type']=='Уборка и подготовка площадки'
    assert not fields['incidents']


def test_partial_compound_expense_and_quantity_keep_exact_source_spans():
    text='монтаж блоков(частичный,3шт и остановка)\nРасходы:\nжилье 70000р 5000р командировочные 2000 бельё'
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25',
        'work_entries':[{'type':text.splitlines()[0],'description':text.splitlines()[0]}]}
    result=normalize(payload,text)
    assert result['fields']['work_entries'][0]['quantity']=='3'
    totals={kind:sum(e['amount_kopecks'] for e in result['fields']['financial_entries'] if e['kind']==kind) for kind in ('expense','advance_issued')}
    assert totals=={'expense':7000000,'advance_issued':500000}
    assert len(result['pending'])==1
    for item in result['facts']:assert text[item['start']:item['end']]==item['text']


def test_preparation_and_reflexive_verbs_are_not_the_activity_themselves():
    lines=['разобрались с водой,качать с пруда','полная подготовка под заливку','разобрали опалубку']
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25',
        'work_entries':[{'type':s,'description':s} for s in lines]}
    types=[w['type'] for w in normalize(payload,'\n'.join(lines))['fields']['work_entries']]
    assert types==['Организация и подготовка работ','Организация и подготовка работ','Демонтаж']


def test_equipment_hours_declared_on_the_section_title_are_queued_not_dropped():
    text='Работа спецтехники: 9 часов\nПланы на завтра:\nМонтаж блоков'
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[]}
    result=normalize(payload,text)
    assert result['fields']['equipment']==[]
    queued=[x for x in result['pending'] if x['kind']=='equipment']
    assert len(queued)==1 and queued[0]['value']=={'hours':'9','type':None}
    assert 'вида техники' in queued[0]['reason']
    for item in result['facts']:assert text[item['start']:item['end']]==item['text']
    ambiguous=normalize({**payload,'client_report_id':str(uuid.uuid4())},'Работа спецтехники: 2 часа(?)')
    assert 'спорное' in ambiguous['pending'][0]['reason']


def test_advance_handouts_are_separated_from_expenses_and_period_dates_are_ignored():
    lines=['выдача командировочных по 14.07 11800р','Выдача аванса 5000р','Нужно выдать аванс 1000р']
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[]}
    result=normalize(payload,'Расходы:\n'+'\n'.join(lines))
    assert [(e['kind'],e['amount_kopecks']) for e in result['fields']['financial_entries']]==[
        ('advance_issued',1180000),('advance_issued',500000)]
    assert [x['text'] for x in result['pending'] if x['kind']=='finance']==['Нужно выдать аванс 1000р']


@pytest.mark.parametrize('line',['Праймер 239руб за лист','Кран 500руб/час','Планируем потратить 500руб','Рабочим по 500руб','Нужно 500руб','Около 500руб','Жилье 70000р 5000р командировочные нужно оплатить','Жилье 500руб за 1 сутки, аванс 1000руб','Будет жилье 500руб, аванс 1000руб'])
def test_prices_estimates_and_plans_are_never_actual_expenses(line):
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[]}
    result=normalize(payload,'Расходы:\n'+line)
    assert result['fields']['financial_entries']==[]
    assert result['pending']


def test_duplicate_money_line_is_not_counted_twice():
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[]}
    result=normalize(payload,'Расходы:\nНа дорогу 500руб\nНа дорогу 500руб')
    assert len(result['fields']['financial_entries'])==1
    assert sum(e['amount_kopecks'] for e in result['fields']['financial_entries'])==50000
    assert result['pending']


def test_duplicate_compound_fragment_is_not_counted_twice():
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[]}
    result=normalize(payload,'Расходы:\nЖилье 500руб, жилье 500руб, аванс 1000руб')
    entries=[(e['kind'],e['amount_kopecks']) for e in result['fields']['financial_entries']]
    assert entries==[('expense',50000),('advance_issued',100000)]


def test_missing_work_description_is_not_explicit_no_work():
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[],'kind':'no_work'}
    assert normalize(payload,'Расходы:\nНа дорогу 500руб')['work_state']=='not_stated'
    assert normalize(payload,'Работ нет')['work_state']=='no_work'


def test_analytics_does_not_turn_missing_work_into_a_downtime_reason(env):
    c,f,m,sid,_=env
    data=report(sid,kind='no_work')
    row=c.post('/api/v1/reports',headers=f,json=data).json();rid=row['id']
    text='Расходы:\nНа дорогу 500руб'
    assert c.put(f'/api/v1/reports/{rid}/source',headers=f,json={'source_ref':'synthetic-no-work-description','text':text}).status_code==200
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==200
    with c.api.state.db() as db:
        r=db.get(Report,rid);source=db.get(ReportSource,rid)
        source.payload={**source.payload,'_normalization':normalize(r.payload,text)};db.commit()
    summary=c.get('/api/v1/analytics/summary',headers=m).json()
    assert summary['no_work_count']==0
    assert summary['work_not_stated_count']==1
    assert summary['no_work_reasons']==[]
    assert summary['timeline'][0]['work_state']=='not_stated'


@pytest.mark.parametrize('line',['Осталось установить 3шт','Необходимо установить 3шт','Будет выполнен монтаж 3шт','Демонтаж -3шт'])
def test_future_remaining_and_negative_quantities_are_not_completed_work(line):
    payload={'client_report_id':str(uuid.uuid4()),'work_date':'2026-10-25','work_entries':[{'type':line}]}
    result=normalize(payload,line)
    assert not result['fields']['work_entries']
    assert result['pending']


def test_complete_corpus_acl_idempotence_and_backup_restore_without_export(env,tmp_path):
    c,f,m,sid,forbidden=env
    key='synthetic:1';data=report(sid);data['client_report_id']=str(uuid.uuid5(NAMESPACE,key))
    data['work_entries']=[{'type':'монтаж блоков 3шт','description':'монтаж блоков 3шт'}]
    text='монтаж блоков 3шт\nРабота спецтехники:\nКран 2 часа\nРасходы:\nНа дорогу 123р\nПланы на завтра:\nПродолжить'
    row=c.post('/api/v1/reports',headers=f,json=data).json();rid=row['id']
    assert c.put(f'/api/v1/reports/{rid}/source',headers=f,json={'source_ref':'synthetic-1','text':text}).status_code==200
    before=c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).json()
    archive=tmp_path/'input';archive.mkdir();Image.new('RGB',(3,3),'blue').save(archive/'photo.jpg')
    import hashlib
    sha=hashlib.sha256((archive/'photo.jpg').read_bytes()).hexdigest()
    message={'id':key,'text':text,'message_date':'2026-10-25','report':True,'duplicate':False,'media':['media:1'],'files':[]}
    corpus={'reports':[{'id':key,'body':text}], 'messages':[message,{**message,'id':'synthetic:duplicate','duplicate':True,'media':[]}],
        'media':[{'id':'media:1','file':'photo.jpg','sha256':sha,'kind':'photo'}],
        'documents':[{'id':'doc:1','name':'Missing invoice.pdf','message_id':key,'available':False}]}
    (archive/'data.js').write_text('window.OWNER_DEMO_DATA = '+json.dumps(corpus)+';',encoding='utf-8')
    storage=tmp_path/'photos'
    for _ in range(2):
        with c.api.state.db() as db:
            stats=apply(db,archive,storage);db.commit()
    path=f"/api/v1/imports/{stats['corpus_id']}"
    after=c.get(f'/api/v1/reports/{rid}',headers=m).json()
    for key in ('data','revision','receipt_id','status','client_report_id'):assert after[key]==before[key]
    assert after['normalization']['fields']['financial_entries'][0]['amount_kopecks']==12300
    assert c.get('/api/v1/analytics/summary',headers=m).json()['financial_totals_kopecks']=={'expense':12300}
    assert c.get('/api/v1/imports/coverage').status_code==401
    assert c.get('/api/v1/imports/coverage',headers=f).status_code==403
    assert c.get(path+'/records',headers=m).json()['total']==2
    assert c.get(path+'/records?kind=duplicate',headers=m).json()['total']==1
    assert c.get(path+'/records?q=invoice',headers=m).json()['total']==1
    assert c.get(path+'/media/media:1',headers=m).status_code==200
    with c.api.state.db() as db:
        assert len(db.scalars(select(ImportedCorpus)).all())==1
        source=db.get(ReportSource,rid);assert '_normalization_history' not in source.payload
        original_corpus=db.get(ImportedCorpus,stats['corpus_id'])
        original_corpus.payload={**original_corpus.payload,'site_ids':[sid,forbidden]};db.commit()
    assert c.get('/api/v1/imports/coverage',headers=m).json()==[]
    assert c.get(path+'/records',headers=m).status_code==404
    with c.api.state.db() as db:
        original_corpus=db.get(ImportedCorpus,stats['corpus_id']);original_corpus.payload={**original_corpus.payload,'site_ids':[sid]};db.commit()
    backup(f'sqlite:///{tmp_path}/t.db',storage,tmp_path/'backup',service_stopped=True)
    # No original input is used by the restored service.
    archive.rename(tmp_path/'original-input-unavailable')
    assert not archive.exists()
    restore(tmp_path/'backup',f'sqlite:///{tmp_path}/restored.db',tmp_path/'restored-photos',service_stopped=True)
    restored=create_app(database_url=f'sqlite:///{tmp_path}/restored.db',storage=str(tmp_path/'restored-photos'))
    with TestClient(restored) as client:
        assert client.get('/ready').status_code==200
        assert client.get(path+'/media/media:1',headers=m).status_code==200
        assert client.get(path+'/records',headers=m).json()['total']==2
        assert client.get('/api/v1/analytics/summary',headers=m).json()['financial_totals_kopecks']=={'expense':12300}
