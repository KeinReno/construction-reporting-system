import {useMemo,useState} from 'react';
import {type Report,type Site} from './api';
import {formatDate} from './date';
import {type OwnerContext} from './OwnerDemo';

function reportSummary(report:Report){
  if(report.data.kind==='no_work')return `Без работ: ${report.data.no_work_reason||'причина не указана'}`;
  return report.data.work_entries.slice(0,2).map(work=>work.type).join('; ')||'Описание работы требует разбора';
}

export function OwnerJournal({reports,sites,context,onOpen}:{reports:Report[];sites:Site[];context:OwnerContext;onOpen:(report:Report)=>void}){
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(18);
  const siteNames=useMemo(()=>new Map(sites.map(site=>[site.id,site.name])),[sites]);
  const matches=useMemo(()=>reports.filter(report=>{
    const searchable=`${formatDate(report.data.work_date)} ${siteNames.get(report.site_id)||''} ${reportSummary(report)} ${report.data.comment||''}`.toLocaleLowerCase('ru-RU');
    return searchable.includes(query.trim().toLocaleLowerCase('ru-RU'));
  }).sort((a,b)=>b.data.work_date.localeCompare(a.data.work_date)),[reports,query,siteNames]);
  const shown=matches.slice(0,limit);
  return <section className="owner-journal" aria-label="Архивные записи">
    <div className="owner-journal-head"><div><h2>Записи по рабочим датам</h2><p>Найдено: {matches.length} · в выборке: {reports.length}. Откройте запись, чтобы увидеть исходное сообщение и связанные изображения.</p></div>
      <label>Поиск по содержанию<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(18);}} placeholder="Дата, объект или работа"/></label></div>
    <div className="owner-journal-list"><div className="owner-journal-labels" aria-hidden="true"><span>Дата</span><span>Что описано</span><span>Изображения</span></div>
      {shown.map(report=>{const source=context.reports[report.client_report_id];const photos=source?.photos||[];const sameMessage=photos.filter(photo=>photo.relation==='same_message').length;const sameDate=photos.length-sameMessage;const uncertain=source?.other_site_mentioned;return <button className="owner-journal-row" key={report.id} onClick={()=>onOpen(report)} aria-label={`Открыть запись за ${formatDate(report.data.work_date)}: ${reportSummary(report)}`}>
        <time>{formatDate(report.data.work_date)}</time><span className="owner-journal-description"><strong>{reportSummary(report)}</strong><small>{uncertain?'Объект требует сверки':siteNames.get(report.site_id)?.replace(' · по истории чата','')||'Объект не указан'}</small></span>
        <span className={`owner-journal-proof${sameMessage?' direct':''}`}>{sameMessage?`${sameMessage} в сообщении`:sameDate?`${sameDate} по дате`:'—'}</span></button>})}
    </div>
    {!matches.length&&<p className="empty">По запросу ничего не найдено. Измените поиск или фильтры выше.</p>}
    {matches.length>limit&&<button className="secondary owner-journal-more" onClick={()=>setLimit(value=>value+18)}>Показать ещё ({Math.min(18,matches.length-limit)})</button>}
    <p className="owner-journal-note">«По дате» означает совпадение чата и рабочей даты. Связь изображения с работой не подтверждена.</p>
  </section>;
}
