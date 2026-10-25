import { useState } from 'react';
import { http, type Summary } from './api';
type Answer={answer:string;mode:string;metrics:Summary;source_report_ids:string[];limitations:string[]};
export function AnalysisPanel({token,siteId,fromDate,toDate,onSource}:{token:string;siteId:string;fromDate:string;toDate:string;onSource:(id:string)=>void}) {
  const [intent,setIntent]=useState('summary');
  const [question,setQuestion]=useState('');
  const [result,setResult]=useState<Answer|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function ask() {
    setBusy(true);setError('');setResult(null);
    try {setResult(await http<Answer>('/analytics/ask',token,{method:'POST',body:JSON.stringify({intent,question:question||'Сформировать анализ',filters:{site_id:siteId==='all'?null:siteId,from_date:fromDate||null,to_date:toDate||null}})}));}
    catch(e){setError(e instanceof Error?e.message:'Ошибка анализа');}
    finally{setBusy(false);}
  }
  return <section className="card tall"><h2>Аналитик по данным отчётов</h2>
    <p>Локальные серверные расчёты с источниками. Языковая модель пока не подключена.</p>
    <form onSubmit={e=>{e.preventDefault();void ask();}} className="analysis-form">
      <label>Вид анализа<select value={intent} onChange={e=>setIntent(e.target.value)}><option value="summary">Сводка</option><option value="work_volume">Объёмы работ</option><option value="no_work">Без работ</option><option value="site_timeline">Хронология</option></select></label>
      <label>Вопрос (сохраняется только на экране)<input maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)}/></label>
      <p className="muted">Используются вид анализа и верхние фильтры. Свободный вопрос пока не интерпретируется.</p>
      <button className="primary" disabled={busy}>{busy?'Расчёт…':'Сформировать анализ'}</button>
    </form>{error&&<p className="error" role="alert">{error}</p>}
    {result&&<div aria-live="polite"><h3>{result.answer}</h3><p>Период: {result.metrics.period.from_date||'начало истории'} — {result.metrics.period.to_date||'конец истории'}</p>
      <ul>{result.metrics.volumes.map((v,i)=><li key={i}>{v.work_type}: {v.quantity} {v.unit} · объект {v.site_id}</li>)}</ul>
      <h3>Исходные отчёты ({result.source_report_ids.length})</h3><div className="source-links">{result.source_report_ids.map((id,i)=><button className="quiet" key={id} onClick={()=>onSource(id)}>Отчёт {i+1}</button>)}</div>
      {result.limitations.map(x=><p className="muted" key={x}>{x}</p>)}
    </div>}
  </section>;
}
