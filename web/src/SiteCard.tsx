import { useEffect, useState } from 'react';
import { BASE, reportStatusLabels, type Report, type Site } from './api';
import { formatDate } from './date';

const moneyKind = { expense: 'Расход', funding_received: 'Поступление', advance_issued: 'Аванс' } as const;
const movementLabel = { received: 'Поступило', consumed: 'Израсходовано', mentioned: 'Упоминание' } as const;
function money(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
}
function PhotoButton({ id, token, label, onOpen }: { id: string; token: string; label: string; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; let objectUrl = '';
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } }).then(async response => {
      if (!response.ok) throw new Error('Фото недоступно');
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (active) setError('Фото недоступно'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  return <button type="button" className="object-photo" onClick={onOpen} aria-label={label}>{error ? <span>{error}</span> : url ? <img src={url} alt="" /> : <span>Загрузка фото…</span>}</button>;
}

export function SiteCard({ site, reports, ready, token, authorName, onOpen, onBack }: {
  site: Site; reports: Report[]; ready: boolean; token: string;
  authorName: (login: string | null | undefined) => string;
  onOpen: (report: Report) => void; onBack: () => void;
}) {
  const ordered = [...reports].sort((a, b) => b.data.work_date.localeCompare(a.data.work_date) || b.revision - a.revision);
  const latest = ordered[0];
  const photos = ordered.flatMap(report => (report.data.required_photo_ids ?? []).map(id => ({ id, report })));
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const operations = ordered.flatMap(report => (report.data.financial_entries ?? []).map(entry => ({ ...entry, report })));
  const totals = { expense: 0, funding_received: 0, advance_issued: 0 };
  const counts = { expense: 0, funding_received: 0, advance_issued: 0 };
  for (const entry of operations) { totals[entry.kind] += entry.amount_kopecks; counts[entry.kind] += 1; }
  const materials = ordered.flatMap(report => (report.data.materials ?? []).map((row, index) => ({ row, report, index })));
  return <article className="object-card" aria-label={`Карточка объекта ${site.name}`}>
    <div className="section-heading"><h2>{site.name}</h2><button type="button" className="link-button" onClick={onBack}>Все объекты</button></div>
    {!ready ? <p className="empty">Загрузка сведений объекта…</p> : !ordered.length ? <p className="empty">За выбранные условия отчётов нет. Это не подтверждённый ноль работ.</p> : <>
      <p className="muted">{authorName(latest.author_login)} · последние сведения {formatDate(latest.data.work_date)} · {reportStatusLabels[latest.status]}</p>
      <section><h3>Сводка</h3>
        <p>{latest.data.kind === 'no_work' ? `Работ не было: ${latest.data.no_work_reason || 'причина не указана'}` : (latest.data.work_entries[0]?.type || 'Работы не указаны')}</p>
        {latest.data.incidents?.[0] ? <p>Заявлено в отчёте {formatDate(latest.data.work_date)}: {latest.data.incidents[0].description}. Это запись отчёта, не признак продолжающейся аварии.</p> : <p>В последнем отчёте проблема не заявлена.</p>}
        <p>План следующей смены: {latest.data.next_shift_plans?.[0] || 'не заявлен'}.</p>
        <p className="footnote">Сравнение с планом и процент готовности не показаны: плановые данные не заданы. Ожидаемые отчёты не рассчитываются.</p>
      </section>
      <section><h3>Ход работ</h3><div className="object-timeline">{ordered.map(report => <article key={report.id}>
        <small>{formatDate(report.data.work_date)} · {authorName(report.author_login)}{report.data.crew ? ` · ${report.data.crew}` : ''}</small>
        {report.data.kind === 'no_work' ? <p>Работ не было: {report.data.no_work_reason || 'причина не указана'}</p> : report.data.work_entries.map((work, index) => <p key={index}>{work.type}{work.quantity != null ? ` · ${work.quantity} ${work.unit || ''}` : ' · без численного объёма'}</p>)}
        {report.data.incidents?.map((item, index) => <p key={index}>Заявлено: {item.description}</p>)}
        <button type="button" className="link-button" onClick={() => onOpen(report)}>Открыть отчёт</button>
      </article>)}</div></section>
      <section><h3>Фото</h3>{photos.length ? <div className="object-photos">{photos.map((photo, index) => <figure key={photo.id}>
        <PhotoButton id={photo.id} token={token} label={`Фото отчёта за ${formatDate(photo.report.data.work_date)}`} onOpen={() => setPhotoIndex(index)} />
        <figcaption>{formatDate(photo.report.data.work_date)} · приложено к отчёту</figcaption>
      </figure>)}</div> : <p className="empty">К отчётам этого периода фото не приложены.</p>}</section>
      <section aria-label="Деньги объекта"><h3>Деньги</h3><div className="metric-grid">{(['expense', 'funding_received', 'advance_issued'] as const).map(kind => <div className="metric" key={kind}><span>{moneyKind[kind]}</span><strong>{counts[kind] ? money(totals[kind]) : 'Нет'}</strong><small>{counts[kind] ? 'Сумма операций объекта' : 'Нет операций этого вида. Это не ноль.'}</small></div>)}</div>
        {operations.map(entry => <p key={entry.id}>{moneyKind[entry.kind]} · {entry.category} · {money(entry.amount_kopecks)} · операция {formatDate(entry.operation_date)}{entry.operation_date !== entry.report.data.work_date ? `, отчёт ${formatDate(entry.report.data.work_date)}` : ''}</p>)}
        <p className="footnote">Остаток не показан: нет согласованного начального остатка.</p>
      </section>
      <section><h3>Ресурсы</h3>
        {materials.length ? materials.map(({ row, report, index }) => <p key={`${report.id}-${index}`}>{row.name}{row.unit ? `, ${row.unit}` : ''} · {movementLabel[row.direction ?? 'mentioned']}{row.quantity != null ? ` ${row.quantity}` : ', количество не указано'} · отчёт {formatDate(report.data.work_date)}</p>) : <p className="empty">Материалы в выбранных отчётах не указаны.</p>}
        <p className="footnote">Поступление и расход не складываются. Упоминание без направления не входит ни в одно из них.</p>
        {(ordered.some(report => report.data.equipment?.length)) ? ordered.flatMap(report => report.data.equipment ?? []).map((item, index) => <p key={index}>{item.type} · {item.hours} ч · {item.hired ? 'наёмная' : 'своя'}</p>) : <p className="empty">Часы техники не указаны.</p>}
        <p className="footnote">Стоимость техники не считается: тариф не задан.</p>
      </section>
    </>}
    {photoIndex != null && photos[photoIndex] && <dialog className="modal report-dialog" aria-label="Просмотр фото" ref={node => { if (node && !node.open) node.showModal(); }}><div>
      <div className="section-heading"><h2>Фото {photoIndex + 1} из {photos.length}</h2><button type="button" className="quiet" onClick={() => setPhotoIndex(null)}>Закрыть ✕</button></div>
      <PhotoButton id={photos[photoIndex].id} token={token} label="Крупное фото" onOpen={() => undefined} />
      <p>{formatDate(photos[photoIndex].report.data.work_date)} · приложено к отчёту</p>
      <div className="review-actions"><button type="button" className="secondary" onClick={() => setPhotoIndex((photoIndex + photos.length - 1) % photos.length)}>Предыдущее</button><button type="button" className="secondary" onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}>Следующее</button><button type="button" className="primary" onClick={() => { const report = photos[photoIndex].report; setPhotoIndex(null); onOpen(report); }}>К отчёту</button></div>
    </div></dialog>}
  </article>;
}
