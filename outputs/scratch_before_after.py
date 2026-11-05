import sys, sqlite3, json, collections
from copy import deepcopy
sys.path.insert(0, 'C:/CRS-code/backend')
from app.normalize_import import normalize, fingerprint

LIVE = 'file:C:/CRS-Live/data/crs.db?mode=ro'
COPY = 'file:C:/CRS-code/outputs/backup-20261104/crs-workcopy.db?mode=rw'


def totals(entries):
    t = collections.Counter()
    for e in entries:
        t[e['kind']] += e['amount_kopecks']
    return dict(t)


def collect(conn, fresh):
    rows = conn.execute(
        'select r.id, r.work_date, r.payload, s.payload from reports r '
        'join report_sources s on s.report_id = r.id').fetchall()
    acc = {'money': collections.Counter(), 'hours': 0.0, 'hours_queued': 0.0,
           'work': collections.Counter(), 'pending': collections.Counter(), 'measured': 0}
    detail = []
    for rid, wd, p, src in rows:
        text = json.loads(src).get('text', '')
        res = normalize(json.loads(p), text) if fresh else (json.loads(src).get('_normalization') or {})
        f = res.get('fields', {})
        acc['money'].update()
        for e in f.get('financial_entries', []):
            acc['money'][e['kind']] = acc['money'].get(e['kind'], 0) + e['amount_kopecks']
        for e in f.get('equipment', []):
            acc['hours'] += float(e['hours'])
        for x in res.get('pending', []):
            acc['pending'][x['reason'][:60]] += 1
            if x['kind'] == 'equipment' and x.get('value'):
                acc['hours_queued'] += float(x['value']['hours'])
        for w in f.get('work_entries', []):
            acc['work'][w['type']] += 1
            if w.get('quantity') is not None:
                acc['measured'] += 1
        detail.append((rid, res))
    return acc, detail


live = sqlite3.connect(LIVE, uri=True)
before, _ = collect(live, fresh=False)
print('=== BEFORE (stored projections, v1) ===')
print(' money RUB   :', {k: round(v / 100, 2) for k, v in before['money'].items()})
print(' equip hours :', before['hours'], '| queued hours:', before['hours_queued'])
print(' measured vol:', before['measured'], '| pending lines:', sum(before['pending'].values()))
for r, c in before['pending'].most_common():
    print(f'   {c:3d}  {r}')

after, newproj = collect(live, fresh=True)
print()
print('=== AFTER (recomputed with v2 parser) ===')
print(' money RUB   :', {k: round(v / 100, 2) for k, v in after['money'].items()})
print(' equip hours :', after['hours'], '| queued hours:', after['hours_queued'])
print(' measured vol:', after['measured'], '| pending lines:', sum(after['pending'].values()))
for r, c in after['pending'].most_common():
    print(f'   {c:3d}  {r}')
print()
print('=== WORK CATEGORY SHIFTS ===')
for k in sorted(set(before['work']) | set(after['work'])):
    if before['work'].get(k) != after['work'].get(k):
        print(f'   {k:40s} {before["work"].get(k,0):3d} -> {after["work"].get(k,0):3d}')

# Primary texts and canonical payloads must stay untouched; only the projection changes.
copy = sqlite3.connect(COPY, uri=True)
t = copy.execute('select payload from report_sources limit 1').fetchone()
changed = 0
for rid, res in newproj:
    src = json.loads(copy.execute('select payload from report_sources where report_id=?', (rid,)).fetchone()[0])
    prev = src.get('_normalization')
    if prev:
        src.setdefault('_normalization_history', []).append(prev)
    src['_normalization'] = res
    copy.execute('update report_sources set payload=? where report_id=?', (json.dumps(src, ensure_ascii=False), rid))
    changed += 1
copy.commit()
print()
print('work-copy projections written:', changed)
print('primary text unchanged check:', copy.execute(
    'select count(*) from report_sources s where s.report_id in '
    '(select r.id from reports r join report_sources x on x.report_id=r.id)').fetchone()[0], 'sources')
print('reports in copy:', copy.execute('select count(*) from reports').fetchone()[0])
print('integrity:', copy.execute('pragma integrity_check').fetchone()[0])
live.close(); copy.close()
