import { useState, useEffect } from 'react';
import { BASE, reportViewData, reportWorkState, equipmentOwnership, type Report, type Site } from './api';
import { formatDate } from './date';
import { ReportStatus } from './reports/ReportStatus';
import { buildReportView, primaryWorks } from './reports/reportView';
import { OwnerIcon } from './ui/OwnerIcon';
import { SiteCalendar } from './sites/SiteCalendar';

const moneyKind = { expense: 'Расход', funding_received: 'Поступление', advance_issued: 'Аванс' } as const;
const movementLabel = { received: 'Поступило', consumed: 'Израсходовано', mentioned: 'Упоминание' } as const;
type Section = 'overview' | 'work' | 'photos' | 'money' | 'resources';
type Photo = { id: string; report: Report; relation: 'direct' | 'date' };
const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);

function PhotoButton({ id, token, label, onOpen }: { id: string; token: string; label: string; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; let objectUrl = '';
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error('Фото недоступно'); objectUrl = URL.createObjectURL(await response.blob()); if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch(() => { if (active) setError('Фото недоступно'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  return <button type="button" className="object-photo" onClick={onOpen} aria-label={label}>{error ? <span>{error}</span> : url ? <img src={url} alt="" /> : <span>Загрузка фото…</span>}</button>;
}

export function SiteCard({ site, reports, ready, token, authorName, onOpen, onBack, onMoney }: {
  site: Site; reports: Report[]; ready: boolean; token: string;
  authorName: (login: string | null | undefined) => string;
  onOpen: (report: Report) => void; onBack: () => void; onMoney: () => void;
}) {
  const [section, setSection] = useState<Section>('overview');
  const [showAllWork, setShowAllWork] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [photoGroup, setPhotoGroup] = useState<'direct' | 'date'>('direct');
  useEffect(() => { setSection('overview'); setShowAllWork(false); setShowAllPhotos(false); setShowAllResources(false); setPhotoIndex(null); }, [site.id]);
  const ordered = [...reports].sort((a, b) => b.data.work_date.localeCompare(a.data.work_date) || b.revision - a.revision);
  const latest = ordered[0];
  const latestView = latest ? buildReportView(latest, site.name, authorName(latest.author_login)) : null;
  const photos: Photo[] = ordered.flatMap(report => buildReportView(report,site.name,authorName(report.author_login)).photoIds.map(id => ({id,report,relation:'direct' as const})));
  const possiblePhotos: Photo[] = ordered.flatMap(report => (report.evidence?.photos || []).filter(p => p.relation === 'same_work_date').map(p => ({id:p.id,report,relation:'date' as const})));
  const activePhotos = photoGroup === 'direct' ? photos : possiblePhotos;
  const operations = ordered.filter(report => !!report.receipt_id && ['submitted','reviewed','needs_revision'].includes(report.status)).flatMap(report => (reportViewData(report).financial_entries ?? []).map(entry => ({ ...entry, report })));
  const incidents = ordered.flatMap(report => (reportViewData(report).incidents ?? []).map((incident,index) => ({ incident, report, index })));
  const totals = { expense: 0, funding_received: 0, advance_issued: 0 }; const counts = { expense: 0, funding_received: 0, advance_issued: 0 };
  for (const entry of operations) { totals[entry.kind] += entry.amount_kopecks; counts[entry.kind] += 1; }
  const materials = ordered.flatMap(report => (reportViewData(report).materials ?? []).map((row, index) => ({ row, report, index })));
  const machines = ordered.flatMap(report => (reportViewData(report).equipment ?? []).map((row,index) => ({row,report,index})));
  const worksShown = showAllWork ? ordered : ordered.slice(0, 8);
  const photoShown = showAllPhotos ? photos : photos.slice(0, 12);
  const candidateShown = showAllPhotos ? possiblePhotos : possiblePhotos.slice(0, 12);
  const latestData = latest ? reportViewData(latest) : null;
  const latestWorks = latest ? primaryWorks(latest) : [];
  const periods = ordered.length ? `${formatDate(ordered[ordered.length - 1].data.work_date)} — ${formatDate(ordered[0].data.work_date)}` : '';
  const setTab = (value: Section) => { setSection(value); setShowAllPhotos(false); setShowAllResources(false); };
  const openPhoto = (group:'direct'|'date', index:number) => { setPhotoGroup(group); setPhotoIndex(index); };
  function photoList(list:Photo[], group:'direct'|'date') {
    return <div className="object-photos">{list.map((photo,index)=><figure key={`${photo.report.id}-${photo.id}`}><PhotoButton id={photo.id} token={token} label={`${group==='direct'?'Фото отчёта':'Другие фото за дату'} за ${formatDate(photo.report.data.work_date)}`} onOpen={()=>openPhoto(group,index)}/><figcaption>{formatDate(photo.report.data.work_date)} · {group==='direct'?'Фото отчёта':'Другие фото за дату'}</figcaption></figure>)}</div>;
  }
  return <article className="object-card owner-object" aria-label={`Карточка объекта ${site.name}`}>
    <div className="section-heading"><span className="muted">Сведения по объекту</span><button type="button" className="link-button" onClick={onBack}>Все объекты</button></div>
    {!ready ? <p className="empty">Загрузка сведений объекта…</p> : <>
      <SiteCalendar key={site.id} reports={ordered} onOpen={onOpen}/>
      {!ordered.length ? <p className="empty">Нет отчётов за выбранный период.</p> : <>
      <header className="owner-object-brief">
        <div><p className="owner-object-last"><OwnerIcon name="calendar"/> Последний отчёт · {formatDate(latest.data.work_date)} <ReportStatus status={latest.status} label={latestView?.statusLabel || ''} archive={latest.origin==='imported'}/></p>
          {reportWorkState(latest) === 'no_work' ? <p>Работ не было: {latest.data.no_work_reason || 'причина не указана'}</p> : <p>{latestWorks.length ? latestWorks.slice(0,2).map(work => work.description || work.type).join('; ') : 'Работы не указаны'}</p>}
          {latestData?.incidents?.[0] && <p>Указано в отчёте: {latestData.incidents[0].description}</p>}
          {latestData?.next_shift_plans?.[0] && <p>План следующей смены: {latestData.next_shift_plans[0]}</p>}
          <button type="button" className="link-button" onClick={()=>onOpen(latest)}>Открыть последний отчёт</button>
        </div><p className="owner-object-period">{ordered.length} отчётов · {periods}<br/>{photos.length} фото</p>
      </header>
      <nav className="owner-object-nav" aria-label="Разделы объекта">
        {([['overview','Обзор','chart'],['work','Работы и отчёты','reports'],['photos','Фотографии','photo'],['money','Деньги','money'],['resources','Материалы и техника','work']] as const).map(([key,label,icon])=><button key={key} type="button" aria-pressed={section===key} onClick={()=>setTab(key)}><OwnerIcon name={icon}/>{label}</button>)}
      </nav>
      {section==='overview' && <div className="site-overview" aria-label="Обзор объекта">
        <div className="site-overview-main">
          <section aria-label="Последние отчёты объекта">
            <div className="owner-section-heading"><h3><span className="owner-section-icon"><OwnerIcon name="reports"/></span>Последние отчёты</h3><button type="button" className="link-button" onClick={()=>setTab('work')}>Все отчёты · {ordered.length}</button></div>
            <div className="site-overview-reports">{ordered.slice(0,4).map(report => {
              const data=reportViewData(report); const works=primaryWorks(report);
              const view=buildReportView(report,site.name,authorName(report.author_login));
              return <button type="button" className="site-overview-report" key={report.id} onClick={()=>onOpen(report)}>
                <span className="site-overview-date">{formatDate(report.data.work_date)}</span>
                <span className="site-overview-report-body"><strong>{reportWorkState(report)==='no_work' ? `Работ не было: ${data.no_work_reason || 'причина не указана'}` : works.length ? works.slice(0,2).map(work=>work.description||work.type).join('; ') : 'Работы не указаны'}</strong><small>{data.crew || authorName(report.author_login)} · {view.statusLabel}</small></span>
                <span className="site-overview-report-action">Открыть →</span>
              </button>;
            })}</div>
          </section>
          <section aria-label="Последние фотографии объекта" className="site-overview-photos">
            <div className="owner-section-heading"><h3><span className="owner-section-icon"><OwnerIcon name="photo"/></span>Фотографии</h3><button type="button" className="link-button" onClick={()=>setTab('photos')}>Все фото</button></div>
            {photos.length ? photoList(photos.slice(0,4),'direct') : <p className="empty">Нет фотографий за выбранный период.</p>}

          </section>
        </div>
        <aside className="site-overview-side">
          <section aria-label="Деньги в обзоре объекта">
            <div className="owner-section-heading"><h3><span className="owner-section-icon"><OwnerIcon name="money"/></span>Деньги</h3><button type="button" className="link-button" onClick={()=>setTab('money')}>Подробнее</button></div>
            <p className="site-overview-note">В отчётах за выбранные даты смен</p>
            <dl className="site-overview-money">{(['expense','funding_received','advance_issued'] as const).map(kind=><div key={kind}><dt>{moneyKind[kind]}</dt><dd>{counts[kind] ? money(totals[kind]) : 'Не указано'}</dd></div>)}</dl>

          </section>
          <section aria-label="События из отчётов" className="site-overview-events">
            <div className="owner-section-heading"><h3><span className="owner-section-icon owner-section-icon-event"><OwnerIcon name="event"/></span>События из отчётов</h3></div>
            {incidents.length ? <><p className="site-overview-note">Последние указанные события за выбранный период</p><div>{incidents.slice(0,3).map(({incident,report,index})=><button className="site-overview-event" type="button" key={`${report.id}-${index}`} onClick={()=>onOpen(report)}><time dateTime={report.data.work_date}>{formatDate(report.data.work_date)}</time><span>{incident.description}</span><small>Открыть отчёт →</small></button>)}</div>{incidents.length>3 && <button type="button" className="link-button" onClick={()=>setTab('work')}>Все отчёты</button>}</> : <p className="empty">События в выбранных отчётах не указаны.</p>}
          </section>
        </aside>
      </div>}
      {section==='work' && <section className="object-zone" aria-label="Ход работ"><div className="owner-section-heading"><h3>Ход работ</h3><span>{ordered.length} отчётов за выбранный период</span></div><div className="object-timeline">
        {worksShown.map(report => { const data=reportViewData(report); const works=primaryWorks(report); return <article className="object-timeline-item" key={report.id}>
          <time dateTime={report.data.work_date}>{formatDate(report.data.work_date)}</time><div className="body"><span className="meta">{authorName(report.author_login)}{data.crew ? ` · ${data.crew}` : ''}</span>
            {reportWorkState(report)==='no_work' ? <p>Работ не было: {data.no_work_reason || 'причина не указана'}</p> : works.length ? works.map((work,index)=><p key={index}>{work.description || work.type}{work.quantity != null ? ` · ${work.quantity} ${work.unit || ''}` : ''}</p>) : <p className="muted">Описание работ в записи отсутствует.</p>}
            {data.incidents?.map((item,index)=><p key={index}>Заявлено: {item.description}</p>)}
          </div><button type="button" className="link-button" onClick={()=>onOpen(report)}>Открыть отчёт</button></article>; })}
      </div>{ordered.length>8 && <button type="button" className="secondary owner-show-more" onClick={()=>setShowAllWork(!showAllWork)}>{showAllWork?'Показать последние 8':`Показать все отчёты (${ordered.length})`}</button>}</section>}
      {section==='photos' && <section className="object-zone" aria-label="Фото объекта"><h3>Фото из отчётов</h3>{photos.length ? photoList(photoShown,'direct') : <p className="empty">Нет фотографий за выбранный период.</p>}
        {!!possiblePhotos.length && <details className="owner-possible-photos"><summary>Другие фото за те же даты · {possiblePhotos.length}</summary>{photoList(candidateShown,'date')}</details>}
        {(photos.length>12 || possiblePhotos.length>12) && <button type="button" className="secondary owner-show-more" onClick={()=>setShowAllPhotos(!showAllPhotos)}>{showAllPhotos?'Показать меньше':'Показать все фотографии'}</button>}
      </section>}
      {section==='money' && <section className="object-zone" aria-label="Деньги объекта"><h3>Деньги</h3><p className="muted">Операции за выбранный период</p>
        <div className="owner-object-totals">{(['expense','funding_received','advance_issued'] as const).map(kind=><div key={kind}><span>{moneyKind[kind]}</span><strong>{counts[kind] ? money(totals[kind]) : 'Не указано'}</strong></div>)}</div>
        <div className="object-money-list">{operations.slice(0,8).map(entry=><button type="button" className="owner-object-entry" key={`${entry.report.id}-${entry.id}`} onClick={()=>onOpen(entry.report)}>{moneyKind[entry.kind]} · {entry.category} · {money(entry.amount_kopecks)} · {formatDate(entry.operation_date)}{entry.date_basis==='report_date'?' · дата оплаты не указана':''} · открыть отчёт</button>)}</div>
        <button type="button" className="secondary" onClick={onMoney}>Все денежные операции</button>
      </section>}
      {section==='resources' && <section className="object-zone" aria-label="Материалы и техника объекта"><h3>Материалы</h3><div className="object-resource-list">{materials.length ? (showAllResources?materials:materials.slice(0,10)).map(({row,report,index})=><button type="button" className="owner-object-entry" key={`${report.id}-${index}`} onClick={()=>onOpen(report)}>{row.name}{row.unit?`, ${row.unit}`:''} · {movementLabel[row.direction??'mentioned']}{row.quantity!=null?` ${row.quantity}`:', количество не указано'} · отчёт {formatDate(report.data.work_date)}</button>) : <p className="empty">Материалы в выбранных отчётах не указаны.</p>}</div>
        <h3>Техника</h3><div className="object-resource-list">{machines.length ? (showAllResources?machines:machines.slice(0,10)).map(({row,report,index})=><button type="button" className="owner-object-entry" key={`${report.id}-${index}`} onClick={()=>onOpen(report)}>{row.type} · {row.hours} ч · {equipmentOwnership(row.hired).toLocaleLowerCase('ru-RU')} · отчёт {formatDate(report.data.work_date)}</button>) : <p className="empty">Часы техники не указаны.</p>}</div>
        {(materials.length>10||machines.length>10)&&<button type="button" className="secondary owner-show-more" onClick={()=>setShowAllResources(!showAllResources)}>{showAllResources?'Показать меньше':'Показать все записи'}</button>}
      </section>}
    </>}</>}
    {photoIndex != null && activePhotos[photoIndex] && <dialog className="modal report-dialog" aria-label="Просмотр фото" onCancel={()=>setPhotoIndex(null)} ref={node=>{if(node&&!node.open)node.showModal();}}><div>
      <div className="section-heading"><h2>Фото {photoIndex+1} из {activePhotos.length}</h2><button type="button" className="quiet" onClick={()=>setPhotoIndex(null)}>Закрыть</button></div>
      <PhotoButton id={activePhotos[photoIndex].id} token={token} label="Крупное фото" onOpen={()=>undefined}/><p>{formatDate(activePhotos[photoIndex].report.data.work_date)} · {photoGroup==='direct'?'Фото отчёта':'Другие фото за дату'}</p>
      <div className="review-actions"><button type="button" className="secondary" onClick={()=>setPhotoIndex((photoIndex+activePhotos.length-1)%activePhotos.length)}>Предыдущее</button><button type="button" className="secondary" onClick={()=>setPhotoIndex((photoIndex+1)%activePhotos.length)}>Следующее</button><button type="button" className="primary" onClick={()=>{const report=activePhotos[photoIndex].report;setPhotoIndex(null);onOpen(report);}}>К отчёту</button></div>
    </div></dialog>}
  </article>;
}
