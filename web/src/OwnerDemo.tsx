import {useEffect, useMemo, useState} from 'react';
import {BASE, type Report, type Site} from './api';
import {formatDate} from './date';
import {ArchiveReviewItem,isArchiveReviewResolved,useArchiveReviews} from './ArchiveReconciliation';

export type OwnerPhoto={id:string;relation:'same_message'|'same_work_date';message_date:string;message_id:string};
export type OwnerContext={historical:boolean;source:string;reports:Record<string,{source_message_id:string;other_site_mentioned:boolean;photos:OwnerPhoto[]}>};

export function ArchivePhoto({photo,token}:{photo:OwnerPhoto;token:string}){
  const [url,setUrl]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;let objectUrl='';
    void fetch(`${BASE}/owner-demo/photos/${encodeURIComponent(photo.id)}`,{headers:{Authorization:`Bearer ${token}`}})
      .then(async response=>{if(!response.ok)throw new Error('Фото недоступно');objectUrl=URL.createObjectURL(await response.blob());if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);})
      .catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[photo.id,token]);
  return <a className="owner-photo" href={url||undefined} target="_blank" rel="noreferrer" aria-label={`Открыть фото из MAX за ${formatDate(photo.message_date)}`}>
    {url?<img src={url} alt={`Фото из MAX за ${formatDate(photo.message_date)}`}/>:<span>{failed?'Фото недоступно':'Загрузка фото…'}</span>}
    <small>{formatDate(photo.message_date)} · {photo.relation==='same_message'?'в сообщении с отчётом':'в чате за дату'}</small>
  </a>;
}

function ReportPreviewPhoto({photo,token,count}:{photo?:OwnerPhoto;token:string;count:number}){
  const [url,setUrl]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{if(!photo)return;let active=true;let objectUrl='';
    void fetch(`${BASE}/owner-demo/photos/${encodeURIComponent(photo.id)}`,{headers:{Authorization:`Bearer ${token}`}})
      .then(async response=>{if(!response.ok)throw new Error('Фото недоступно');objectUrl=URL.createObjectURL(await response.blob());if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);})
      .catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[photo?.id,token]);
  return <span className={`owner-report-preview-image${url?' has-image':''}`} aria-hidden="true">
    {url?<img src={url} alt=""/>:<span>{photo?(failed?'Фото недоступно':'Загрузка фото…'):'Фото в сообщении нет'}</span>}
    {count>1&&<small>+{count-1} фото</small>}
  </span>;
}

function groupWork(text:string):string|null{
  const value=text.toLocaleLowerCase('ru-RU');
  if(/допуск на площад|^дождь$/.test(value))return null;
  if(/блок|фундамент|кирпич|щеб|основани|трамбовк/.test(value))return 'Основание и блоки';
  if(/сетк|арматур|армопояс/.test(value))return 'Сетка и арматура';
  if(/свар|металлоконструкц|швеллер|трос/.test(value))return 'Металлоконструкции и сварка';
  if(/бетон|заливк|опалубк/.test(value))return 'Бетон и опалубка';
  if(/провод|изолятор|110кв|35 кв/.test(value))return 'Электромонтаж';
  if(/покраск|краск/.test(value))return 'Покраска';
  return 'Прочие описанные работы';
}
function recordNoun(count:number){return count%10===1&&count%100!==11?'запись':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'записи':'записей';}

export function OwnerDemo({mode,reports,sites,selectedSiteId,context,token,onOpen,onJournal,onReconciliation}:{mode:'overview'|'objects'|'analytics';reports:Report[];sites:Site[];selectedSiteId:string;context:OwnerContext|null;token:string;onOpen:(report:Report)=>void;onJournal:()=>void;onReconciliation:()=>void}){
  const reviews=useArchiveReviews(token);
  const [showFullTimeline,setShowFullTimeline]=useState(false);
  useEffect(()=>setShowFullTimeline(false),[selectedSiteId,reports]);
  const main=useMemo(()=>reports.filter(report=>!context?.reports[report.client_report_id]?.other_site_mentioned).sort((a,b)=>b.data.work_date.localeCompare(a.data.work_date)),[reports,context]);
  const uncertain=useMemo(()=>reports.filter(report=>context?.reports[report.client_report_id]?.other_site_mentioned).sort((a,b)=>b.data.work_date.localeCompare(a.data.work_date)),[reports,context]);
  const needsReconciliation=uncertain.filter(report=>!isArchiveReviewResolved(reviews.history[report.client_report_id]));
  const pendingTotal=Object.entries(context?.reports||{}).filter(([id,item])=>item.other_site_mentioned&&!isArchiveReviewResolved(reviews.history[id])).length;
  const selectedSite=sites.find(site=>site.id===selectedSiteId);
  const showingUncertain=!!selectedSite?.name.startsWith('Объект требует сверки');
  const focus=showingUncertain?uncertain:main;
  const latest=focus[0];
  const latestWithPhotos=focus.find(report=>(context?.reports[report.client_report_id]?.photos.length||0)>0);
  const reportsWithDirectPhotos=focus.filter(report=>context?.reports[report.client_report_id]?.photos.some(photo=>photo.relation==='same_message'));
  const previewReports=[...new Map([...focus.slice(0,1),...reportsWithDirectPhotos,...focus].map(report=>[report.id,report] as const)).values()].slice(0,3);
  const workGroups=useMemo(()=>{
    const groups=new Map<string,Set<string>>();
    for(const report of focus)for(const work of report.data.work_entries){const label=groupWork(work.type);if(label){if(!groups.has(label))groups.set(label,new Set());groups.get(label)!.add(report.id);}}
    return [...groups].map(([name,ids])=>({name,ids:[...ids]})).sort((a,b)=>b.ids.length-a.ids.length);
  },[focus]);
  const featuredPhotos=useMemo(()=>{
    const photos=new Map<string,OwnerPhoto>();
    for(const report of focus)for(const photo of context?.reports[report.client_report_id]?.photos||[]){
      if(!photos.has(photo.id)||photo.relation==='same_message')photos.set(photo.id,photo);
    }
    return [...photos.values()].sort((a,b)=>Number(b.relation==='same_message')-Number(a.relation==='same_message')||b.message_date.localeCompare(a.message_date)).slice(0,6);
  },[focus,context]);
  const noWork=focus.filter(report=>report.data.kind==='no_work');
  const dates=focus.map(report=>report.data.work_date).sort();
  const period=dates.length?`${formatDate(dates[0])} — ${formatDate(dates[dates.length-1])}`:'Нет записей в выбранном периоде';
  const mainName=showingUncertain?'Объект не уточнён':sites.find(site=>site.name.startsWith('ПС Факел'))?.name||'ПС Факел';
  const months=useMemo(()=>{
    const grouped=new Map<string,Report[]>();
    for(const report of focus){const key=report.data.work_date.slice(0,7);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key)!.push(report);}
    return [...grouped].map(([key,items])=>({key,label:new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${key}-01T12:00:00Z`)),items}));
  },[focus]);
  const directPhotoReports=focus.filter(report=>context?.reports[report.client_report_id]?.photos.some(photo=>photo.relation==='same_message')).length;
  const incidentReports=focus.filter(report=>!!report.data.incidents?.length).length;
  const planKeys=new Set<string>();
  const plannedSteps=focus.flatMap(report=>(report.data.next_shift_plans||[]).filter(text=>!/^выходн(?:ой|ые|ые дни|ой день)\.?$/i.test(text.trim())).map(text=>({report,text}))).filter(item=>{const key=item.text.trim().toLocaleLowerCase('ru-RU');if(planKeys.has(key))return false;planKeys.add(key);return true;}).slice(0,5);
  const notedEvents=focus.flatMap(report=>(report.data.incidents||[]).map(event=>({report,text:event.description}))).slice(0,5);
  return <div className={`owner-demo ${mode}`}>
    <div className="owner-context-line"><strong>История из MAX</strong><span>{period}</span><span>Это архивные записи, не текущая очередь отчётности</span></div>
    {mode==='objects'&&<>
      <section className={`owner-object-intro${showingUncertain?' owner-object-intro-uncertain':''}`} aria-label="История объекта">
        <div><p className="owner-hero-label">{showingUncertain?'Записи для сверки':'Объект · архив MAX'}</p><h2>{mainName.replace(' · по истории чата','')}</h2><p>{showingUncertain?'В сообщениях упомянут ПС Пущино; принадлежность работ не подтверждена.':'Последняя рабочая дата в архиве — '+(latest?formatDate(latest.data.work_date):'нет записей')+'. Это история сообщений, не оценка текущей готовности.'}</p>{showingUncertain&&<a className="owner-review-jump" href="#owner-reconciliation">Перейти к сверке записей ↓</a>}</div>
        <div className="owner-object-facts"><span><strong>{focus.length}</strong> {recordNoun(focus.length)}</span><span><strong>{new Set(dates).size}</strong> рабочих дат</span><span><strong>{directPhotoReports}</strong> с фото в сообщении</span></div>
      </section>
      {!showingUncertain&&<section className="owner-object-priorities" aria-label="Главное по объекту">
        <div><span>Последняя запись</span><strong>{latest?formatDate(latest.data.work_date):'Нет записей'}</strong><p>{latest?.data.work_entries.slice(0,2).map(work=>work.type).join('; ')||latest?.data.no_work_reason||'По выбранному периоду данных нет.'}</p>{latest&&<button className="link-button" onClick={()=>onOpen(latest)}>Открыть первичку →</button>}</div>
        <div><span>Требует решения · весь архив</span><strong>{reviews.state==='ready'?`${pendingTotal} ${recordNoun(pendingTotal)}`:'—'}</strong><p>Принадлежность работ нужно подтвердить по исходным сообщениям.</p><button className="link-button" onClick={onReconciliation}>Перейти к сверке →</button></div>
        <div><span>Отмеченное событие</span><strong>{notedEvents[0]?formatDate(notedEvents[0].report.data.work_date):'Нет в выборке'}</strong><p>{notedEvents[0]?.text||'События отдельно не описаны.'}</p>{notedEvents[0]&&<button className="link-button" onClick={()=>onOpen(notedEvents[0].report)}>Открыть запись →</button>}</div>
      </section>}
      {showingUncertain&&<section id="owner-reconciliation" className="owner-panel owner-review-panel"><div className="owner-section-heading"><div><h2>Сверка принадлежности записей</h2><p className="owner-explain">Решение сохраняется отдельно от отчёта. Предыдущие решения и исходное сообщение остаются доступны.</p></div><span>{reviews.state==='ready'?`${needsReconciliation.length} без окончательного решения`:'Загрузка журнала…'}</span></div>
        {reviews.state==='loading'&&<p className="muted">Загрузка журнала сверки…</p>}
        {reviews.state==='error'&&<p className="error" role="alert">Не удалось загрузить журнал сверки. Обновите страницу и повторите.</p>}
        {reviews.state==='ready'&&<div className="owner-review-list">{uncertain.map(report=><ArchiveReviewItem key={report.id} report={report} sourceMessageId={context?.reports[report.client_report_id]?.source_message_id||''} history={reviews.history[report.client_report_id]||[]} token={token} onOpen={()=>onOpen(report)} onSaved={reviews.append} onReload={reviews.reload}/>)}</div>}
        {reviews.state==='ready'&&!uncertain.length&&<p className="empty">В выбранном периоде спорных записей нет. Измените фильтр периода, чтобы увидеть остальные.</p>}
      </section>}
      <div className="owner-object-layout">
        <section className="owner-panel owner-object-history"><div className="owner-section-heading"><h2>Хронология работ</h2><button className="link-button" onClick={onJournal}>Весь журнал →</button></div>
          <p className="owner-explain">Сначала последние записи. Откройте строку для исходного сообщения; фото отмечены только там, где они найдены.</p>
          {months.slice(0,showFullTimeline?undefined:1).map((month,index)=><details className="owner-month" key={month.key} open={index===0?true:undefined}><summary><span>{month.label}</span><strong>{month.items.length} {recordNoun(month.items.length)}</strong></summary><div className="owner-month-records">{month.items.slice(0,showFullTimeline?undefined:6).map(report=>{const photos=context?.reports[report.client_report_id]?.photos||[];return <button className="owner-history-record" key={report.id} onClick={()=>onOpen(report)}><time>{formatDate(report.data.work_date)}</time><span>{report.data.kind==='no_work'?`Без работ: ${report.data.no_work_reason||'причина не указана'}`:report.data.work_entries.filter(work=>groupWork(work.type)).slice(0,2).map(work=>work.type).join('; ')||'Описание требует разбора'}</span><small>{photos.some(photo=>photo.relation==='same_message')?'Фото в сообщении':photos.length?'Фото по дате':''}</small></button>})}</div></details>)}
          {focus.length>6&&<button className="owner-timeline-more" onClick={()=>setShowFullTimeline(value=>!value)} aria-expanded={showFullTimeline}>{showFullTimeline?'Свернуть историю':`Показать всю историю · ${focus.length} ${recordNoun(focus.length)}`}</button>}
          {!months.length&&<p className="empty">По выбранным условиям архивных записей нет.</p>}
        </section>
        <aside className="owner-object-aside">
          <section className="owner-panel"><h2>Планы из переписки</h2><p className="owner-explain">Намерения на следующую смену, указанные в архиве. Их выполнение здесь не подтверждено.</p>{plannedSteps.length?<div className="owner-object-followups">{plannedSteps.map(({report,text},index)=><button key={`${report.id}-${index}`} onClick={()=>onOpen(report)}><time>{formatDate(report.data.work_date)}</time><span>{text}</span><span aria-hidden="true">↗</span></button>)}</div>:<p className="empty">В выбранных записях планы не указаны.</p>}</section>
          <section className="owner-panel"><h2>Фото из переписки</h2><p className="owner-explain">Сначала показаны фото из тех же сообщений, что и отчёты. Совпадение только по чату и дате не доказывает связь снимка с работой.</p>{featuredPhotos.length?<div className="owner-object-photos">{featuredPhotos.slice(0,4).map(photo=><div className="owner-object-photo-card" key={photo.id}><ArchivePhoto photo={photo} token={token}/><a href={`/archive/?message=${encodeURIComponent(photo.message_id)}`} target="_blank" rel="noreferrer">Сообщение с фото ↗</a></div>)}</div>:<p className="empty">Фото за рабочие даты не найдены.</p>}</section>
        </aside>
      </div>
    </>}
    {mode==='overview'&&<section className="owner-hero" aria-label="Состояние объекта">
      <div><p className="owner-hero-label">{showingUncertain?'Записи на сверку принадлежности':'Объект по истории чата'}</p><h2>{mainName.replace(' · по истории чата','')}</h2><p className="owner-hero-copy">{showingUncertain?'В сообщениях упомянут ПС Пущино. Принадлежность работ нужно подтвердить по первичным данным. ':''}{latest?<>Последняя рабочая дата — <b>{formatDate(latest.data.work_date)}</b>. {latest.data.work_entries.filter(work=>groupWork(work.type)).slice(0,3).map(work=>work.type).join('; ')||'Работы не перечислены'}.</>:'По выбранным условиям отчётов нет.'}</p>
        <div className="owner-hero-actions">{latest&&<button className="primary" onClick={()=>onOpen(latest)}>Открыть последний отчёт</button>}{latestWithPhotos&&<button className="secondary" onClick={()=>onOpen(latestWithPhotos)}>День с фото · {formatDate(latestWithPhotos.data.work_date)}</button>}</div></div>
      <div className="owner-hero-facts"><div><strong>{focus.length}</strong><span>{showingUncertain?'с неуточнённым объектом':'записей в архиве объекта'}</span></div><div><strong>{noWork.length}</strong><span>без работ</span></div>{!showingUncertain&&<div><strong>{reviews.state==='ready'?pendingTotal:'—'}</strong><span>на сверку во всём архиве</span></div>}</div>
    </section>}
    {mode==='overview'&&<section className="owner-panel owner-report-previews"><div className="owner-section-heading"><div><h2>Отчёты из переписки</h2><p className="owner-explain">{reportsWithDirectPhotos.length?'Последняя запись и архивные отчёты с фото из того же сообщения MAX.':'Последние архивные записи по рабочей дате.'}</p></div><button className="link-button" onClick={onJournal}>Весь журнал →</button></div>
      {previewReports.length?<div className="owner-report-preview-grid">{previewReports.map(report=>{const directPhotos=(context?.reports[report.client_report_id]?.photos||[]).filter(photo=>photo.relation==='same_message');const summary=report.data.kind==='no_work'?`Без работ: ${report.data.no_work_reason||'причина не указана'}`:report.data.work_entries.filter(work=>groupWork(work.type)).slice(0,2).map(work=>work.type).join('; ')||'Описание работы требует разбора';return <button className="owner-report-preview" key={report.id} onClick={()=>onOpen(report)} aria-label={`Открыть отчёт за ${formatDate(report.data.work_date)}. ${summary}`}>
        <ReportPreviewPhoto photo={directPhotos[0]} token={token} count={directPhotos.length}/><span className="owner-report-preview-content"><span className="owner-report-preview-meta"><time>{formatDate(report.data.work_date)}</time><span>Архив MAX</span></span><strong>{mainName.replace(' · по истории чата','')}</strong><span className="owner-report-preview-summary">{summary}</span><span className="owner-report-preview-footer">{directPhotos.length?`${directPhotos.length} фото в том же сообщении`:'Фото в сообщении нет'} <span aria-hidden="true">↗</span></span></span>
      </button>})}</div>:<p className="empty">Записей по выбранным условиям нет.</p>}
    </section>}
    {mode==='overview'&&!showingUncertain&&<section className="owner-panel owner-attention-panel"><div className="owner-section-heading"><h2>Что требует внимания</h2><button className="link-button" onClick={onReconciliation}>К сверке записей →</button></div>
      <p className="owner-explain">В этих сообщениях упомянут ПС Пущино. Принадлежность работ нужно подтвердить по первичке.</p>
      {uncertain.length?uncertain.map(report=><button className="owner-attention-item" key={report.id} onClick={()=>onOpen(report)}><span><b>{formatDate(report.data.work_date)}</b><small>{report.data.work_entries.slice(0,2).map(work=>work.type).join('; ')||'Работы не перечислены'}</small></span><span>{reviews.state==='ready'&&isArchiveReviewResolved(reviews.history[report.client_report_id])?'Решение записано':'↗'}</span></button>):<p className="empty">В текущем фильтре спорных записей нет. Откройте сверку, чтобы увидеть весь архив.</p>}
    </section>}
    {mode==='analytics'&&<section className="owner-analysis-lead" aria-label="Покрытие архива"><div className="owner-analysis-heading"><h2>Что подтверждается записями</h2><p>Число сообщений и связей с источниками за выбранный период. Это не объём выполненных работ.</p></div><div className="owner-analysis-metrics"><div><strong>{focus.length}</strong><span>записей с рабочей датой</span></div><div><strong>{directPhotoReports}</strong><span>с фото в том же сообщении</span></div><div><strong>{incidentReports}</strong><span>с отдельно отмеченным событием</span></div></div><div className="owner-analysis-months"><h3>Записи по рабочим месяцам</h3>{months.map(month=><div key={month.key}><span>{month.label}</span><meter min={0} max={Math.max(...months.map(item=>item.items.length),1)} value={month.items.length}/><b>{month.items.length}</b></div>)}{!months.length&&<p>В выбранном периоде записей нет.</p>}</div></section>}
    {mode==='analytics'&&<section className="owner-panel owner-photo-panel"><div className="owner-section-heading"><h2>Изображения и сканы из переписки</h2><span>По тому же чату и рабочей дате</span></div>
      <p className="owner-explain">Совпадение по дате не подтверждает, что снимок относится к конкретной работе. Откройте исходное сообщение для проверки.</p>
      {featuredPhotos.length?<div className="owner-photo-grid">{featuredPhotos.map(photo=><ArchivePhoto key={photo.id} photo={photo} token={token}/>)}</div>:<p className="empty">Для выбранных отчётов фото за рабочую дату не найдены.</p>}
    </section>}
    {mode==='analytics'&&<section className="owner-panel owner-work-panel"><div className="owner-section-heading"><h2>Какие работы описаны</h2><span>Предварительная группировка текста</span></div>
      <p className="owner-explain">Счётчик означает число отчётов с упоминанием, не выполненный объём. Время допуска на площадку исключено из видов работ.</p>
      <div className="owner-work-grid">{workGroups.map(group=><details key={group.name} className="owner-work-group"><summary><span>{group.name}</span><strong>{group.ids.length} отч.</strong></summary><div>{group.ids.slice(0,12).map(id=>{const report=focus.find(item=>item.id===id)!;return <button key={id} className="quiet" onClick={()=>onOpen(report)}>{formatDate(report.data.work_date)}</button>;})}{group.ids.length>12&&<small>Показаны первые 12 из {group.ids.length}</small>}</div></details>)}</div>
      {!workGroups.length&&<p className="empty">Работ по выбранным условиям нет.</p>}
    </section>}
    {mode==='analytics'&&<section className="owner-panel owner-data-limit"><h2>Что пока нельзя посчитать</h2><p>Суммы расходов, часы техники и физические объёмы оставлены в исходных сообщениях до сверки единиц, документов и принадлежности объекту. Здесь нет выдуманного баланса или процента готовности.</p></section>}
  </div>;
}
