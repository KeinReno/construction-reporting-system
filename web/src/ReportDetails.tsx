import { formatDate, formatTimestamp } from './date';
import { useEffect, useRef, useState } from 'react';
import { BASE, http, reportStatusLabels, type Report } from './api';
import {ArchivePhoto, type OwnerPhoto} from './OwnerDemo';
type Event={id:string;revision:number;event:string;reason:string|null;occurred_at:string|null};
type HistoricalSource={source_ref:string;text:string;reported_author:string|null;message_date:string|null};
const eventLabels:Record<string,string>={created:'Создан',edited:'Изменён',submitted:'Доставлен',reviewed:'Проверен',needs_revision:'Возвращён на уточнение'};
const moneyKindLabels={expense:'Расход',funding_received:'Поступление',advance_issued:'Выдача аванса'};
const isShiftContext=(text:string)=>/^(допуск на площад|дождь$)/i.test(text.trim());
function money(kopecks:number){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(kopecks/100);}
function Photo({id,token}:{id:string;token:string}) {
  const [url,setUrl]=useState('');const [error,setError]=useState('');
  useEffect(()=>{let active=true;let objectUrl='';
    void fetch(BASE+'/attachments/'+id,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{
      if(!r.ok)throw new Error(`Не удалось загрузить фото (код ${r.status}).`);
      objectUrl=URL.createObjectURL(await r.blob());if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
    }).catch(e=>{if(active)setError(e instanceof TypeError?'Нет связи с сервером. Не удалось загрузить фото.':e.message);});
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[id,token]);
  return error?<p role="alert">{error}</p>:url?<a href={url} target="_blank" rel="noreferrer"><img className="report-photo" src={url} alt="Фотография из отчёта"/></a>:<p>Загрузка фото…</p>;
}
export function ReportDetails({report:r,token,role,siteName,authorName,ownerPhotos,returnFocusTo,onClose,onChange}:{report:Report;token:string;role:string;siteName:string;authorName:string;ownerPhotos?:OwnerPhoto[];returnFocusTo?:HTMLElement|null;onClose:()=>void;onChange:(r:Report)=>void}) {
  const active=useRef(true);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
  const dialog=useRef<HTMLDialogElement>(null);const [history,setHistory]=useState<Event[]>([]);
  const returnFocus=useRef<HTMLElement|null>(null);
  const [reason,setReason]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [source,setSource]=useState<HistoricalSource|null>(null);
  useEffect(()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.current?.showModal();},[]);
  useEffect(()=>{let active=true;void http<Event[]>(`/reports/${r.id}/history`,token).then(events=>{if(active)setHistory(events);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[r.id,r.status,r.revision,token]);
  useEffect(()=>{let active=true;void http<HistoricalSource|null>(`/reports/${r.id}/source`,token).then(value=>{if(active)setSource(value);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[r.id,token]);
  async function review(decision:string) {
    setBusy(true);setError('');
    try {const updated=await http<Report>(`/reports/${r.id}/review`,token,{method:'POST',body:JSON.stringify({expected_revision:r.revision,decision,reason:reason||null})});if(active.current)onChange(updated);}
    catch(e){setError(e instanceof Error?e.message:'Ошибка проверки');}finally{setBusy(false);}
  }
  const directPhotos=ownerPhotos?.filter(photo=>photo.relation==='same_message')||[];
  const datePhotos=ownerPhotos?.filter(photo=>photo.relation==='same_work_date')||[];
  const describedWorks=ownerPhotos?r.data.work_entries.filter(work=>!isShiftContext(work.type)):r.data.work_entries;
  const shiftContext=ownerPhotos?r.data.work_entries.filter(work=>isShiftContext(work.type)):[];
  function closeDialog(){const target=returnFocusTo?.isConnected?returnFocusTo:returnFocus.current;dialog.current?.close();if(target?.isConnected)target.focus();onClose();}
  return <dialog ref={dialog} className="modal report-dialog" onCancel={e=>{e.preventDefault();closeDialog();}} onClick={e=>{if(e.target===dialog.current)closeDialog();}} aria-label="Просмотр отчёта"><div>
    <div className="section-heading report-dialog-header"><h2>Отчёт за {formatDate(r.data.work_date)}</h2><button className="quiet" onClick={closeDialog}>Закрыть ✕</button></div>
    <div className="report-meta"><p><b>Объект:</b> {siteName}</p><p><b>{ownerPhotos?'Источник':'Автор в системе'}:</b> {authorName}</p><p>Статус: {ownerPhotos?'Историческая запись':reportStatusLabels[r.status] ?? 'Неизвестный статус'} · ревизия {r.revision}</p></div>
    <section><h3>Описанные работы</h3>{r.data.kind==='no_work'?<p>Работ не было: {r.data.no_work_reason}</p>:describedWorks.length?describedWorks.map((w,i)=><div className="report-work" key={i}><strong>{w.type}</strong>{w.quantity!==null&&<span>{w.quantity} {w.unit||''}</span>}{w.description&&w.description!==w.type&&<p>{w.description}</p>}</div>):<p className="muted">В записи нет описания выполненных работ.</p>}</section>
    {ownerPhotos&&<section className="owner-report-media"><h3>Фотографии и связь с отчётом</h3>{directPhotos.length?<><p className="muted">Фото в том же сообщении MAX · {directPhotos.length}</p><div className="owner-evidence-photos">{directPhotos.map(photo=><ArchivePhoto key={photo.id} photo={photo} token={token}/>)}</div></>:<p className="muted">Фото в том же сообщении не найдено.</p>}{!!datePhotos.length&&<details className="owner-date-photos"><summary>Фото чата за рабочую дату · {datePhotos.length} — связь требует проверки</summary><div className="owner-evidence-photos">{datePhotos.map(photo=><ArchivePhoto key={photo.id} photo={photo} token={token}/>)}</div></details>}</section>}
    {r.data.crew&&<section><h3>Бригада</h3><p className="report-comment">{r.data.crew}</p></section>}
    {!!shiftContext.length&&<section><h3>Сведения о смене</h3>{shiftContext.map((work,i)=><p className="report-comment" key={i}>{work.type}</p>)}</section>}
    {!!r.data.materials?.length&&<section><h3>Материалы</h3>{r.data.materials.map((m,i)=><div className="report-work" key={i}><strong>{m.name}</strong><span>{({mentioned:'Упоминание',received:'Поступило',consumed:'Израсходовано'} as const)[m.direction||'mentioned']}{(m.quantity!==null||m.unit)&&` · ${m.quantity!==null?`${m.quantity} ${m.unit||''}`:m.unit}`}</span></div>)}</section>}
    {!!r.data.incidents?.length&&<section><h3>События и проблемы</h3>{r.data.incidents.map((event,i)=><p className="report-comment" key={i}>{event.description}</p>)}</section>}
    {!!r.data.financial_entries?.length&&<section><h3>Денежные операции</h3><p className="muted">Поступления, расходы и авансы показаны отдельно; суммы не образуют остаток.</p>{r.data.financial_entries.map(entry=><div className="report-work" key={entry.id}><strong>{moneyKindLabels[entry.kind]} · {entry.category}</strong><span>{money(entry.amount_kopecks)} · {formatDate(entry.operation_date)}</span>{entry.description&&<p>{entry.description}</p>}</div>)}</section>}
    {!!r.data.equipment?.length&&<section><h3>Спецтехника</h3>{r.data.equipment.map((entry,i)=><div className="report-work" key={i}><strong>{entry.type}</strong><span>{entry.hours} ч · {entry.hired?'наёмная':'своя'}</span></div>)}</section>}
    {!!r.data.next_shift_plans?.length&&<section><h3>План следующей смены</h3><ul>{r.data.next_shift_plans.map((item,i)=><li key={i}>{item}</li>)}</ul></section>}
    {r.data.comment&&<section><h3>Комментарий</h3><p className="report-comment">{r.data.comment}</p></section>}
    {ownerPhotos&&<details className="owner-report-source"><summary>Исходное сообщение MAX</summary>{source?<><p className="muted">Дата сообщения: {source.message_date?formatDate(source.message_date):'не указана'} · ID: {source.source_ref.split('#').pop()}</p><p className="report-comment owner-source-text">{source.text}</p></>:<p className="muted">Загрузка исходного сообщения…</p>}</details>}
    {!ownerPhotos&&source&&<section><h3>Исходное сообщение</h3><p className="muted">Источник: {source.source_ref}{source.message_date&&` · дата сообщения: ${formatDate(source.message_date)}`}{source.reported_author&&` · автор по источнику: ${source.reported_author}`}</p><p className="report-comment">{source.text}</p><p className="footnote">Сведения из источника указаны оператором импорта; автор отчёта в системе — импортёр.</p></section>}
    {!ownerPhotos&&<section><h3>Фотографии ({r.data.required_photo_ids?.length ?? 0})</h3>{r.data.required_photo_ids?.length?<div className="photo-list">{r.data.required_photo_ids.map(id=><Photo key={id} id={id} token={token}/>)}</div>:<p className="muted">{source?.source_ref.includes('web.max.ru')?'Фотографии к этому отчёту не привязаны. Изображения из переписки доступны в архиве MAX.':'Фотографии не приложены.'}</p>}</section>}
    {r.receipt_id&&<p className="footnote">Квитанция: {r.receipt_id}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!ownerPhotos&&role==='manager'&&r.status==='submitted'&&<section><label>Причина возврата<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="review-actions">
      <button disabled={busy} className="primary" onClick={()=>void review('reviewed')}>Проверен</button><button disabled={busy||!reason.trim()} className="secondary" onClick={()=>void review('needs_revision')}>Вернуть на уточнение</button></div></section>}
    <h3>История</h3><ol>{history.map(e=><li key={e.id}>Ревизия {e.revision}: {eventLabels[e.event] ?? 'Неизвестное событие'} {e.reason&&`— ${e.reason}`} {e.occurred_at&&<small>{formatTimestamp(e.occurred_at)}</small>}</li>)}</ol>
  </div></dialog>;
}
