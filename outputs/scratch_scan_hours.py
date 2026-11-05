import sqlite3, json, re, collections

conn = sqlite3.connect('file:C:/CRS-Live/data/crs.db?mode=ro', uri=True)
rows = conn.execute(
    'select r.client_report_id, r.work_date, s.payload from reports r '
    'join report_sources s on s.report_id = r.id order by r.work_date').fetchall()

HOUR = re.compile(r'(\d+(?:[.,]\d+)?)\s*(?:часов|часа|час\b|ч\.)', re.I)
EQ_HEADER = re.compile(r'^работа спец\s*техники', re.I)
OTHER_HEADER = re.compile(
    r'^(?:состав бригады|выполненные работы|работы|материалы|события|инциденты|планы на завтра|расходы)', re.I)
DATELINE = re.compile(r'^\d{1,2}\.\d{1,2}\.20\d{2}')

ignored = []
headers = collections.Counter()
section_bodies = 0

for client_id, work_date, src in rows:
    text = json.loads(src).get('text', '')
    inside = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if EQ_HEADER.search(line):
            inside = True
            headers[line[:50]] += 1
            continue
        if OTHER_HEADER.search(line) or DATELINE.match(line):
            inside = False
        m = HOUR.search(line)
        if m and not inside:
            ignored.append((work_date, line[:90]))

print('EQUIPMENT SECTION HEADERS:', dict(headers))
print('HOUR LINES OUTSIDE A RECOGNISED SECTION:', len(ignored))
for d, line in ignored:
    print('  ', d, '|', line)
