import {useEffect,useRef,useState} from 'react';
import {filterQuery,http,type Site} from './api';
import {LaborSummary} from './LaborSummary';
import type {WorkType,Worker,LaborDay,LaborDayForm,LaborSummaryData} from './ownerTypes';
export type {WorkType} from './ownerTypes';
import {today} from './employee/model';
const names={main:'Основные',auxiliary:'Вспомогательные',special:'Особые'};
const rub=(value:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(value/100);
function amount(raw:string){if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))throw new Error('Укажите сумму с точностью до копеек');const [r,k='']=raw.replace(',','.').split('.');const n=Number(r)*100+Number(k.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>10_000_000_000)throw new Error('Сумма слишком велика');return n;}
export function OwnerOperations({token,isOwner,sites,mode,siteId='all',fromDate='',toDate='',reloadKey=0}:{token:string;isOwner:boolean;sites:Site[];mode:'catalog'|'labor';siteId?:string;fromDate?:string;toDate?:string;reloadKey?:number}){
 const [types,setTypes]=useState<WorkType[]>([]),[workers,setWorkers]=useState<Worker[]>([]),[days,setDays]=useState<LaborDay[]>([]);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false);
 const busy=loading||saving;
 const [summary,setSummary]=useState<LaborSummaryData|null>(null);
 const [daySelection,setDaySelection]=useState<{title:string;ids:string[]}|null>(null);
 const ledger=useRef<HTMLElement|null>(null);
 const generation=useRef(0);
 const scope=useRef({token,mode,siteId,fromDate,toDate});scope.current={token,mode,siteId,fromDate,toDate};
 const [editing,setEditing]=useState<WorkType|null>(null),[name,setName]=useState(''),[kind,setKind]=useState<WorkType['kind']>('main'),[parent,setParent]=useState('');
 const [workerName,setWorkerName]=useState(''),[day,setDay]=useState<LaborDayForm|null>(null),[allowance,setAllowance]=useState('0'),[fine,setFine]=useState('0');
 async function refresh(){
   const ticket=++generation.current;
   const current=scope.current;
   setLoading(true);setLoaded(false);setDays([]);setSummary(null);setDaySelection(null);
   try{
     if(current.mode==='catalog'){
       const result=await http<WorkType[]>('/reference/work-types',current.token);
       if(ticket!==generation.current)return;setTypes(result);
     }else{
       if(current.fromDate.startsWith('!')||current.toDate.startsWith('!')||(current.fromDate&&current.toDate&&current.fromDate>current.toDate))throw new Error('Исправьте период табеля');
       const query=filterQuery(current.siteId,current.fromDate,current.toDate);
       const [people,result]=await Promise.all([http<Worker[]>('/owner/workers',current.token),http<LaborSummaryData>('/owner/labor-summary'+query,current.token)]);
       if(ticket!==generation.current)return;setWorkers(people);setDays(result.days);setSummary(result);
     }
     setLoaded(true);
   }finally{if(ticket===generation.current)setLoading(false);}
 }
 useEffect(()=>{let active=true;setError('');void refresh().catch(e=>{if(active)setError(e.message);});return()=>{active=false;generation.current++;};},[token,mode,siteId,fromDate,toDate,reloadKey]);
 useEffect(()=>{if(daySelection){ledger.current?.scrollIntoView({block:'start'});ledger.current?.focus({preventScroll:true});}},[daySelection]);
 async function run(fn:()=>Promise<unknown>){setSaving(true);setError('');try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить');}finally{setSaving(false);}}
 const edit=(w:WorkType)=>{setEditing(w);setName(w.name);setKind(w.kind);setParent(w.parent_id||'');};
 function editDay(d?:LaborDay){const now=today();const date=fromDate&&fromDate>now?fromDate:toDate&&toDate<now?toDate:now;setDay(d||{id:crypto.randomUUID(),worker_id:workers[0]?.id||'',site_id:siteId!=='all'?siteId:sites[0]?.id||'',work_date:date,worked:true,business_trip:false,allowance_kopecks:0,fine_kopecks:0,reason:''});setAllowance(String((d?.allowance_kopecks||0)/100));setFine(String((d?.fine_kopecks||0)/100));}
 return <section className="owner-operations" aria-label={mode==='catalog'?'Виды работ':'Табель владельца'}>
 {error&&<p className="error" role="alert">{error}</p>}{!loaded&&<p role="status">{busy?'Загрузка…':'Данные не загружены'}</p>}
 {mode==='catalog'?<>
 <p>Основные, вспомогательные и особые работы. Удалённые виды сохраняются в истории отчётов.</p>
 {Object.entries(names).map(([key,label])=><section className="card" key={key}><h2>{label}</h2>{types.filter(w=>w.kind===key).map(w=><div className="ops-row" key={w.id}><span>{w.name}{w.parent_id&&<small> → {types.find(p=>p.id===w.parent_id)?.name}</small>}{!w.active&&<small> · В архиве</small>}</span>{isOwner&&<><button disabled={busy} type="button" className="quiet" onClick={()=>edit(w)}>Изменить</button>{w.active&&<button disabled={busy} type="button" className="quiet" onClick={()=>void run(()=>http('/owner/work-types/'+w.id,token,{method:'PATCH',body:JSON.stringify({name:w.name,kind:w.kind,parent_id:w.parent_id,active:false,expected_revision:w.revision})}))}>Убрать из выбора</button>}</>}</div>)}{!types.some(w=>w.kind===key)&&<p>Видов пока нет.</p>}</section>)}
 {isOwner&&<form className="card ops-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await http('/owner/work-types'+(editing?'/'+editing.id:''),token,{method:editing?'PATCH':'POST',body:JSON.stringify({name,kind,parent_id:kind==='auxiliary'?parent:null,active:true,...(editing?{expected_revision:editing.revision}:{})})});setEditing(null);setName('');});}}><h2>{editing?'Изменить вид работы':'Добавить вид работы'}</h2><label>Название<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label><label>Группа<select value={kind} onChange={e=>setKind(e.target.value as WorkType['kind'])}>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{kind==='auxiliary'&&<label>Основной вид<select required value={parent} onChange={e=>setParent(e.target.value)}><option value="">Выберите</option>{types.filter(w=>w.active&&w.kind==='main'&&w.id!==editing?.id).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<button disabled={busy}>Сохранить вид работы</button>{editing&&<button type="button" className="quiet" onClick={()=>{setEditing(null);setName('');}}>Отменить изменение</button>}</form>}
 </>:isOwner?<>
 <LaborSummary data={summary} loading={loading} siteName={id=>sites.find(s=>s.id===id)?.name||'Неизвестный объект'} onSources={(title,ids)=>setDaySelection({title,ids})}/>
 <section className="card" ref={ledger} tabIndex={-1}><h2>Табель и стоимость дней</h2><p>5 000 ₽ за каждый рабочий день. Стандарт — 8 часов. Командировка отмечается отдельно; доплаты и штрафы задаются вручную с причиной. Это начисления, не выплаты и не расходный журнал.</p><button disabled={busy||!loaded||!workers.length||!sites.length} onClick={()=>editDay()}>Добавить день</button>
 {daySelection&&<p className="labor-day-selection">{daySelection.title} · Дней в источниках: {daySelection.ids.length} <button type="button" className="quiet" onClick={()=>setDaySelection(null)}>Показать все дни периода</button></p>}
 <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Дни табеля"><table className="production-table" aria-label="Дни табеля"><thead><tr><th>Дата / человек</th><th>Объект</th><th>День</th><th>Доплата</th><th>Штраф</th><th>Итого</th><th>Действие</th></tr></thead><tbody>{days.filter(d=>!daySelection||daySelection.ids.includes(d.id)).map(d=><tr key={d.id}><th>{d.work_date}<br/>{workers.find(w=>w.id===d.worker_id)?.name}</th><td>{sites.find(s=>s.id===d.site_id)?.name}</td><td>{d.worked?'Рабочий':'Без работ'}{d.business_trip?' · командировка':''}</td><td>{rub(d.allowance_kopecks)}</td><td>{rub(d.fine_kopecks)}</td><td>{rub(d.total_kopecks)}</td><td><button className="quiet" onClick={()=>editDay(d)}>Изменить день</button></td></tr>)}</tbody></table></div></section>
 <form className="card ops-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await http('/owner/workers',token,{method:'POST',body:JSON.stringify({name:workerName})});setWorkerName('');});}}><h2>Добавить человека</h2><label>Имя работника<input required maxLength={200} value={workerName} onChange={e=>setWorkerName(e.target.value)}/></label><button disabled={busy}>Добавить человека</button></form>
 {day&&<form className="card ops-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const body={id:day.id,worker_id:day.worker_id,site_id:day.site_id,work_date:day.work_date,worked:day.worked,business_trip:day.business_trip,reason:day.reason,allowance_kopecks:amount(allowance),fine_kopecks:amount(fine),...(day.revision?{expected_revision:day.revision}:{})};await http('/owner/labor-days/'+day.id,token,{method:'PUT',body:JSON.stringify(body)});setDay(null);});}}><h2>День работника</h2><label>Работник<select disabled={!!day.revision} required value={day.worker_id} onChange={e=>setDay({...day,worker_id:e.target.value})}>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Объект<select required value={day.site_id} onChange={e=>setDay({...day,site_id:e.target.value})}>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Дата<input type="date" disabled={!!day.revision} required value={day.work_date} onChange={e=>setDay({...day,work_date:e.target.value})}/></label><label><input type="checkbox" checked={day.worked} onChange={e=>setDay({...day,worked:e.target.checked})}/> Рабочий день — 5 000 ₽</label><label><input type="checkbox" checked={day.business_trip} onChange={e=>setDay({...day,business_trip:e.target.checked})}/> Командировочный день</label><label>Доплата, ₽<input inputMode="decimal" value={allowance} onChange={e=>setAllowance(e.target.value)}/></label><label>Штраф, ₽<input inputMode="decimal" value={fine} onChange={e=>setFine(e.target.value)}/></label><label>Причина доплаты / штрафа<textarea maxLength={2000} value={day.reason} onChange={e=>setDay({...day,reason:e.target.value})}/></label><button disabled={busy||!loaded}>Сохранить день</button><button type="button" className="quiet" onClick={()=>setDay(null)}>Отмена</button></form>}
 </>:<p>Табель доступен только владельцу.</p>}
 </section>;
}
