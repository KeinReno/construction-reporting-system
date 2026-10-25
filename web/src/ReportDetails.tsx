import { useEffect, useRef, useState } from 'react';
import { BASE, http, type Report } from './api';
type Event={id:string;revision:number;event:string;reason:string|null;occurred_at:string|null};
function Photo({id,token}:{id:string;token:string}) {
  const [url,setUrl]=useState('');const [error,setError]=useState('');
  useEffect(()=>{let active=true;let objectUrl='';
    void fetch(BASE+'/attachments/'+id,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{
      if(!r.ok)throw new Error(`Фото: HTTP ${r.status}`);
      objectUrl=URL.createObjectURL(await r.blob());if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[id,token]);
  return error?<p role="alert">{error}</p>:url?<a href={url} target="_blank" rel="noreferrer"><img className="report-photo" src={url} alt="Фотография из отчёта"/></a>:<p>Загрузка фото…</p>;
}
export function ReportDetails({report:r,token,role,siteName,onClose,onChange}:{report:Report;token:string;role:string;siteName:string;onClose:()=>void;onChange:(r:Report)=>void}) {
  const active=useRef(true);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
  const dialog=useRef<HTMLDialogElement>(null);const [history,setHistory]=useState<Event[]>([]);
  const [reason,setReason]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{let active=true;void http<Event[]>(`/reports/${r.id}/history`,token).then(events=>{if(active)setHistory(events);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[r.id,r.status,r.revision,token]);
  async function review(decision:string) {
    setBusy(true);setError('');
    try {const updated=await http<Report>(`/reports/${r.id}/review`,token,{method:'POST',body:JSON.stringify({expected_revision:r.revision,decision,reason:reason||null})});if(active.current)onChange(updated);}
    catch(e){setError(e instanceof Error?e.message:'Ошибка проверки');}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="modal report-dialog" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}} aria-label="Просмотр отчёта"><div>
    <div className="section-heading"><h2>Отчёт за {r.data.work_date}</h2><button className="quiet" onClick={onClose}>Закрыть ✕</button></div>
    <p><b>Объект:</b> {siteName}</p><p>Статус: {r.status} · ревизия {r.revision}</p>
    {r.data.kind==='no_work'?<p>Работ не было: {r.data.no_work_reason}</p>:r.data.work_entries.map((w,i)=><p key={i}>{w.type}: {w.quantity===null?w.description:`${w.quantity} ${w.unit||''}`}</p>)}
    {r.data.comment&&<p>Комментарий: {r.data.comment}</p>}
    <div className="photo-list">{r.data.required_photo_ids?.map(id=><Photo key={id} id={id} token={token}/>)}</div>
    {r.receipt_id&&<p className="footnote">Квитанция: {r.receipt_id}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {(role==='manager'||role==='admin')&&r.status==='submitted'&&<section><label>Причина возврата<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="review-actions">
      <button disabled={busy} className="primary" onClick={()=>void review('reviewed')}>Проверен</button><button disabled={busy||!reason.trim()} className="secondary" onClick={()=>void review('needs_revision')}>Вернуть на уточнение</button></div></section>}
    <h3>История</h3><ol>{history.map(e=><li key={e.id}>Ревизия {e.revision}: {e.event} {e.reason&&`— ${e.reason}`} {e.occurred_at&&<small>{new Date(e.occurred_at).toLocaleString('ru-RU')}</small>}</li>)}</ol>
  </div></dialog>;
}
