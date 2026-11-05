import { type Report, type Summary } from './api';
import { primaryWorks, buildReportView } from './reports/reportView';
import { OwnerIcon } from './ui/OwnerIcon';
import { formatDate } from './date';
import { useState } from 'react';

export function AnalyticsOverview({summary,reports,ready,siteName,onOpen,onSources}:{summary:Summary|null;reports:Report[];ready:boolean;siteName:(id:string)=>string;onOpen:(id:string)=>void;onSources:(title:string,ids:string[])=>void}) {
  const ids=new Set(summary?.source_report_ids??[]);
  const scope=reports.filter(r=>ids.has(r.id));
  const noVolume=scope.filter(r=>primaryWorks(r).some(w=>w.quantity===null||!w.unit));
  const noPhotos=scope.filter(r=>buildReportView(r,'','').photoCount===0);
  const incidents=summary?.incidents??[];
  const [showAll,setShowAll]=useState(false);
  const groups=new Map<string,{site_id:string;work_type:string;source_report_ids:Set<string>}>();
  for(const r of scope)for(const work of primaryWorks(r)) {
    const key=JSON.stringify([r.site_id,work.type]);
    const item=groups.get(key)??{site_id:r.site_id,work_type:work.type,source_report_ids:new Set<string>()};
    item.source_report_ids.add(r.id);groups.set(key,item);
  }
  const categories=[...groups.values()].sort((a,b)=>b.source_report_ids.size-a.source_report_ids.size||a.work_type.localeCompare(b.work_type,'ru'));
  return <div className="crs-control-overview">
    <div className="control-stats" aria-label="Сводка отчётов">
      <div><span className="control-label"><OwnerIcon name="reports"/>Отчётов в выборке</span><strong>{ready?summary?.report_count??0:'—'}</strong><small>По выбранным условиям сводки</small></div>
      <div><span className="control-label"><OwnerIcon name="event"/>Указано событий</span><strong>{ready?summary?.incident_count??0:'—'}</strong><small>Состояние решения не зафиксировано</small></div>
      <div><span className="control-label"><OwnerIcon name="review"/>На проверке</span><strong>{ready?reports.filter(r=>r.origin!=='imported'&&r.status==='submitted').length:'—'}</strong><small>Новые отчёты сотрудников</small></div>
    </div>
    <section className="card control-attention"><div className="control-heading"><OwnerIcon name="event"/><h2>Где нужно внимание</h2></div><p className="muted">События и проблемы, описанные авторами. Запись события не означает, что проблема ещё открыта.</p>
      {!ready?<p className="empty">Сводка пока не загружена.</p>:incidents.length?<div className="control-incidents">{(showAll?incidents:incidents.slice(0,4)).map((event,i)=>{const r=reports.find(r=>r.id===event.report_id);return <article className="control-incident" key={`${event.report_id}-${i}`}><p>{event.description}</p><small>{formatDate(event.date)}{r?` · ${siteName(r.site_id)}`:''}</small><div className="control-action"><span>Действие, ответственный и срок: не указаны</span><span>Состояние решения: неизвестно</span></div><button className="quiet" onClick={()=>onOpen(event.report_id)}>Открыть исходный отчёт <OwnerIcon name="arrow"/></button></article>})}</div>:<p className="empty">В выбранной сводке события не зарегистрированы. Это не подтверждение отсутствия проблем.</p>}
      {incidents.length>4&&<button className="quiet" onClick={()=>setShowAll(!showAll)}>{showAll?"Свернуть события":`Все события · ${incidents.length}`}</button>}
    </section>
    <section className="card"><div className="control-heading"><OwnerIcon name="review"/><h2>Что мешает оценить результат</h2></div><div className="control-quality">
      <button className="volume-row" disabled={!ready||!noVolume.length} onClick={()=>onSources('Отчёты без количества или единицы',noVolume.map(r=>r.id))}><span>Есть работы без количества или единицы</span><b>{ready?noVolume.length:'—'} отч.</b></button>
      <button className="volume-row" disabled={!ready||!noPhotos.length} onClick={()=>onSources('Отчёты без связанных фотографий',noPhotos.map(r=>r.id))}><span>Нет фотографий, связанных с отчётом</span><b>{ready?noPhotos.length:'—'} отч.</b></button>
    </div><p className="muted control-note">Отсутствие объёма или фото не всегда ошибка. Фото за ту же дату не считаются подтверждением конкретного отчёта. Полнота сдачи неизвестна: график не подключён. Приёмка работ отдельно не подтверждается статусом отчёта.</p></section>
    <section className="card"><div className="control-heading"><OwnerIcon name="chart"/><h2>Какие работы упоминаются</h2></div><p className="muted">Число уникальных отчётов с формулировкой. Это не физический объём и не процент готовности.</p>
      {ready&&categories.length?<div className="control-categories">{categories.map((item,i)=><button type="button" className="volume-row" key={`${item.site_id}-${i}`} onClick={()=>onSources(item.work_type,[...item.source_report_ids])}><span className="control-category"><strong>{item.work_type}</strong><small>{siteName(item.site_id)}</small><span className="control-track" aria-hidden="true"><span style={{width:`${Math.min(100,item.source_report_ids.size/Math.max(1,summary?.report_count??0)*100)}%`}}/></span></span><b>{item.source_report_ids.size} отч. <OwnerIcon name="arrow"/></b></button>)}</div>:<p className="empty">{ready?'Формулировки работ не указаны.':'Загрузка сводки…'}</p>}
      <p className="muted control-note">Один отчёт может входить в несколько категорий. Сравнение с планом недоступно: план работ не подключён.</p>
    </section>
  </div>;
}
