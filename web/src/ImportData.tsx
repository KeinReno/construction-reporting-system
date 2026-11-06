import {useEffect,useState} from 'react';
import {BASE,http,type Report} from './api';
import {formatDate} from './date';
import { CrSkeleton } from './ui/CrSkeleton';
import { CrSearchField } from './ui/CrSearchField';

type Document={id:string;name:string;available:boolean};
type Coverage={id:string;messages:number;reports:number;duplicates:number;photos:number;unavailable_media:number;documents:Document[]};
type SourceRecord={id:string;date:string;text:string;duplicate:boolean;report_id:string|null;documents:Document[];media:Array<{id:string;kind:string;available:boolean}>};
type Records={total:number;page:number;items:SourceRecord[]};

function SourcePhoto({path,token}:{path:string;token:string}) {
  const [open,setOpen]=useState(false);const [url,setUrl]=useState('');const [error,setError]=useState('');
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();let objectUrl='';let active=true;
    setUrl('');setError('');
    void fetch(BASE+path,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить фотографию');return r.blob();})
      .then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Ошибка фотографии');});
    return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[open,path,token]);
  return <div><button className="quiet" type="button" onClick={()=>setOpen(!open)}>{open?'Скрыть фото':'Открыть фото'}</button>{open&&(error?<p role="alert">{error}</p>:url?<img src={url} alt="Фотография" style={{maxWidth:'100%',height:'auto'}}/>:<p>Загрузка фото…</p>)}</div>;
}

export function ImportData({token,reports,onOpen}:{token:string;reports:Report[];onOpen:(id:string)=>void}) {
  const [coverage,setCoverage]=useState<Coverage[]>([]);const [corpus,setCorpus]=useState('');
  const [query,setQuery]=useState('');const [search,setSearch]=useState('');const [kind,setKind]=useState('all');
  const [page,setPage]=useState(1);const [records,setRecords]=useState<Records|null>(null);const [error,setError]=useState('');
  const [browse,setBrowse]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setCoverage([]);setCorpus('');setError('');
    void http<Coverage[]>('/imports/coverage',token).then(data=>{if(active){setCoverage(data);setCorpus(data[0]?.id||'');}}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[token,retry]);
  useEffect(()=>{
    if(!browse||!corpus)return;
    let active=true;setRecords(null);setError('');
    const params=new URLSearchParams({q:search,kind,page:String(page)});
    void http<Records>(`/imports/${corpus}/records?${params}`,token).then(data=>{if(active)setRecords(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[browse,corpus,search,kind,page,token,retry]);
  const pending=reports.flatMap(report=>(report.normalization?.pending||[]).map(item=>({...item,report})));
  if(!coverage.length&&!error)return null;
  return <section className="card import-data" aria-label="Архив документов">
    <h2>Документы и записи</h2>

    {error&&<div role="alert"><p>{error}</p><button className="quiet" onClick={()=>setRetry(n=>n+1)}>Повторить загрузку</button></div>}
    {coverage.map(c=><div key={c.id}><p><strong>{c.messages} записей · {c.reports} отчётов · {c.photos} фото</strong></p>
      <details><summary>Документы: {c.documents.length}; недоступно: {c.documents.filter(d=>!d.available).length}</summary><ul>{c.documents.map(d=><li key={d.id}>{d.name} — {d.available?'Файл имеется':'Файл недоступен'}</li>)}</ul></details></div>)}
    <details><summary>Дополнительно · {pending.length}</summary>{pending.map((item,i)=><div className="report-work" key={`${item.report.id}-${i}`}><button className="quiet" onClick={()=>onOpen(item.report.id)}>{formatDate(item.report.data.work_date)} · открыть отчёт</button><p>{item.text}</p></div>)}</details>
    <button className="secondary" onClick={()=>setBrowse(!browse)}>{browse?'Скрыть записи':'Просмотреть все записи'}</button>
    {browse&&<div>
      {coverage.length>1&&<label>Набор данных<select value={corpus} onChange={e=>{setCorpus(e.target.value);setPage(1);}}>{coverage.map((c,i)=><option key={c.id} value={c.id}>Набор {i+1}</option>)}</select></label>}
      <form className="crs-import-search" onSubmit={e=>{e.preventDefault();setSearch(query);setPage(1);}}><CrSearchField label="Поиск в архиве" value={query} onChange={value=>setQuery(value.slice(0,200))} placeholder="Найти сообщения и документы"/><button className="secondary">Найти</button></form>
      <label>Тип записи<select value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="all">Все</option><option value="report">Отчёты</option><option value="context">Дополнительные сведения</option><option value="duplicate">Повторы</option><option value="document">Документы</option></select></label>
      {!records&&!error&&<CrSkeleton rows={4} label="Загрузка записей"/>}
      {records&&<><p>Найдено: {records.total}. Страница {records.page}.</p>{records.items.map(record=><details key={`${corpus}-${record.id}`}><summary>{formatDate(record.date)} · {record.report_id?'Отчёт':record.duplicate?'Повтор':'Запись'}{!record.text?' · медиа':''}</summary>
        <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{record.text||'Текст отсутствует'}</p>
        {record.report_id&&<button className="quiet" onClick={()=>onOpen(record.report_id!)}>Открыть отчёт</button>}
        {record.documents.map(d=><p key={d.id}>{d.name} · {d.available?'Доступен':'Файл не получен'}</p>)}
        {record.media.map(m=>m.available?<SourcePhoto key={m.id} token={token} path={`/imports/${corpus}/media/${encodeURIComponent(m.id)}`}/>:<p key={m.id}>Медиафайл не получен</p>)}
      </details>)}{!records.total&&<p>Совпадений нет. Измените поиск или тип записи.</p>}<div className="filters"><button className="quiet" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Предыдущая</button><button className="quiet" disabled={page*30>=records.total} onClick={()=>setPage(p=>p+1)}>Следующая</button></div></>}
    </div>}
  </section>;
}
