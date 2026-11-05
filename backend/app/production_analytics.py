"""Read-only production metrics: shift calendar, work-kind day counts, equipment hours, crew days, weather.

Everything is derived at request time from submitted reports and their primary text.
Nothing is written back: reports, analytical projections and evidence stay untouched.
"""
from __future__ import annotations
import re
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from app.normalize_import import analysis_payload, current_normalization

# Big indicators requested by the owner; auxiliary work is reported under its main kind.
MAIN_GROUPS = (
    ('concrete', 'Заливка бетона'),
    ('blocks', 'Монтаж блоков'),
    ('belt', 'Армопояс и плиты'),
    ('metal', 'Монтаж металлоконструкций'),
    ('welding', 'Сварка металлоконструкций'),
    ('mesh', 'Монтаж сетки'),
    ('logistics', 'Погрузка и разгрузка материалов'),
)
OTHER_GROUPS = (
    ('hydro', 'Гидроизоляция'),
    ('power', 'Электромонтажные работы'),
    ('prep', 'Организация и подготовка работ'),
    ('teardown', 'Демонтаж'),
    ('other', 'Прочие записи'),
)
GROUP_LABELS = dict(MAIN_GROUPS) | dict(OTHER_GROUPS)
MAIN_KEYS = frozenset(key for key, _ in MAIN_GROUPS)

# A permit or leave line names the shift frame, not a performed volume.
CONTEXT = re.compile(r'^(?:допуск|выезд|забрали|дали\s+отключения|сбор\s+на\s+базе)', re.I)
PLAN_OR_NEGATION = re.compile(
    r'^(?:не\s|нет\s|нужно\s|надо\s|необходим\w*\s|план\w*\b|предстоит\s|осталось\s|будет\s|будут\s|'
    r'требуется\s|сделать\s|добить\s|доделать\s|навести\s|разобраться\s|разобрать\s|и\s+возможно)'
    r'|\bне\s+(?:выполн|установ|произвед|сделан)', re.I)
REST_STATED = re.compile(r'^(?:выходной|выходные|не\s+работали)\b', re.I)

WEATHER_RULES = (
    ('rain', 'Дождь', re.compile(r'\bдожд|ливн', re.I)),
    ('snow', 'Снег', re.compile(r'\bснег\b|\bметел|\bснежн', re.I)),
    ('wind', 'Ветер', re.compile(r'\bветер|\bпорыв', re.I)),
    ('frost', 'Мороз и гололёд', re.compile(r'\bмороз|гололёд|гололед|\bминус\s*\d', re.I)),
    ('heat', 'Жара', re.compile(r'\bжар[аое]\b|\bжарко|\bзной', re.I)),
    ('dew', 'Роса', re.compile(r'\bлегла\s+рос|\bроса\b', re.I)),
)
WEATHER_LABELS = {key: label for key, label, _ in WEATHER_RULES}
TRANSFORMER = re.compile(r'трансформатор', re.I)
# "тр1", "тр-2", "т-2", "тр 2": a bare 1 or 2 after a word-initial тр/т.
AREA_TOKEN = re.compile(r'\b(?:тр|т)[-–—\s]{0,2}([12])(?![\d.,])')
AREA_PAIR = re.compile(r'\bтр[-–—\s]{0,2}[12]\s*[-–/]\s*[12]\b')
AREA_ORDINAL = (('Т1', re.compile(r'(?:перв\w*|первого|1)\s*[-\s]?трансформатор', re.I)),
                ('Т2', re.compile(r'(?:втор\w*|второго|2)\s*[-\s]?трансформатор', re.I)))
AREA_LABELS = {'Т1': 'Т1', 'Т2': 'Т2', 'Т?': 'Трансформатор без номера', 'не указано': 'Трансформатор не указан'}

EQUIPMENT_SECTION = re.compile(r'^работа\s*спец\s*техники', re.I)
EQUIPMENT_HOURS = re.compile(r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.?)(?:\s*\([^)]*\))?\s*$', re.I)
EQUIPMENT_SECTION_HOURS = re.compile(r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.?)\s*(.*)$', re.I)
EQUIPMENT_TYPES = ((re.compile(r'манипулятор', re.I), 'Манипулятор'),
                   (re.compile(r'кран', re.I), 'Кран'),
                   (re.compile(r'вышк', re.I), 'Вышка'),
                   (re.compile(r'экскаватор|эксковатор|экскав|эск[ао]в', re.I), 'Экскаватор'),
                   (re.compile(r'лент\w*\s*трансп|трансп\w*\s*лент', re.I), 'Лента транспортёрная'),
                   (re.compile(r'бетоносмесит|бетономешал|миксер', re.I), 'Бетоносмеситель'),
                   (re.compile(r'самосвал', re.I), 'Самосвал'))
EQUIPMENT_HIRED = re.compile(r'на[её]мн', re.I)
EQUIPMENT_OWN = re.compile(r'\bсво[яйе]\b', re.I)
SECTION_STOP = re.compile(r'^(?:планы|расходы|состав|выполненные|работы|материалы|события|инциденты)', re.I)

CREW_SECTION = re.compile(r'^состав\s+бригады\s*:', re.I)
CREW_SPLIT = re.compile(r'[;,\n]+')
PERSON_HOURS = re.compile(r'(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.?)\s*$', re.I)
GROUP_MARKER = re.compile(r'бригад|москвич|артель|звено|подряд', re.I)
TEMPORARY_MARKER = re.compile(r'работник|рабочий\s*[№#]?\s*\d|\d+\s*[-й]?\s*рабоч|временно', re.I)
ARMOROYAS = re.compile(r'армопояс|армо\s*пояс|армпояс', re.I)
OBJECT_HINTS = (('блок|фбс', 'blocks'), ('плит', 'belt'), ('армопояс', 'belt'), ('арматур', 'belt'),
                ('опалубк', 'concrete'), ('бетон|пазух', 'concrete'), ('сетк|антидрон', 'mesh'),
                ('металл|конструкц|швеллер|труб', 'metal'), ('провод|кабел|кв\b|изолятор', 'power'))


def _by_object(line, default):
    """A shared verb (приёмка, демонтаж) belongs to the group of its object."""
    low = line.casefold()
    for pattern, group in OBJECT_HINTS:
        if re.search(pattern, low):
            return group
    return default


# The earliest named action owns the line: "заливка бетона в опалубку" is concreting,
# "изготовление опалубки для заливки" is formwork.
RULES = (
    (re.compile(r'армопояс|армо\s*пояс|армпояс', re.I), 'belt', 'main', 'Заливка или монтаж армопояса'),
    (re.compile(r'монтаж\s+\w{0,12}плит|укладка\s+\w{0,12}плит|плиты\s+перекрытия', re.I),
     'belt', 'main', 'Монтаж плит'),
    (re.compile(r'вязк\w*\s*арматур|арматур\w*\s*вязк|обвязк\w*[^,.]{0,20}арматур|связк\w*\s+арматуры|'
                r'укладка\s+\w{0,8}арматур|завязать\s+арматур|перевязк|монтаж\s+\w{0,8}арматуры|арматур', re.I),
     'belt', 'aux', 'Армирование и вязка арматуры'),
    (re.compile(r'опалубк|щиты\s+для|фанер|державк', re.I),
     lambda line: 'belt' if re.search(r'армопояс', line, re.I) else 'concrete', 'aux', 'Опалубка'),
    (re.compile(r'пролив|пролит|пролить|накрыть|накрыли|пленк|плёнк|уход\s+за\s+бетоном|поливаем', re.I),
     'concrete', 'aux', 'Уход за бетоном'),
    (re.compile(r'трамбовк|разработк\s+траншеи|отсып|насып|подсып|песко|щебн|подушк|основани|выравниван', re.I),
     lambda line: _by_object(line, 'concrete'), 'aux', 'Основание и подсыпка'),
    (re.compile(r'отбив|размет|нивелир|диагональ|осей|выставит|выставл|шнурк', re.I),
     lambda line: _by_object(line, 'blocks'), 'aux', 'Разметка и геодезия'),
    (re.compile(r'залив|залили|пазух|бетон|миксер|бетономешал|бетоносмесит', re.I),
     'concrete', 'main', 'Заливка бетона'),
    (re.compile(r'заделк|заделать|устранени', re.I),
     lambda line: _by_object(line, 'other'), 'aux', 'Заделка и устранение недостатков'),
    (re.compile(r'монтаж\s+\w{0,14}блок|укладк\w*\s+\w{0,14}блок|кладка\s+\w{0,10}блок|пристрелка|'
                r'ряд\w*\s+блок|блок\w*\s+\d+\s*[-–]?\s*\d*\s*ряд|\bряд\w*|ярус|фбс|'
                r'жд[её]м\s+блоки', re.I),
     'blocks', 'main', 'Монтаж блоков'),
    (re.compile(r'при[её]м\w*\s+\w{0,14}блок|\bблок\w*\s+при[её]м', re.I), 'blocks', 'aux', 'Приёмка блоков'),
    (re.compile(r'кирпич', re.I), 'blocks', 'aux', 'Выкладка кирпича'),
    (re.compile(r'перемычк', re.I), 'blocks', 'aux', 'Перемычки'),
    (re.compile(r'разгруз|погруз|прив[её]з|вывоз|перемещ|доставк', re.I), 'logistics', 'main',
     'Погрузка, разгрузка и перемещение'),
    (re.compile(r'при[её]м(ка)?\s+\w{0,14}(материал|плит|пров|металл|щебн|досок)|прием\b|принял[и]?\b', re.I),
     lambda line: _by_object(line, 'logistics'), 'aux', 'Приёмка материалов'),
    (re.compile(r'сварк|сварили|обварк|сварочн', re.I),
     lambda line: 'mesh' if re.search(r'сетк|антидрон', line, re.I)
     else 'belt' if re.search(ARMOROYAS, line) else 'welding', 'main', 'Сварка'),
    (re.compile(r'металлоконструкц', re.I), 'metal', 'main', 'Монтаж металлоконструкций'),
    (re.compile(r'конструкц|каркас|швеллер|подпор|рельс|уголком|резка\s+труб|нарезка', re.I),
     'metal', 'main', 'Монтаж металлоконструкций'),
    (re.compile(r'покрас|окраск|краск', re.I), 'metal', 'aux', 'Покраска'),
    (re.compile(r'\bметалл\w*', re.I), 'metal', 'aux', 'Работа с металлом'),
    (re.compile(r'сетк|антидрон', re.I), 'mesh', 'main', 'Монтаж сетки'),
    (re.compile(r'трос', re.I), 'mesh', 'aux', 'Монтаж троса'),
    (re.compile(r'провод|кабел|изолятор|заземл|натяж|ввод|отвод|(?:35|110)\s*к\w*|\bкв\b|окн\w*\s+(?:под|для)|'
                r'столб|опор|крепления|закладн', re.I),
     'power', 'main', 'Электромонтажные работы'),
    (re.compile(r'праймер|рубероид|битум|гидроизоляц|закатали|слой|слоя|слоев|слое|раскатами', re.I), 'hydro', 'main',
     'Гидроизоляция'),
    (re.compile(r'демонтаж|разбор|разобра(?!сь|лись)|среза|срезк', re.I),
     lambda line: _by_object(line, 'teardown'), 'aux', 'Демонтаж и разборка'),
    (re.compile(r'убор|мусор|порядок|очистк|обустрой|подготов|совещан|знакомство|инструмент|вагончик|'
                r'недочёт|недочет|устранени|переключен|ёмкост|емкост|качать|\bвод[аыуе]\b', re.I),
     'prep', 'main', 'Организация и подготовка работ'),
    (re.compile(r'сломался|ремонт|жд[её]м|отключен|дорог|тула|поездка|жиль[её]|проживание', re.I),
     'other', 'main', 'Прочие записи'),
)


def classify_line(line):
    """Return (group, role, label) for one stated activity, or None when it states no work."""
    if not line or CONTEXT.search(line) or REST_STATED.search(line) or PLAN_OR_NEGATION.search(line):
        return None
    best = None
    for pattern, group, role, label in RULES:
        match = pattern.search(line)
        if not match:
            continue
        if best is None or match.start() < best[0]:
            best = (match.start(), group, role, label)
        if match.start() == 0:
            break
    if best is None:
        return None
    _, group, role, label = best
    group = group(line) if callable(group) else group
    if ARMOROYAS.search(line):
        group = 'belt'
        if label == 'Заливка бетона':
            label = 'Заливка армопояса'
    return group, role, label


def areas_of(line):
    found = set()
    if AREA_PAIR.search(line):
        found |= {'Т1', 'Т2'}
    for value in AREA_TOKEN.findall(line):
        found.add('Т' + value)
    for area, pattern in AREA_ORDINAL:
        if pattern.search(line):
            found.add(area)
    if TRANSFORMER.search(line) and not found:
        found.add('Т?')
    return found


def weather_of(line):
    for key, label, pattern in WEATHER_RULES:
        if pattern.search(line):
            return key, label
    return None


def _equipment_type(text):
    low = text.casefold()
    for pattern, label in EQUIPMENT_TYPES:
        if pattern.search(low):
            return label
    return text.strip() or 'Без указания техники'


def parse_equipment(source_text, payload):
    """Declared machine hours. The report field wins; the primary text is the historical fallback."""
    entries = payload.get('equipment') or []
    if entries:
        return [{'type': e.get('type') or 'Заявлено без вида техники',
                 'hours': Decimal(str(e.get('hours') or 0)), 'hired': e.get('hired'),
                 'basis': 'declared_field', 'text': e.get('type') or ''} for e in entries]
    found = []
    section = False
    for raw in (source_text or '').splitlines():
        line = raw.strip()
        if not line:
            continue
        if EQUIPMENT_SECTION.match(line):
            declared = EQUIPMENT_SECTION_HOURS.search(line.split(':', 1)[-1])
            if declared:
                found.append({'type': 'Заявлено без вида техники',
                              'hours': Decimal(declared[1].replace(',', '.')), 'hired': None,
                              'basis': 'section_only', 'text': line})
            section = True
            continue
        if not section:
            continue
        if SECTION_STOP.match(line):
            section = False
            continue
        match = EQUIPMENT_HOURS.match(line.lstrip('- '))
        if not match:
            continue
        found.append({'type': _equipment_type(match[1]), 'hours': Decimal(match[2].replace(',', '.')),
                      'hired': True if EQUIPMENT_HIRED.search(line) else False if EQUIPMENT_OWN.search(line) else None,
                      'basis': 'source_text', 'text': line})
    return found


def _person(raw):
    name = raw.strip().strip('"“”').strip()
    hours = PERSON_HOURS.search(name)
    declared = None
    if hours:
        name = name[:hours.start()].strip().rstrip(',;')
        declared = Decimal(hours[1].replace(',', '.'))
    name = re.sub(r'\s+', ' ', name).strip()
    if not name or re.fullmatch(r'[-–—№.\s]+', name):
        return None
    key = re.sub(r'\s+', ' ', name.replace('№', ' № '))
    key = ' '.join(sorted(t for t in key.casefold().split() if t not in {'№', '.'}))
    return {'person': key, 'name': name, 'hours': declared}


def crew_people(payload, source_text):
    if payload.get('crew'):
        parts = CREW_SPLIT.split(payload['crew'])
    else:
        parts = []
        section = False
        for line in (source_text or '').splitlines():
            stripped = line.strip().lstrip('- ').strip()
            if CREW_SECTION.match(stripped):
                section = True
                continue
            if section:
                if not stripped or SECTION_STOP.match(stripped):
                    break
                parts.append(stripped)
    result = []
    for item in parts:
        person = _person(item)
        if person:
            result.append(person)
    return result


def production_metrics(rows, from_date=None, to_date=None, calendar_limit=400):
    """Aggregate shift days, main and auxiliary work kinds by transformer, machine hours, crew days and weather."""
    days = defaultdict(lambda: {'kinds': {}, 'aux': {}, 'other': {}, 'areas': set(), 'sites': set(),
                                'equipment': [], 'weather': {}, 'people': [], 'reports': [],
                                'work': False, 'rest': False, 'reason': None})
    main_days = defaultdict(set)
    main_by_label = defaultdict(lambda: defaultdict(set))
    main_reports = defaultdict(set)
    main_area = defaultdict(lambda: defaultdict(set))
    main_site = defaultdict(lambda: defaultdict(set))
    aux_days = defaultdict(lambda: defaultdict(set))
    aux_reports = defaultdict(lambda: defaultdict(set))
    other_by_label = defaultdict(lambda: defaultdict(set))
    other_reports = defaultdict(set)
    site_work = defaultdict(set)
    site_rest = defaultdict(set)
    people = defaultdict(lambda: {'days': set(), 'hours': Decimal(0), 'displays': defaultdict(int),
                                  'reports': set(), 'sites': set()})
    machine = defaultdict(lambda: {'hours': Decimal(0), 'days': set(), 'reports': set(),
                                   'hired_days': set(), 'own_days': set(), 'unstated_days': set()})
    machine_hours_total = Decimal(0)
    unassigned_hours = Decimal(0)
    hours_by_date = defaultdict(Decimal)
    hours_by_site = defaultdict(Decimal)
    weather_days = defaultdict(set)
    uncategorized = defaultdict(lambda: {'days': set(), 'reports': set(), 'samples': []})

    for r in rows:
        stored = r.payload or {}
        source = (r.source_record.payload if r.source_record else None) or {}
        source_text = source.get('text') or ''
        # Where a current projection exists its fields win, exactly like the summary metrics do.
        payload = analysis_payload(stored, source)
        state = (current_normalization(stored, source) or {}).get('work_state') or stored.get('kind')
        day = days[r.work_date]
        day['reports'].append(r.id)
        day['sites'].add(r.site_id)
        lines = [(w.get('description') or w.get('type') or '') for w in (payload.get('work_entries') or [])]
        stated_areas = set()
        for line in lines + [payload.get('comment') or '']:
            stated_areas |= areas_of(line)
        field_areas = set()
        for value in ([payload.get('work_area')] if payload.get('work_area') else []):
            field_areas |= areas_of(str(value)) or {str(value)}
        day['areas'] |= stated_areas | field_areas
        declared_weather = weather_of(str(payload.get('weather') or ''))
        if declared_weather:
            day['weather'][declared_weather[0]] = declared_weather[1]

        for person in crew_people(payload, source_text):
            day['people'].append(person['name'])
            entry = people[person['person']]
            entry['days'].add(r.work_date)
            entry['displays'][person['name']] += 1
            entry['reports'].add(r.id)
            entry['sites'].add(r.site_id)
            if person['hours'] is not None:
                entry['hours'] += person['hours']

        for entry in parse_equipment(source_text, payload):
            day['equipment'].append(entry)
            machine_hours_total += entry['hours']
            hours_by_date[r.work_date] += entry['hours']
            hours_by_site[r.site_id] += entry['hours']
            bucket = machine[entry['type']]
            bucket['hours'] += entry['hours']
            bucket['days'].add(r.work_date)
            bucket['reports'].add(r.id)
            if entry['hired'] is True:
                bucket['hired_days'].add(r.work_date)
            elif entry['hired'] is False:
                bucket['own_days'].add(r.work_date)
            else:
                bucket['unstated_days'].add(r.work_date)

        for line in lines:
            condition = weather_of(line)
            if condition and len(line) <= 60:
                day['weather'][condition[0]] = condition[1]

        if state == 'work':
            day['work'] = True
            site_work[r.site_id].add(r.work_date)
        if REST_STATED.search(' '.join(lines)) or state == 'no_work':
            day['rest'] = True
            site_rest[r.site_id].add(r.work_date)
        if state == 'no_work':
            day['reason'] = day['reason'] or (stored.get('no_work_reason') or 'Работ не было')

        for line in lines:
            classified = classify_line(line)
            if classified is None:
                if line.strip() and not CONTEXT.search(line) and not weather_of(line):
                    item = uncategorized[re.sub(r'\s+', ' ', line.strip()).casefold()[:120]]
                    item['days'].add(r.work_date)
                    item['reports'].add(r.id)
                    if len(item['samples']) < 3 and line.strip()[:160] not in item['samples']:
                        item['samples'].append(line.strip()[:160])
                continue
            group, role, label = classified
            areas = areas_of(line) or stated_areas or field_areas or {'не указано'}
            day['areas'] |= areas
            if group in MAIN_KEYS:
                if role == 'main':
                    day['kinds'][group] = GROUP_LABELS[group]
                    main_days[group].add(r.work_date)
                    main_by_label[group][label].add(r.work_date)
                    main_reports[group].add(r.id)
                    main_site[group][r.site_id].add(r.work_date)
                    for area in areas:
                        main_area[group][area].add(r.work_date)
                else:
                    current = day['aux'].setdefault(group, [])
                    if label not in current:
                        current.append(label)
                    aux_days[group][label].add(r.work_date)
                    aux_reports[group][label].add(r.id)
            else:
                current = day['other'].setdefault(group, [])
                if label not in current:
                    current.append(label)
                other_by_label[group][label].add(r.work_date)
                other_reports[group].add(r.id)

    for iso, entry in days.items():
        for key in entry['weather']:
            weather_days[key].add(iso)

    work_dates = {d for d, v in days.items() if v['work'] and not v['rest']}
    rest_dates = {d for d, v in days.items() if v['rest']}
    known = sorted(days)
    start = str(from_date) if from_date else (known[0] if known else None)
    end = str(to_date) if to_date else (known[-1] if known else None)
    truncated = False
    if start and end:
        cursor = date.fromisoformat(start)
        stop = date.fromisoformat(end)
        if (stop - cursor).days + 1 > calendar_limit:
            stop = cursor + timedelta(days=calendar_limit - 1)
            truncated = True
        calendar = []
        while cursor <= stop:
            iso = cursor.isoformat()
            entry = days.get(iso)
            calendar.append({
                'date': iso, 'weekday': cursor.weekday(), 'is_weekend': cursor.weekday() >= 5,
                'state': 'work' if entry and entry['work'] and not entry['rest']
                         else 'rest' if entry and entry['rest'] else 'no_report',
                'kinds': sorted(entry['kinds']) if entry else [],
                'kind_labels': [entry['kinds'][k] for k in sorted(entry['kinds'])] if entry else [],
                'aux': sorted({label for values in entry['aux'].values() for label in values}) if entry else [],
                'other': sorted(entry['other']) if entry else [],
                'areas': sorted(entry['areas']) if entry else [],
                'equipment': sorted({e['type'] for e in entry['equipment']}) if entry else [],
                'hours': str(hours_by_date.get(iso) or Decimal(0)),
                'weather': sorted(entry['weather']) if entry else [],
                'people': sorted(set(entry['people'])) if entry else [],
                'report_ids': sorted(set(entry['reports'])) if entry else [],
                'reason': entry['reason'] if entry else None,
            })
            cursor += timedelta(days=1)
    else:
        calendar = []

    people_rows = []
    for key, item in people.items():
        name = max(item['displays'].items(), key=lambda kv: (kv[1], kv[0]))[0]
        people_rows.append({'person': key, 'name': name, 'day_count': len(item['days']),
                            'hours': str(item['hours']) if item['hours'] else None,
                            'is_group': bool(GROUP_MARKER.search(name)),
                            'is_temporary': bool(TEMPORARY_MARKER.search(name)),
                            'first_date': min(item['days']), 'last_date': max(item['days']),
                            'site_count': len(item['sites']), 'source_report_ids': sorted(item['reports'])})
    people_rows.sort(key=lambda row: (-row['day_count'], row['name']))

    numbered = re.compile(r'работник\s*№?\s*\d+', re.I)
    similar = [{'names': [left['name'], right['name']], 'days': [left['day_count'], right['day_count']]}
               for i, left in enumerate(people_rows) for right in people_rows[i + 1:]
               if len(left['person']) >= 4 and len(right['person']) >= 4
               and not (numbered.search(left['name']) and numbered.search(right['name']))
               and _levenshtein(left['person'], right['person']) <= 2]

    work_kinds = []
    for key, label in MAIN_GROUPS:
        work_kinds.append({
            'key': key, 'label': label, 'day_count': len(main_days[key]), 'report_count': len(main_reports[key]),
            'days_by_label': [{'label': name, 'day_count': len(dates)} for name, dates in
                              sorted(main_by_label[key].items(), key=lambda kv: (-len(kv[1]), kv[0]))],
            'areas': [{'area': area, 'label': AREA_LABELS.get(area, area), 'day_count': len(dates)}
                      for area, dates in sorted(main_area[key].items(), key=lambda kv: (-len(kv[1]), kv[0]))],
            'sites': [{'site_id': site, 'day_count': len(dates)} for site, dates in
                      sorted(main_site[key].items(), key=lambda kv: (-len(kv[1]), kv[0]))],
            'aux': [{'label': name, 'day_count': len(aux_days[key][name]), 'report_count': len(aux_reports[key][name])}
                    for name in sorted(aux_days[key], key=lambda n: (-len(aux_days[key][n]), n))],
            'source_report_ids': sorted(main_reports[key])})

    hour_days = [d for d, value in hours_by_date.items() if value > 0]
    unassigned_hours = sum((values['hours'] for name, values in machine.items()
                           if name in ('Заявлено без вида техники', 'Без указания техники')), Decimal(0))
    equipment_by_type = [{'type': name, 'hours': str(values['hours']), 'day_count': len(values['days']),
                          'report_count': len(values['reports']), 'hired_days': len(values['hired_days']),
                          'own_days': len(values['own_days']), 'ownership_not_stated_days': len(values['unstated_days'])}
                         for name, values in sorted(machine.items(), key=lambda kv: (-kv[1]['hours'], kv[0]))]

    return {
        'period': {'from_date': start, 'to_date': end, 'calendar_truncated': truncated},
        'workday_count': len(work_dates),
        'rest_day_count': len(rest_dates),
        'calendar': calendar,
        'work_kinds': work_kinds,
        'other_kinds': [{'key': key, 'label': GROUP_LABELS[key],
                         'day_count': len({d for dates in other_by_label[key].values() for d in dates}),
                         'report_count': len(other_reports[key]),
                         'works': [{'label': name, 'day_count': len(dates)} for name, dates in
                                   sorted(other_by_label[key].items(), key=lambda kv: (-len(kv[1]), kv[0]))]}
                        for key, _ in OTHER_GROUPS if other_by_label[key]],
        'uncategorized': [{'text': text, 'day_count': len(values['days']), 'report_count': len(values['reports']),
                           'samples': values['samples']}
                          for text, values in sorted(uncategorized.items(),
                                                    key=lambda kv: (-len(kv[1]['days']), kv[0]))][:40],
        'sites': [{'site_id': site, 'work_days': len(site_work[site]), 'rest_days': len(site_rest[site]),
                   'equipment_hours': str(hours_by_site.get(site, Decimal(0)))}
                  for site in sorted(set(site_work) | set(site_rest) | set(hours_by_site))],
        'equipment': {
            'day_count': len(hour_days),
            'total_hours': str(machine_hours_total),
            'unassigned_hours': str(unassigned_hours),
            'hours_by_type': equipment_by_type,
            'avg_hours_per_equipment_day': str(round(machine_hours_total / len(hour_days), 2)) if hour_days else None,
            'avg_hours_per_workday': str(round(machine_hours_total / len(work_dates), 2)) if work_dates else None,
        },
        'people': people_rows,
        'people_requires_check': similar,
        'weather': [{'condition': key, 'label': WEATHER_LABELS[key], 'days': sorted(dates)}
                    for key, dates in sorted(weather_days.items())],
        'limitations': [
            'Учтены только отправленные и проверенные отчёты: день без отчёта — отсутствие данных, а не выходной.',
            'Дни по видам работ считаются по формулировкам; одна смена может дать несколько показателей, '
            'это не физический объём и не процент готовности.',
            'Т1/Т2 читаются из текста смены: поле трансформатора в форме отчёта ещё не подключено, '
            'поэтому исторические смены в основном показаны как «трансформатор не указан».',
            'Погода видна только там, где она названа в тексте или в поле отчёта; отсутствие записи не означает ясную погоду.',
            'Часы техники заявлены отправителем и подняты из первички без переноса в проекцию; часы '
            '«Работа спецтехники: N часов» без вида техники показаны отдельно и не распределены по машинам.',
            'Дни по людям считаются по составу бригады в написании автора. Похожие имена не объединяются, '
            'а вынесены в список на сверку.',
            'Сварка без указания объекта отнесена к сварке металлоконструкций; сварка сетки и армопояса '
            'осталась в своих показателях.',
            'Временным помечен только работник с номером в названии («работник №1»); признак временного '
            'сотрудника в форме отчёта ещё не заполняется.',
        ],
    }


def _levenshtein(a, b):
    if abs(len(a) - len(b)) > 2:
        return 99
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]
