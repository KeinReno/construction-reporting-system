import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDate } from './date';
import { CrSkeleton } from './ui/CrSkeleton';
import { http, equipmentOwnership, type Summary } from './api';
import './design/ai-workspace.css';

type Answer={
  answer:string;mode:string;intent:string;supported:boolean;
  period:Summary['period'];metrics:Summary|null;
  source_report_ids:string[];limitations:string[];
};
type Mode='auto'|'summary'|'work_volume'|'no_work'|'materials'|'incidents'|'finance'|'equipment'|'site_timeline';
type Turn={id:number;title:string;answer:Answer};
const modes:ReadonlyArray<{id:Mode;title:string;hint:string}>= [
  {id:'summary',title:'Общая сводка',hint:'Полученные отчёты и показатели'},
  {id:'work_volume',title:'Объёмы работ',hint:'Только указанные количества'},
  {id:'no_work',title:'Простои',hint:'Причины отсутствия работ'},
  {id:'incidents',title:'События',hint:'Заявленные проблемы и даты'},
  {id:'materials',title:'Материалы',hint:'Упоминания и учтённое движение'},
  {id:'finance',title:'Денежные операции',hint:'Раздельные расходы, поступления, авансы'},
  {id:'equipment',title:'Спецтехника',hint:'Заявленные часы'},
  {id:'site_timeline',title:'Хронология',hint:'Последние события по отчётам'},
  {id:'auto',title:'Вопрос по шаблонам',hint:'Только поддерживаемые формулировки'}
];
function heading(mode:Mode){return modes.find(item=>item.id===mode)?.title||'Анализ';}
function date(value:string|null){return value?formatDate(value):'без ограничения';}
function rub(value:number){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(value/100);}
const financeNames:Record<string,string>={expense:'Расходы',funding_received:'Поступления',advance_issued:'Выданные авансы'};

export function AnalysisPanel({token,siteId,authorId,fromDate,toDate,onSource,siteName}:{
  token:string;siteId:string;authorId:string;fromDate:string;toDate:string;
  onSource:(id:string)=>void;siteName:(id:string)=>string;
}){
  const [intent,setIntent]=useState<Mode>('summary');
  const [question,setQuestion]=useState('');
  const [turns,setTurns]=useState<Turn[]>([]);
  const [active,setActive]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const seq=useRef(0);
  const thread=useRef<HTMLDivElement|null>(null);
  useEffect(()=>()=>{seq.current++;},[]);
  const current=turns.find(t=>t.id===active)||turns[turns.length-1];
  async function ask(e?:FormEvent){
    e?.preventDefault();
    if(busy)return;
    const q=question.trim();
    if(intent==='auto'&&!q){setError('Введите вопрос для локального сценария.');return;}
    const request=++seq.current;
    setBusy(true);setError('');
    try{
      const answer=await http<Answer>('/analytics/ask',token,{
        method:'POST',body:JSON.stringify({
          intent,question:q||'Сформировать '+heading(intent).toLowerCase(),
          filters:{site_id:siteId==='all'?null:siteId,author_id:authorId==='all'?null:authorId,
            from_date:fromDate||null,to_date:toDate||null}
        })
      });
      if(request!==seq.current)return;
      const item={id:Date.now(),title:q||heading(intent),answer};
      setTurns(prev=>[...prev.slice(-9),item]);setActive(item.id);
      thread.current?.scrollIntoView({block:'nearest',behavior:'auto'});
    }catch(ex){
      if(request===seq.current)setError(ex instanceof Error?ex.message:'Не удалось получить анализ');
    }finally{if(request===seq.current)setBusy(false);}
  }
  const answer=current?.answer;
  const metrics=answer?.metrics;
  const sources=answer?.source_report_ids??[];
  return <section className="crs-ai" aria-label="Аналитический центр CRS">
    <div className="crs-ai-hero">
      <div>
        <span className="crs-ai-eyebrow">CRS / АНАЛИТИЧЕСКИЙ ЦЕНТР</span>
        <h2>Факты, выводы, источники</h2>
        <p>Изучайте ход работ, простои, материалы и деньги — с переходом к первичным отчётам.</p>
      </div>
      <div className="crs-ai-status" role="status">
        <span className="crs-ai-status-dot" aria-hidden="true"/>
        <strong>Локальная аналитика</strong>
        <small>GPT пока не подключён</small>
      </div>
    </div>
    <div className="crs-ai-layout">
      <aside className="crs-ai-commands" aria-label="Темы анализа">
        <div className="crs-ai-section-title"><span>01 / ЗАПРОС</span><strong>Что исследуем?</strong></div>
        <label className="crs-ai-select-wrap">Вид анализа
          <select value={intent} onChange={e=>{setIntent(e.target.value as Mode);setError('');}} disabled={busy}>
            {modes.map(mode=><option value={mode.id} key={mode.id}>{mode.title}</option>)}
          </select>
        </label>
        <div className="crs-ai-modes">
          {modes.map(mode=><button type="button" key={mode.id} className={intent===mode.id?'is-active':''}
            aria-pressed={intent===mode.id} disabled={busy} onClick={()=>{setIntent(mode.id);setError('');}}>
            <strong>{mode.title}</strong><span>{mode.hint}</span>
          </button>)}
        </div>
        <div className="crs-ai-scope">
          <span>ТЕКУЩАЯ ВЫБОРКА</span>
          <p><strong>Объект:</strong> {siteId==='all'?'Все доступные':siteName(siteId)}</p>
          <p><strong>Автор:</strong> {authorId==='all'?'Все доступные':'Выбранный автор'}</p>
          <p><strong>Период:</strong> {date(fromDate||null)} — {date(toDate||null)}</p>
          <small>Фильтры задаются в верхней части страницы. Ограничения доступа применяет сервер.</small>
        </div>
      </aside>
      <div className="crs-ai-body">
        <form className="crs-ai-prompt" onSubmit={ask}>
          <label htmlFor="crs-ai-question">{intent==='auto'?'Вопрос по доступным шаблонам':heading(intent)}</label>
          {intent==='auto' ? <textarea id="crs-ai-question" maxLength={1000} rows={3}
            aria-label="Вопрос (сохраняется только на экране)" placeholder="Например: какие простои повторяются?" value={question} onChange={e=>setQuestion(e.target.value)}/> :
            <p>Сервер выполнит расчёт по выбранной теме и покажет подтверждающие записи.</p>}
          <div className="crs-ai-prompt-actions">
            <span>{intent==='auto'?'Свободный диалог с GPT ещё не включён.':'Цифры рассчитываются сервером, не языковой моделью.'}</span>
            <button type="submit" disabled={busy||(intent==='auto'&&!question.trim())}>
              {busy?'Анализируем…':'Сформировать анализ'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
        {error&&<p className="crs-ai-error" role="alert">{error}</p>}
        <div className="crs-ai-results" ref={thread}>
          <div className="crs-ai-section-title"><span>02 / РЕЗУЛЬТАТ</span><strong>Аналитическая сводка</strong></div>
          {busy&&<CrSkeleton rows={3} label="Подготавливаем серверную сводку"/>}
          {!busy&&!answer&&<div className="crs-ai-empty">
            <div className="crs-ai-empty-mark" aria-hidden="true">◫</div>
            <h3>Выберите аналитический сценарий</h3>
            <p>Показатели берутся из зарегистрированных отчётов. Неизвестные данные не превращаются в нулевые значения.</p>
            <div className="crs-ai-empty-badges"><span>Объёмы</span><span>События</span><span>Финансы</span><span>Источники</span></div>
          </div>}
          {!busy&&answer&&<article className="crs-ai-answer" aria-label="Результат анализа" aria-live="polite">
            <div className="crs-ai-answer-head">
              <div><span className="crs-ai-eyebrow">{answer.supported?'ПОДТВЕРЖДАЕМАЯ СВОДКА':'НЕТ ПОДДЕРЖИВАЕМОГО СЦЕНАРИЯ'}</span>
                <h3>{current?.title||'Результат'}</h3></div>
              <span className="crs-ai-count">{sources.length} источн.</span>
            </div>
            <h4 className="crs-ai-answer-text">{answer.answer}</h4>
            <p className="crs-ai-period">Период: {date(answer.period.from_date)} — {date(answer.period.to_date)}</p>
            {metrics&&<div className="crs-ai-evidence">
              <div className="crs-ai-kpis">
                <div><span>Отчётов</span><strong>{metrics.report_count}</strong><small>В учтённой выборке</small></div>
                <div><span>Без работ</span><strong>{metrics.no_work_count}</strong><small>Явно заявлено</small></div>
                <div><span>Событий</span><strong>{metrics.incident_count}</strong><small>По заполненным записям</small></div>
              </div>
              {answer.intent==='work_volume'&&<section><h4>Количественные объёмы</h4>
                {metrics.volumes.length?<ul className="crs-ai-fact-list">{metrics.volumes.map((v,i)=><li key={i}>
                  <span>{v.work_type}<small>{siteName(v.site_id)} · {v.unit}</small></span><strong>{v.quantity} {v.unit}</strong>
                </li>)}</ul>:<p className="crs-ai-muted">Проверенных количественных объёмов нет. Это не подтверждённый ноль.</p>}
              </section>}
              {answer.intent==='no_work'&&<section><h4>Причины отсутствия работ</h4>
                {metrics.no_work_reasons.length?<ul className="crs-ai-fact-list">{metrics.no_work_reasons.map((row,i)=><li key={i}><span>{row.reason}</span><strong>{row.report_count} отч.</strong></li>)}</ul>:<p className="crs-ai-muted">Причины не зарегистрированы.</p>}</section>}
              {answer.intent==='finance'&&<section><h4>Деньги — раздельно</h4><ul className="crs-ai-fact-list">
                {Object.entries(metrics.financial_totals_kopecks).map(([kind,sum])=><li key={kind}><span>{financeNames[kind]||kind}</span><strong>{rub(sum||0)}</strong></li>)}
              </ul><p className="crs-ai-muted">Остаток не рассчитывается без начального баланса.</p></section>}
              {answer.intent==='materials'&&<section><h4>Учтённые движения материалов</h4>
                {metrics.material_movements.length?<ul className="crs-ai-fact-list">{metrics.material_movements.map((row,i)=><li key={i}><span>{row.name}<small>{row.direction==='received'?'Поступило':'Израсходовано'}</small></span><strong>{row.quantity} {row.unit}</strong></li>)}</ul>:<p className="crs-ai-muted">Движений не учтено. Упоминания материалов сами по себе не означают расход.</p>}
              <h4 className="crs-ai-secondary-heading">Первичные записи материалов</h4>
                <ul className="crs-ai-fact-list">{metrics.materials.map((item,i)=><li key={i}>
                  <button type="button" onClick={()=>onSource(item.report_id)}>
                    {(item.direction==='received'?'Поступило':item.direction==='consumed'?'Израсходовано':'Упомянуто')+': '+item.name+
                      (item.quantity!==null?' · '+item.quantity+' '+(item.unit||''):item.unit?' · '+item.unit:'')} ↗
                  </button>
                </li>)}</ul>
              </section>}
              {answer.intent==='incidents'&&<section><h4>Заявленные события</h4>
                {metrics.incidents.length?<ul className="crs-ai-fact-list">{metrics.incidents.slice(0,20).map((item,i)=><li key={i}>
                  <button type="button" onClick={()=>onSource(item.report_id)}>{formatDate(item.date)} · {item.description} ↗</button>
                </li>)}</ul>:<p className="crs-ai-muted">События не указаны; это не доказательство их отсутствия.</p>}</section>}
              {answer.intent==='equipment'&&<section><h4>Часы техники</h4>
                {metrics.equipment_hours.length?<ul className="crs-ai-fact-list">{metrics.equipment_hours.map((row,i)=><li key={i}><span>{row.type}<small>{equipmentOwnership(row.hired)}</small></span><strong>{row.hours} ч</strong></li>)}</ul>:<p className="crs-ai-muted">Часы техники не указаны.</p>}</section>}
              {answer.intent==='site_timeline'&&<section><h4>Хронология</h4>
                <ul className="crs-ai-fact-list">{metrics.timeline.slice(-30).reverse().map(row=><li key={row.report_id}>
                  <button type="button" onClick={()=>onSource(row.report_id)}>{formatDate(row.date)} · {row.work_state==='not_stated'?'Работы не описаны':row.work_state==='no_work'?'Работ не было':'Заявлены работы'} ↗</button>
                </li>)}</ul>
              </section>}
            </div>}
            <section className="crs-ai-source-panel" aria-label="Подтверждающие отчёты"><h4>Первичные источники <span>{sources.length}</span></h4>
              {sources.length ? <div className="crs-ai-sources">
                {sources.slice(0,24).map((id,i)=><button type="button" key={id} onClick={()=>onSource(id)} title={'ID: '+id}>Отчёт {i+1}<span aria-hidden="true">↗</span></button>)}
                {sources.length>24&&<small>Показаны первые 24 источника из {sources.length}. Для полной выборки откройте журнал.</small>}
              </div>:<p className="crs-ai-muted">Подтверждающих отчётов для этого запроса нет.</p>}
            </section>
            {!!answer.limitations.length&&<details className="crs-ai-limits"><summary>Ограничения и достоверность</summary>
              <ul>{answer.limitations.map((message,i)=><li key={i}>{message}</li>)}</ul></details>}
          </article>}
          {turns.length>1&&<div className="crs-ai-history" aria-label="История текущей сессии"><h4>Последние запросы</h4>
            <div>{[...turns].reverse().map(t=><button type="button" key={t.id} aria-pressed={t.id===current?.id} onClick={()=>setActive(t.id)}>{t.title}</button>)}</div>
            <small>История находится только в памяти открытой страницы и очищается при её закрытии.</small>
          </div>}
        </div>
      </div>
    </div>
  </section>;
}
