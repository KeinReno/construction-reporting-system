import {useEffect, useState} from 'react';
import {http, type Report} from './api';
import {formatDate, formatTimestamp} from './date';

export type ArchiveReview={id:string;client_report_id:string;source_message_id:string;decision:'fakel'|'not_fakel'|'insufficient';reason:string;actor:string;revision:number;created_at:string};
export type ArchiveReviewHistory=Record<string,ArchiveReview[]>;
const decisionLabels:Record<ArchiveReview['decision'],string>={fakel:'Относится к ПС Факел',not_fakel:'Не относится к ПС Факел',insufficient:'Недостаточно данных'};

export function useArchiveReviews(token:string){
  const [history,setHistory]=useState<ArchiveReviewHistory>({});
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{let active=true;void http<ArchiveReviewHistory>('/owner-demo/reconciliation',token)
    .then(value=>{if(active){setHistory(value);setState('ready');}})
    .catch(()=>{if(active)setState('error');});return()=>{active=false;};},[token]);
  const reload=async()=>{const value=await http<ArchiveReviewHistory>('/owner-demo/reconciliation',token);setHistory(value);setState('ready');};
  const append=(review:ArchiveReview)=>setHistory(current=>({...current,[review.client_report_id]:[...(current[review.client_report_id]||[]),review]}));
  return {history,state,reload,append};
}

export function isArchiveReviewResolved(history:ArchiveReview[]|undefined){
  const decision=history?.at(-1)?.decision;
  return decision==='fakel'||decision==='not_fakel';
}

export function ArchiveReviewItem({report,sourceMessageId,history,token,onOpen,onSaved,onReload}:{report:Report;sourceMessageId:string;history:ArchiveReview[];token:string;onOpen:()=>void;onSaved:(review:ArchiveReview)=>void;onReload:()=>Promise<void>}){
  const [decision,setDecision]=useState<ArchiveReview['decision']|null>(null);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(false);
  const latest=history.at(-1);
  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!decision){setError('Выберите решение по записи.');return;}
    if(reason.trim().length<10){setError('Укажите основание не короче 10 символов.');return;}
    setBusy(true);setError('');setSuccess(false);
    try{const review=await http<ArchiveReview>(`/owner-demo/reconciliation/${report.client_report_id}`,token,{method:'POST',body:JSON.stringify({decision,reason:reason.trim(),expected_revision:latest?.revision||0})});onSaved(review);setDecision(null);setReason('');setSuccess(true);}
    catch(e){const message=e instanceof Error?e.message:'';setError(message.includes('409')?'Решение изменилось. Обновите журнал и повторите запись.':'Не удалось сохранить решение. Проверьте соединение и повторите.');try{await onReload();}catch{/* Keep the entered reason so it can be retried. */}}
    finally{setBusy(false);}
  }
  return <article className="owner-review-item">
    <div className="owner-review-top"><div><time>{formatDate(report.data.work_date)}</time><h3>{latest?decisionLabels[latest.decision]:'Объект не подтверждён'}</h3><p>{report.data.work_entries.slice(0,2).map(work=>work.type).join('; ')||report.data.no_work_reason||'Работы не перечислены'}</p></div><span className={isArchiveReviewResolved(history)?'owner-review-state resolved':'owner-review-state'}>{isArchiveReviewResolved(history)?'Решение записано':'Требует сверки'}</span></div>
    <div className="owner-review-links"><button className="link-button" type="button" onClick={onOpen}>Открыть отчёт</button><a href={`/archive/?message=${encodeURIComponent(sourceMessageId)}`} target="_blank" rel="noreferrer">Исходное сообщение MAX ↗</a></div>
    <form onSubmit={e=>void save(e)}><fieldset><legend>Решение по принадлежности записи</legend>{([['fakel','Относится к ПС Факел'],['not_fakel','Не относится к ПС Факел'],['insufficient','Недостаточно данных']] as const).map(([value,label])=><label key={value}><input type="radio" name={`decision-${report.id}`} value={value} checked={decision===value} onChange={()=>{setDecision(value);setSuccess(false);}}/>{label}</label>)}</fieldset>
      <label className="owner-review-reason">Основание решения<textarea value={reason} maxLength={1000} rows={3} onChange={e=>{setReason(e.target.value);setSuccess(false);}} placeholder="Какие сведения из сообщения или документа это подтверждают?"/></label>
      <div className="owner-review-submit"><button className="primary" type="submit" disabled={busy||!decision||reason.trim().length<10}>Сохранить решение по записи</button><small>Для новой записи выберите решение и укажите основание. Исходный отчёт и расчёты не меняются.</small></div>
      {error&&<p className="error" role="alert">{error}</p>}{success&&<p className="owner-review-success" role="status">Решение по архивной записи сохранено.</p>}
    </form>
    {!!history.length&&<details className="owner-review-history"><summary>История сверки · {history.length}</summary><ol>{[...history].reverse().map(item=><li key={item.id}><strong>{decisionLabels[item.decision]}</strong><span>{formatTimestamp(item.created_at)} · {item.actor}</span><p>{item.reason}</p></li>)}</ol></details>}
  </article>;
}
