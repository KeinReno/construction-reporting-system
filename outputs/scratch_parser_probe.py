import sys, sqlite3, json
sys.path.insert(0, 'C:/CRS-code/backend')
from app.normalize_import import normalize

conn = sqlite3.connect('file:C:/CRS-Live/data/crs.db?mode=ro', uri=True)
rows = conn.execute(
    "select r.client_report_id, r.work_date, r.payload, s.payload from reports r "
    "join report_sources s on s.report_id = r.id "
    "where r.work_date in ('2026-07-07','2026-07-12','2026-07-17','2026-07-28') order by r.work_date").fetchall()

for cid, wd, p, src in rows:
    payload = json.loads(p)
    text = json.loads(src).get('text', '')
    res = normalize(payload, text)
    print('=' * 70)
    print(f'{wd}  {cid[:8]}')
    print('  ACCEPTED FINANCE:', json.dumps(res['fields']['financial_entries'], ensure_ascii=False))
    print('  ACCEPTED EQUIP  :', json.dumps(res['fields']['equipment'], ensure_ascii=False))
    print('  PENDING         :', json.dumps([{'t': x['text'][:60], 'r': x['reason'][:45]} for x in res['pending']], ensure_ascii=False))
    fe = [w for w in res['fields']['work_entries'] if 'расход' in (w['description'] or '').lower()]
    print('  FULL MONEY TEXT LINES:')
    for line in text.splitlines():
        if any(ch.isdigit() for ch in line) and ('расход' in line.lower() or 'р' in line):
            print('     |', line.strip()[:95])
