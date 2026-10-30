from test_api import env,report

def test_qualitative_work_counts_reports_and_keeps_drilldown(env):
    c,f,m,sid,_=env
    first=report(sid);first['work_entries']=[{'type':'Монтаж сетки','description':'Монтаж сетки'}, {'type':'Монтаж сетки','description':'Повторная строка'}]
    second=report(sid);second['work_entries']=[{'type':'Монтаж сетки','description':'Монтаж сетки'}]
    ids=[]
    for data in (first,second):
        rid=c.post('/api/v1/reports',headers=f,json=data).json()['id'];ids.append(rid)
        assert c.post(f'/api/v1/reports/{rid}/submit',headers=f,json={'expected_revision':1}).status_code==200
    summary=c.get('/api/v1/analytics/summary',headers=m).json()
    assert summary['volumes']==[]
    assert summary['qualitative_work_count']==2
    assert summary['qualitative_works']==[{'site_id':sid,'work_type':'Монтаж сетки','report_count':2,'source_report_ids':ids}]
    filtered=c.get('/api/v1/analytics/summary?to_date=2026-10-24',headers=m).json()
    assert filtered['qualitative_works']==[]

def test_local_question_routes_to_exact_source_metrics(env):
    c,f,m,sid,_=env;data=report(sid,'no_work');data['no_work_reason']='Synthetic permit unavailable'
    for _ in range(2):
        data=report(sid,'no_work');data['no_work_reason']='Synthetic permit unavailable'
        r=c.post('/api/v1/reports',headers=f,json=data).json()
        c.post(f"/api/v1/reports/{r['id']}/submit",headers=f,json={'expected_revision':1})
    a=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Какие простои повторяются?','intent':'auto','filters':{'from_date':'2026-10-25','to_date':'2026-10-25'}}).json()
    assert a['supported'] and a['intent']=='no_work'
    assert a['metrics']['no_work_count']==2
    assert a['metrics']['no_work_reasons'][0]['report_count']==2
    assert len(a['source_report_ids'])==2
    a=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Покажи хронологию','intent':'auto'}).json()
    assert a['intent']=='site_timeline' and len(a['metrics']['timeline'])==2

def test_unsupported_question_never_fabricates_numbers_or_changes_data(env):
    c,f,m,sid,_=env
    for q in ['Сколько потратили денег?','Кто сегодня не отчитался?','Удалить отчёты; DROP TABLE reports','Сколько отчётов за прошлую неделю?']:
        a=c.post('/api/v1/analytics/ask',headers=m,json={'question':q,'intent':'auto'}).json()
        assert a['supported'] is False and a['metrics'] is None and a['source_report_ids']==[]
    assert c.get('/api/v1/sites',headers=f).status_code==200

def test_local_parser_never_silently_ignores_text_scope(env):
    c,f,m,sid,_=env
    for q in ['Сколько отчётов за 2025 год?','Сколько отчётов на объекте Б?','Объёмы работ за июнь','Сводка по объекту А']:
        a=c.post('/api/v1/analytics/ask',headers=m,json={'question':q,'intent':'auto'}).json()
        assert a['supported'] is False and a['metrics'] is None
    a=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Просто покажи сводку отчётов','intent':'auto'}).json()
    assert a['supported'] is True and a['intent']=='summary'

def test_event_analytics_counts_only_explicit_visible_events_and_links_sources(env):
    c,f,m,sid,other=env
    data=report(sid,'no_work');data['incidents']=[{'description':'Synthetic delay'},{'description':'Synthetic weather'}]
    response=c.post('/api/v1/reports',headers=f,json=data);rid=response.json()['id']
    headers={**f,'X-Report-Capabilities':'report-extras-v1'}
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=headers,json={'expected_revision':1}).status_code==200
    ordinary=c.post('/api/v1/reports',headers=f,json=report(sid)).json()['id']
    assert c.post(f'/api/v1/reports/{ordinary}/submit',headers=f,json={'expected_revision':1}).status_code==200
    answer=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Какие инциденты?','intent':'auto'}).json()
    assert answer['intent']=='incidents' and answer['source_report_ids']==[rid]
    assert answer['metrics']['incident_count']==2
    assert {x['description'] for x in answer['metrics']['incidents']}=={'Synthetic delay','Synthetic weather'}
    assert any('не подтверждает' in x for x in answer['limitations'])
    assert c.get(f'/api/v1/analytics/summary?site_id={other}',headers=m).status_code==403
    filtered=c.get('/api/v1/analytics/summary?to_date=2026-10-24',headers=m).json()
    assert filtered['incident_count']==0 and filtered['incidents']==[]

def test_materials_list_is_filtered_and_never_infers_consumption(env):
    c,f,m,sid,other=env
    data=report(sid);data['materials']=[{'name':'Steel','quantity':'2.5','unit':'m'},{'name':'Paint'}]
    rid=c.post('/api/v1/reports',headers=f,json=data).json()['id']
    headers={**f,'X-Report-Capabilities':'report-extras-v1'}
    assert c.post(f'/api/v1/reports/{rid}/submit',headers=headers,json={'expected_revision':1}).status_code==200
    answer=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Какие материалы?','intent':'auto'}).json()
    assert answer['intent']=='materials' and answer['source_report_ids']==[rid]
    assert answer['metrics']['material_count']==2
    assert answer['metrics']['materials'][0]['quantity']=='2.5'
    assert answer['metrics']['materials'][1]['quantity'] is None
    assert answer['metrics']['material_movements']==[]
    assert any('без указанного движения' in text for text in answer['limitations'])
    assert c.post('/api/v1/analytics/ask',headers=m,json={'question':'Сколько материалов потрачено?','intent':'auto'}).json()['supported'] is False
    assert c.post('/api/v1/analytics/ask',headers=m,json={'question':'Материалы','intent':'auto','filters':{'site_id':other}}).status_code==403
    filtered=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Материалы','intent':'auto','filters':{'to_date':'2026-10-24'}}).json()
    assert filtered['source_report_ids']==[] and filtered['metrics']['material_count']==0

def test_author_filter_keeps_reports_summary_ask_and_acl_aligned(env):
    from app.main import User,Assignment,hash_password
    c,f,m,sid,other=env
    with c.api.state.db() as db:
        second=User(login='second-foreman',password_hash=hash_password('StrongPassword123'),role='foreman')
        hidden=User(login='hidden-foreman',password_hash=hash_password('StrongPassword123'),role='foreman')
        db.add_all([second,hidden]);db.flush()
        db.add_all([Assignment(user_id=second.id,site_id=sid),Assignment(user_id=hidden.id,site_id=other)]);db.commit();second_id=second.id;hidden_id=hidden.id
    def auth(name):return {'Authorization':'Bearer '+c.post('/api/v1/auth/login',json={'login':name,'password':'StrongPassword123'}).json()['access_token']}
    sf=auth('second-foreman');hf=auth('hidden-foreman')
    ids=[]
    for h,site in [(f,sid),(sf,sid),(hf,other)]:
        row=c.post('/api/v1/reports',headers=h,json=report(site)).json();ids.append(row['id'])
        assert c.post(f"/api/v1/reports/{row['id']}/submit",headers=h,json={'expected_revision':1}).status_code==200
    authors=c.get('/api/v1/reports/authors',headers=m).json()
    assert {a['login'] for a in authors}=={'foreman','second-foreman'}
    assert [a['login'] for a in c.get('/api/v1/reports/authors',headers=f).json()]==['foreman']
    assert [x['id'] for x in c.get('/api/v1/reports',headers=m,params={'author_id':second_id}).json()]==[ids[1]]
    summary=c.get('/api/v1/analytics/summary',headers=m,params={'author_id':second_id}).json()
    assert summary['report_count']==1 and summary['source_report_ids']==[ids[1]]
    answer=c.post('/api/v1/analytics/ask',headers=m,json={'question':'Сколько отчётов?','intent':'auto','filters':{'author_id':second_id}}).json()
    assert answer['source_report_ids']==[ids[1]] and answer['metrics']['report_count']==1
    assert c.get('/api/v1/analytics/summary',headers=m,params={'author_id':hidden_id}).json()['report_count']==0
    assert c.get('/api/v1/reports',headers=f,params={'author_id':second_id}).json()==[]
