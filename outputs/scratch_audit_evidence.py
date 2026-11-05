import sqlite3, json, re, collections

conn = sqlite3.connect('file:C:/CRS-Live/data/crs.db?mode=ro', uri=True)
rows = conn.execute(
    'select r.id, r.client_report_id, r.site_id, r.work_date, r.status, r.payload, s.payload from reports r '
    'join report_sources s on s.report_id = r.id order by r.work_date').fetchall()

EQ_HDR = re.compile(r'^работа спец\s*техники', re.I)

print('=== 1. EQUIPMENT HEADER WITH INLINE TOTAL (hours lost) ===')
for rid, cid, site, wd, st, p, src in rows:
    text = json.loads(src).get('text', '')
    for line in text.splitlines():
        l = line.strip()
        if EQ_HDR.search(l) and re.search(r'\d', l):
            body = text.split(l)[-1][:260].strip()
            print(f'  {wd} | HEADER: {l}')
            print(f'         FOLLOWING LINES: {body!r}')

print()
print('=== 2. MISCLASSIFIED WORK PHRASES ===')
for rid, cid, site, wd, st, p, src in rows:
    n = json.loads(src).get('_normalization')
    if not n:
        continue
    for w in n['fields']['work_entries']:
        d = (w.get('description') or '')
        if re.search(r'разобрал|подготов', d, re.I):
            print(f'  {wd} | as "{w["type"]}" <- "{d[:80]}"')

print()
print('=== 3. MONEY MENTIONS NOT IN TOTALS ===')
for rid, cid, site, wd, st, p, src in rows:
    n = json.loads(src).get('_normalization')
    if not n:
        continue
    for pd in n['pending']:
        if pd['kind'] == 'finance':
            print(f'  {wd} | PENDING: "{pd["text"][:70]}"')

print()
print('=== 4. REPORTS PER SITE ===')
sites = dict(conn.execute('select id, name from sites').fetchall())
per = collections.Counter(r[2] for r in rows)
for s, cnt in per.items():
    print(f'  {cnt:3d}  {sites.get(s)}')
print('  Reports on the "requires reconciliation" site:')
for rid, cid, site, wd, st, p, src in rows:
    if sites.get(site, '').startswith('Объект требует'):
        print(f'    {wd}  {cid[:8]}  {json.loads(p).get("work_entries")}')

print()
print('=== 5. SAME-DAY DUPLICATE CANDIDATES ===')
byday = collections.defaultdict(list)
for rid, cid, site, wd, st, p, src in rows:
    byday[wd].append((cid, site, json.loads(src).get('text', '')))
for wd, items in sorted(byday.items()):
    if len(items) > 1:
        print(f'  {wd}: {len(items)} reports, sites {set(i[1][:4] for i in items)}')
        for cid, site, t in items:
            print(f'     {cid[:8]} {t[:200]!r}')

print()
print('=== 6. CORPUS DOCUMENTS ===')
for (pl,) in conn.execute('select payload from imported_corpora'):
    d = json.loads(pl)
    docs = d.get('documents', [])
    print('  messages:', len(d.get('messages', [])), '| documents:', len(docs),
          '| available:', sum(bool(x.get('available')) for x in docs))
    for x in docs[:25]:
        print(f'     available={bool(x.get("available"))} {str(x.get("name") or x.get("title"))[:60]}')
