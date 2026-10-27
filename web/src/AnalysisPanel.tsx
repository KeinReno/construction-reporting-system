import { useState } from 'react';
import { http, type Summary } from './api';
type Answer={answer:string;mode:string;intent:string;supported:boolean;period:Summary["period"];metrics:Summary|null;source_report_ids:string[];limitations:string[]};
export function AnalysisPanel({token,siteId,authorId,fromDate,toDate,onSource}:{token:string;siteId:string;authorId:string;fromDate:string;toDate:string;onSource:(id:string)=>void}) {
  const [intent,setIntent]=useState('auto');
  const [question,setQuestion]=useState('');
  const [result,setResult]=useState<Answer|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function ask() {
    setBusy(true);setError('');setResult(null);
    try {setResult(await http<Answer>('/analytics/ask',token,{method:'POST',body:JSON.stringify({intent,question:question||'Сформировать анализ',filters:{site_id:siteId==='all'?null:siteId,author_id:authorId==='all'?null:authorId,from_date:fromDate||null,to_date:toDate||null}})}));}
    catch(e){setError(e instanceof Error?e.message:'Ошибка анализа');}
    finally{setBusy(false);}
  }
  return <section className="card tall"><h2>Аналитик по данным отчётов</h2>
    <p>Локальные серверные расчёты с источниками. Языковая модель пока не подключена.</p>
    <form onSubmit={e=>{e.preventDefault();void ask();}} className="analysis-form">
      <label>Вид анализа<select value={intent} onChange={e=>setIntent(e.target.value)}><option value="auto">По вопросу (локальные сценарии)</option><option value="summary">Сводка</option><option value="work_volume">Объёмы работ</option><option value="no_work">Без работ</option><option value="materials">Материалы в отчётах</option><option value="incidents">События и проблемы</option><option value="site_timeline">Хронология</option></select></label>
      <label>Вопрос (сохраняется только на экране)<input maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)}/></label>
      <p className="muted">Примеры: «Сколько отчётов?», «Какие объёмы работ?», «Какие простои повторяются?». Объект, автор и период задаются только фильтрами. Другие формулировки могут потребовать выбора сценария.</p>
      <button className="primary" disabled={busy}>{busy?'Расчёт…':'Сформировать анализ'}</button>
    </form>{error&&<p className="error" role="alert">{error}</p>}
    {result&&<div aria-live="polite"><h3>{result.answer}</h3><p>Период: {result.period.from_date||'начало истории'} — {result.period.to_date||'конец истории'}</p>
      {result.metrics&&<><ul>{result.metrics.volumes.map((v,i)=><li key={i}>{v.work_type}: {v.quantity} {v.unit} · объект {v.site_id}</li>)}</ul>
      <h3>Исходные отчёты ({result.source_report_ids.length})</h3><div className="source-links">{result.source_report_ids.map((id,i)=><button className="quiet" key={id} onClick={()=>onSource(id)}>Отчёт {i+1}</button>)}</div>
      {result.intent==='no_work'&&<ul>{result.metrics.no_work_reasons.map(r=><li key={r.reason}>{r.reason}: {r.report_count} отчётов</li>)}</ul>}
      {result.intent==='incidents'&&<ul>{result.metrics.incidents.map((event,i)=><li key={`${event.report_id}-${i}`}><button className="quiet" onClick={()=>onSource(event.report_id)}>{event.date} · {event.description}</button></li>)}</ul>}
      {result.intent==='materials'&&<ul>{result.metrics.materials.map((material,i)=><li key={`${material.report_id}-${i}`}><button className="quiet" onClick={()=>onSource(material.report_id)}>{material.date} · {material.name}{material.quantity!==null?` · ${material.quantity} ${material.unit||''}`:material.unit?` · ${material.unit}`:''}</button></li>)}</ul>}
      {result.intent==='site_timeline'&&<ul>{result.metrics.timeline.map(r=><li key={r.report_id}><button className="quiet" onClick={()=>onSource(r.report_id)}>{r.date} · {r.kind==='no_work'?'Без работ':'Работы'}</button></li>)}</ul>}
      </>}
      {result.limitations.map(x=><p className="muted" key={x}>{x}</p>)}
    </div>}
  </section>;
}
