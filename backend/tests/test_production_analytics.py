"""Shift calendar, work-kind day counts, machine hours and crew days — synthetic fixtures only.

AGENTS.md: no real documents or data in the repository, so every value below is invented.
"""
import uuid
from decimal import Decimal

from app.main import Report, ReportSource
from app.production_analytics import (areas_of, classify_line, crew_people, parse_equipment,
                                      production_metrics, weather_of)
from test_api import env, report


def submit(c, headers, sid, *, date, entries=(), kind='work', reason=None, crew=None, site=None, comment=None):
    """Create and submit a report, then return the ORM row loaded with its source record."""
    data = report(sid, kind)
    data['work_date'] = date
    data['required_photo_ids'] = []
    if kind == 'no_work':
        data['no_work_reason'] = reason or 'No access'
        data['work_entries'] = []
    else:
        data['work_entries'] = [{'type': text, 'description': text} for text in entries]
    if crew:
        data['crew'] = crew
    if comment:
        data['comment'] = comment
    rid = c.post('/api/v1/reports', headers=headers, json=data).json()['id']
    c.post(f'/api/v1/reports/{rid}/submit', headers=headers, json={'expected_revision': 1})
    return rid


def loaded(c, ids, sources=None):
    """Rows exactly as the API loads them, with private source text attached where supplied."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    with c.api.state.db() as db:
        db.expire_on_commit = False
        for rid in ids:
            text = (sources or {}).get(rid)
            if text is not None:
                db.merge(ReportSource(report_id=rid, payload={'source_ref': 'synthetic-message', 'text': text}))
        db.commit()
        rows = {row.id: row for row in db.scalars(
            select(Report).options(selectinload(Report.source_record)).where(Report.id.in_(ids))).unique()}
        for row in rows.values():
            row.source_record
    return [rows[rid] for rid in ids]


def test_main_and_auxiliary_work_kinds_count_days_not_lines(env):
    c, f, m, sid, _ = env
    day_one = submit(c, f, sid, date='2026-03-02',
                     entries=['монтаж блоков', 'приёмка блоков', 'насыпь щебня под блоки'])
    day_two = submit(c, f, sid, date='2026-03-03', entries=['монтаж блоков 12-13 ряды'])
    day_three = submit(c, f, sid, date='2026-03-04', entries=['заливка бетона в опалубку', 'изготовление опалубки'])
    rows = loaded(c, [day_one, day_two, day_three])
    kinds = {item['label']: item for item in production_metrics(rows)['work_kinds']}

    blocks = kinds['Монтаж блоков']
    assert blocks['day_count'] == 2, 'two separate shifts, three stated lines'
    assert blocks['report_count'] == 2
    assert {'label': 'Приёмка блоков', 'day_count': 1, 'report_count': 1} in blocks['aux']
    assert {'label': 'Основание и подсыпка', 'day_count': 1, 'report_count': 1} in blocks['aux']
    assert kinds['Заливка бетона']['day_count'] == 1
    assert kinds['Заливка бетона']['aux'][0]['label'] == 'Опалубка'
    assert kinds['Монтаж сетки']['day_count'] == 0 and kinds['Монтаж сетки']['aux'] == []


def test_transformer_split_uses_text_and_stays_honest_when_absent(env):
    c, f, m, sid, _ = env
    t2 = submit(c, f, sid, date='2026-03-02', entries=['монтаж металлоконструкций на т-2'])
    t1 = submit(c, f, sid, date='2026-03-03', entries=['вязка арматуры', 'уборка территории тр1'])
    silent = submit(c, f, sid, date='2026-03-04', entries=['монтаж металлоконструкций'])
    rows = loaded(c, [t2, t1, silent])
    metal = next(item for item in production_metrics(rows)['work_kinds'] if item['key'] == 'metal')
    areas = {item['area']: item['day_count'] for item in metal['areas']}
    assert areas == {'Т2': 1, 'не указано': 1}
    assert areas_of('демонтаж опалубки на тр 1-2') == {'Т1', 'Т2'}
    assert areas_of('дали отключения на второй трансформатор') == {'Т2'}
    assert areas_of('монтаж блоков') == set()


def test_calendar_marks_worked_rest_and_missing_days_then_detail_drills_into_reports(env):
    c, f, m, sid, _ = env
    worked = submit(c, f, sid, date='2026-03-02', entries=['монтаж сетки'], crew='Ivanov Petr; Petrov Side')
    rested = submit(c, f, sid, date='2026-03-04', kind='no_work', reason='Permit refused')
    rows = loaded(c, [worked, rested])
    calendar = {item['date']: item for item in production_metrics(rows, '2026-03-01', '2026-03-08')['calendar']}
    assert len(calendar) == 8, 'every day of the period is present, reported or not'
    assert calendar['2026-03-02']['state'] == 'work' and calendar['2026-03-02']['kinds'] == ['mesh']
    assert calendar['2026-03-02']['report_ids'] == [worked] and calendar['2026-03-02']['people'] == ['Ivanov Petr', 'Petrov Side']
    assert calendar['2026-03-04']['state'] == 'rest' and calendar['2026-03-04']['reason'] == 'Permit refused'
    assert calendar['2026-03-03']['state'] == 'no_report' and calendar['2026-03-03']['report_ids'] == []
    assert calendar['2026-03-07']['is_weekend'] is True and calendar['2026-03-02']['is_weekend'] is False


def test_machine_hours_come_from_primary_text_and_average_per_day_is_stated(env):
    c, f, m, sid, _ = env
    first = submit(c, f, sid, date='2026-03-02', entries=['монтаж блоков'],
                   crew='Ivanov Petr')
    second = submit(c, f, sid, date='2026-03-03', entries=['монтаж блоков'], crew='Ivanov Petr')
    rows = loaded(c, [first, second], sources={
        first: 'Состав бригады:\n- Ivanov Petr\nВыполненные работы:\n- монтаж блоков\n\nРабота спецтехники:\n- Кран 9 часов\n- Вышка 8 часов(наемная)',
        second: 'Работа спецтехники: 5 часов\n- Урал манипулятор 2 часа'})
    metrics = production_metrics(rows, '2026-03-02', '2026-03-04')
    equipment = metrics['equipment']
    by_type = {item['type']: item for item in equipment['hours_by_type']}
    assert by_type['Кран']['hours'] == '9' and by_type['Кран']['day_count'] == 1
    assert by_type['Вышка']['hired_days'] == 1
    assert by_type['Манипулятор']['hours'] == '2'
    assert equipment['total_hours'] == '24'
    assert equipment['unassigned_hours'] == '5', 'declared section hours are kept apart from machines'
    assert equipment['avg_hours_per_equipment_day'] == '12.00'
    assert equipment['avg_hours_per_workday'] == '12.00'
    assert [row['hours'] for row in metrics['calendar'][:3]] == ['17', '7', '0']


def test_crew_days_are_counted_per_person_and_spelling_variants_are_flagged(env):
    c, f, m, sid, _ = env
    one = submit(c, f, sid, date='2026-03-02', entries=['сварка'], crew='Ivanov Petr; Petrov Side; Worker №1 8 часов')
    two = submit(c, f, sid, date='2026-03-03', entries=['сварка'], crew='Petr Ivanov; Worker № 1')
    three = submit(c, f, sid, date='2026-03-04', entries=['сварка'], crew='Petr Ivano; Подрядная бригада')
    rows = loaded(c, [one, two, three])
    people = {row['name']: row for row in production_metrics(rows)['people']}
    assert people['Petr Ivanov']['day_count'] == 2, 'the same two names in any order are one person'
    assert people['Petr Ivano']['day_count'] == 1, 'a typo is not merged silently'
    assert people['Petrov Side']['day_count'] == 1
    assert people['Worker №1']['day_count'] == 2 and people['Worker №1']['hours'] == '8'
    assert people['Подрядная бригада']['is_group'] is True, 'a whole crew is not one person'
    pairs = {tuple(sorted(item['names'])) for item in production_metrics(rows)['people_requires_check']}
    assert ('Petr Ivano', 'Petr Ivanov') in pairs
    assert ('Petr Ivano', 'Подрядная бригада') not in pairs
    assert ('Ivanov Petr', 'Petr Ivano') not in pairs, 'numbered and unrelated variants are not paired'
    assert crew_people({'crew': 'Ivanov Petr; -'}, '') == [{'person': 'ivanov petr', 'name': 'Ivanov Petr', 'hours': None}]


def test_weather_is_taken_only_from_explicit_statements(env):
    c, f, m, sid, _ = env
    rainy = submit(c, f, sid, date='2026-03-02', entries=['дождь', 'монтаж сетки'])
    clear = submit(c, f, sid, date='2026-03-03', entries=['монтаж сетки'])
    rows = loaded(c, [rainy, clear])
    result = production_metrics(rows)
    assert [item['condition'] for item in result['weather']] == ['rain']
    assert result['weather'][0]['days'] == ['2026-03-02']
    assert weather_of('проливка бетона водой') is None, 'watering concrete is not rain'
    assert classify_line('дождь') is None, 'weather is never a work kind'


def test_production_endpoint_obeys_report_acl_and_period_filter(env):
    c, f, m, sid, other = env
    mine = submit(c, f, sid, date='2026-03-02', entries=['монтаж блоков'])
    with c.api.state.db() as db:
        from app.main import User, hash_password
        peer = User(login='peer', password_hash=hash_password('StrongPassword123'), role='foreman')
        db.add(peer)
        db.flush()
        from app.main import Assignment
        db.add(Assignment(user_id=peer.id, site_id=sid))
        db.commit()
    peer_token = {'Authorization': 'Bearer ' + c.post('/api/v1/auth/login',
                                                      json={'login': 'peer', 'password': 'StrongPassword123'}
                                                      ).json()['access_token']}
    data = c.get('/api/v1/analytics/production', headers=m).json()
    assert data['workday_count'] == 1 and data['calendar'], 'manager sees the submitted report'
    assert c.get('/api/v1/analytics/production', headers=peer_token).json()['workday_count'] == 0
    assert c.get('/api/v1/analytics/production', headers=m).status_code == 200
    assert c.get('/api/v1/analytics/production?site_id=' + str(uuid.uuid4()), headers=m).status_code == 404
    period = c.get('/api/v1/analytics/production?from_date=2026-03-03&to_date=2026-03-05', headers=m).json()
    assert [item['state'] for item in period['calendar']] == ['no_report', 'no_report', 'no_report'], \
        'a day without a report is missing data, not a worked day'
    assert period['workday_count'] == 0
    assert c.get('/api/v1/analytics/production?from_date=2026-03-05&to_date=2026-03-01', headers=m).status_code == 422
    assert mine and other


def test_uncertain_formulation_is_reported_instead_of_silently_dropped(env):
    c, f, m, sid, _ = env
    odd = submit(c, f, sid, date='2026-03-02', entries=['перекладка флюгера'])
    rows = loaded(c, [odd])
    result = production_metrics(rows)
    assert result['uncategorized'] and result['uncategorized'][0]['samples'] == ['перекладка флюгера']
    assert result['uncategorized'][0]['day_count'] == 1
    assert all(item['day_count'] == 0 for item in result['work_kinds'])
    # A shift without any readable work is still a worked day in the calendar.
    assert result['calendar'][0]['state'] == 'work' and result['calendar'][0]['kinds'] == []


def test_welding_is_its_own_indicator_and_stays_with_mesh_or_belt_when_named(env):
    c, f, m, sid, _ = env
    welded = submit(c, f, sid, date='2026-03-02', entries=['сварка металлоконструкций'])
    mesh = submit(c, f, sid, date='2026-03-03', entries=['сварка сетки антидроновой'])
    belt = submit(c, f, sid, date='2026-03-04', entries=['сварка армопояса'])
    kinds = {item['key']: item for item in production_metrics(loaded(c, [welded, mesh, belt]))['work_kinds']}
    assert kinds['welding']['label'] == 'Сварка металлоконструкций' and kinds['welding']['day_count'] == 1
    assert kinds['mesh']['day_count'] == 1, 'mesh welding is counted with the mesh indicator'
    assert kinds['belt']['day_count'] == 1, 'belt welding is counted with the belt indicator'
    assert classify_line('сварка рам') == ('welding', 'main', 'Сварка')


def test_worker_by_number_is_marked_as_temporary(env):
    c, f, m, sid, _ = env
    rid = submit(c, f, sid, date='2026-03-02', entries=['монтаж блоков'], crew='Работник №1; Ivanov Petr')
    people = {item['name']: item for item in production_metrics(loaded(c, [rid]))['people']}
    assert people['Работник №1']['is_temporary'] is True
    assert people['Ivanov Petr']['is_temporary'] is False


def test_hired_machine_is_counted_as_naemney_from_its_own_line(env):
    c, f, m, sid, _ = env
    rid = submit(c, f, sid, date='2026-03-02', entries=['монтаж блоков'])
    rows = loaded(c, [rid], sources={
        rid: 'Работа спецтехники:\n- Вышка 8 часов (наемная)\n- Кран 4 часа'})
    by_type = {item['type']: item for item in production_metrics(rows)['equipment']['hours_by_type']}
    assert by_type['Вышка']['hired_days'] == 1 and by_type['Вышка']['own_days'] == 0
    assert by_type['Кран']['ownership_not_stated_days'] == 1


def test_mixed_work_and_no_work_preserve_workday_and_exclude_idle_people():
    from types import SimpleNamespace
    def row(rid, site, kind, crew, entries):
        return SimpleNamespace(id=rid, site_id=site, work_date='2026-03-10', source_record=None,
                               payload={'kind': kind, 'crew': crew, 'work_entries': entries})
    result = production_metrics([
        row('work', 'site-a', 'work', 'Worker A', [{'type': 'уборка территории'}, {'type': 'дождь'}]),
        row('idle', 'site-b', 'no_work', 'Worker B', []),
    ])
    assert result['workday_count'] == 1
    assert result['rest_day_count'] == 0
    assert result['calendar'][0]['state'] == 'work'
    assert result['calendar'][0]['weather'] == ['Дождь']
    assert result['calendar'][0]['other'] == ['Организация и подготовка работ']
    assert [p['name'] for p in result['people']] == ['Worker A']
    assert {s['site_id']: (s['work_days'], s['rest_days']) for s in result['sites']} == {
        'site-a': (1, 0), 'site-b': (0, 1)}


def test_weather_negation_and_temporary_worker_are_not_overclassified():
    assert weather_of('без дождя') is None
    assert weather_of('дождя не было') is None
    from app.production_analytics import TEMPORARY_MARKER
    assert not TEMPORARY_MARKER.search('Работник Иван')
    assert TEMPORARY_MARKER.search('Работник #1')


def test_same_site_work_and_no_work_do_not_count_one_date_twice(env):
    c,f,m,sid,_ = env
    worked=submit(c,f,sid,date='2026-03-10',entries=['монтаж блоков'])
    idle=submit(c,f,sid,date='2026-03-10',kind='no_work',reason='No access earlier')
    result=production_metrics(loaded(c,[worked,idle]))
    assert result['workday_count']==1 and result['rest_day_count']==0
    assert result['sites'][0]['work_days']==1 and result['sites'][0]['rest_days']==0
    assert result['calendar'][0]['state']=='work'


def test_declared_shift_conditions_roundtrip_capabilities_and_revision_guard(env):
    c, f, m, sid, _ = env
    data = report(sid)
    data.update(work_area='Т1/Т2', weather='Ясно', crew='Synthetic Worker')
    data['required_photo_ids'] = []
    data['work_entries'] = [{'type': 'монтаж блоков', 'description': 'монтаж блоков на Т1; дождь'}]
    rid = c.post('/api/v1/reports', headers=f, json=data).json()['id']
    assert c.get('/api/v1/reports/by-client/'+data['client_report_id'], headers={**f, 'X-Report-Capabilities': 'report-extras-v2'}).status_code == 409
    v3 = {**f, 'X-Report-Capabilities': 'report-extras-v3'}
    remote = c.get('/api/v1/reports/by-client/'+data['client_report_id'], headers=v3)
    assert remote.status_code == 200 and remote.json()['data']['weather'] == 'Ясно'
    old = {k: v for k, v in data.items() if k not in ('work_area', 'weather')}
    assert c.patch('/api/v1/reports/'+rid, headers=f, json={'expected_revision': 1, 'data': old, 'reason': 'legacy'}).status_code == 409
    assert c.post('/api/v1/reports/'+rid+'/submit', headers=v3, json={'expected_revision': 1}).status_code == 200
    result = c.get('/api/v1/analytics/production', headers=m).json()
    assert result['calendar'][0]['weather'] == ['Ясно']
    assert result['calendar'][0]['areas'] == ['Т1', 'Т2']
    blocks = next(k for k in result['work_kinds'] if k['key'] == 'blocks')
    assert {a['area'] for a in blocks['areas']} == {'Т1', 'Т2'}
    assert c.post('/api/v1/reports', headers=f, json={**data, 'weather': 'invented'}).status_code == 422
