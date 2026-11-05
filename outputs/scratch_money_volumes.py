import sys, sqlite3, json, re, collections
sys.path.insert(0, 'C:/CRS-code/backend')
from app.normalize_import import normalize

conn = sqlite3.connect('file:C:/CRS-Live/data/crs.db?mode=ro', uri=True)
rows = conn.execute(
    'select r.client_report_id, r.work_date, r.site_id, r.payload, s.payload from reports r '
    'join report_sources s on s.report_id = r.id order by r.work_date').fetchall()

acc = collections.Counter()
pending_lines = []
for cid, wd, site, p, src in rows:
    res = normalize(json.loads(p), json.loads(src).get('text', ''))
    for fe in res['fields']['financial_entries']:
        acc[fe['kind']] += fe['amount_kopecks']
    for x in res['pending']:
        if x['kind'] == 'finance':
            pending_lines.append((wd, x['text']))

print('ACCEPTED TOTALS (kopecks -> RUB):')
for k, v in acc.items():
    print(f'   {k:20s} {v/100:>12,.2f}')
print()
print('PENDING FINANCE LINES (uncounted):')
for wd, t in pending_lines:
    nums = re.findall(r'\d[\d ]*(?:[.,]\d{1,2})?', t)
    print(f'   {wd}  {t[:75]}   numbers={nums}')

print()
print('MEASURED VOLUMES (quantity is not null):')
for cid, wd, site, p, src in rows:
    res = normalize(json.loads(p), json.loads(src).get('text', ''))
    for w in res['fields']['work_entries']:
        if w.get('quantity') is not None:
            print(f'   {wd}  {w["type"][:34]:34s} {w["quantity"]} {w["unit"]}  <- {w["description"][:52]}')
