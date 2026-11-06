import {useEffect,useRef,useState} from 'react';
import {http} from './api';
import {formatDate,formatTimestamp} from './date';
import type {LaborDay} from './ownerTypes';

type Event = {
  id:string;
  actor_id:string;
  actor_login:string|null;
  occurred_at:string|null;
  before:LaborDay|null;
  after:LaborDay;
};
const money = (amount:number) => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(amount/100);

function Snapshot({title,day,siteName}:{title:string;day:LaborDay;siteName:(id:string)=>string}) {
  return <div className="labor-history-snapshot">
    <h4>{title} · версия {day.revision}</h4>
    <p>{formatDate(day.work_date)} · {siteName(day.site_id)} · {day.worked?'Рабочий день':'Без работ'}{day.business_trip?' · Командировка':''}</p>
    <dl>
      <dt>По нормативу</dt><dd>{money(day.base_kopecks)}</dd>
      <dt>Доплата</dt><dd>{money(day.allowance_kopecks)}</dd>
      <dt>Штраф</dt><dd>{money(day.fine_kopecks)}</dd>
      <dt>Итог</dt><dd>{money(day.total_kopecks)}</dd>
    </dl>
    {day.reason&&<p className="labor-history-reason">Причина: {day.reason}</p>}
  </div>;
}

export function LaborHistory({token,id,label,knownRevision,siteName,onClose}:{
  token:string;id:string;label:string;knownRevision:number;siteName:(id:string)=>string;onClose:()=>void;
}) {
  const [events,setEvents]=useState<Event[]|null>(null);
  const [error,setError]=useState('');
  const section=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setEvents(null);setError('');
    section.current?.scrollIntoView({block:'start'});section.current?.focus({preventScroll:true});
    void http<{id:string;events:Event[]}>('/owner/labor-days/'+id+'/history',token,{signal:controller.signal})
      .then(result=>{if(active)setEvents(result.events);})
      .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;controller.abort();};
  },[token,id]);
  const newer=(events?.at(-1)?.after.revision??knownRevision)>knownRevision;
  return <section className="card labor-history" aria-label="История дня табеля" ref={section} tabIndex={-1}>
    <div className="production-head"><div><h3>История начислений</h3><p>{label}</p></div><button type="button" className="quiet" onClick={onClose}>Закрыть историю</button></div>
    {error?<p className="error" role="alert">{error}</p>:events===null?<p role="status">Загрузка истории…</p>:<>
      {newer&&<p role="status">В истории есть более новая версия. Обновите табель, чтобы увидеть актуальные итоги.</p>}
      {!events.length?<p>История изменений для этой записи не найдена.</p>:<ol>{events.map(event=><li key={event.id}>
        <p className="muted">{event.occurred_at?formatTimestamp(event.occurred_at):'Время не зафиксировано'} · Автор: {event.actor_login||'неизвестная учётная запись'}</p>
        <div className="labor-history-versions">
          {event.before&&<Snapshot title="Было" day={event.before} siteName={siteName}/>}
          <Snapshot title={event.before?'Стало':'Создано'} day={event.after} siteName={siteName}/>
        </div>
      </li>)}</ol>}
    </>}
  </section>;
}
