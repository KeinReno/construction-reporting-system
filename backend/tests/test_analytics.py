from test_api import env,report

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
