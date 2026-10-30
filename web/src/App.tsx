import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatDate, parseDisplayDate } from './date';
import { AdminPanel } from './AdminPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { ReportDetails } from './ReportDetails';
import { OwnerDemo, type OwnerContext } from './OwnerDemo';
import { OwnerJournal } from './OwnerJournal';
import { http, login, ApiError, filterQuery, allReports, reportStatusLabels, type Profile, type Report, type ReportAuthor, type Site, type Summary } from './api';
import { SiteCard } from './SiteCard';
import { MoneyPage } from './MoneyPage';

type DemoInfo = {notice:string;accounts:Record<string,string>;password:string};
type Page = 'overview' | 'objects' | 'reports' | 'money' | 'analytics' | 'ai' | 'admin';
type Interval = 'day' | 'month' | 'year';
const labels: Record<Page, string> = {
  overview: 'Главная', objects: 'Объекты', reports: 'Отчёты', money: 'Деньги', analytics: 'Аналитика', ai: 'ИИ-аналитик', admin:'Управление'
};
const dateText = formatDate;
const moneyLabels = {funding_received:'Поступление',expense:'Расход',advance_issued:'Выдача аванса'} as const;
function DateFilter({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const errorId=useId();
  const invalid=value.startsWith('!');
  const display=invalid?value.slice(1):formatDate(value);
  return <label>{label}<input type="text" inputMode="numeric" placeholder="дд/мм/гггг" aria-label={label} aria-describedby={invalid?errorId:undefined} aria-invalid={invalid} value={display}
    onChange={e=>{const text=e.target.value;onChange(!text?'':parseDisplayDate(text) ?? '!'+text);}}/>
    {invalid&&<small id={errorId} className="date-error">Введите дату дд/мм/гггг</small>}</label>;
}

function NavIcon({page}:{page:Page}) {
  const paths:Record<Page,React.ReactNode> = {
    overview:<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    objects:<><path d="M3 21h18M5 21V7l7-4 7 4v14M9 11h2m3 0h2m-7 4h2m3 0h2"/></>,
    reports:<><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6"/></>,
    money:<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M12 14h.01"/></>,
    analytics:<><path d="M4 20V11m5 9V5m5 15v-7m5 7V3M2 21h20"/></>,
    ai:<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></>,
    admin:<><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/></>
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[page]}</svg>;
}

function Login({ onSuccess,demo }: { onSuccess: (token: string) => void;demo:DemoInfo|null }) {
  const [loginName, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { onSuccess(await login(loginName, password)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-card">
    <div className="brand brand-dark"><span className="brand-mark">▣</span> СтройКонтроль</div>
    <h1>Вход в систему</h1><p>Отчётность строительных объектов</p>
    {demo&&<section><strong>Локальная демо-версия</strong><p>{demo.notice}</p><div className="review-actions">{[['manager','Руководитель'],['admin','Администратор']].map(([role,label])=><button type="button" className="secondary" disabled={busy} key={role} onClick={()=>{setBusy(true);setError('');void login(demo.accounts[role],demo.password).then(onSuccess).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Открыть демо: {label}</button>)}</div></section>}
    <form onSubmit={submit}><label>Логин<input required autoComplete="username" value={loginName} onChange={e => setLogin(e.target.value)} /></label>
      <label>Пароль<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary full" disabled={busy}>{busy ? 'Подключение…' : 'Войти'}</button>
    </form></div></main>;
}

export default function App() {
  const [demo,setDemo]=useState<DemoInfo|null>(null);
  const [ownerArchive,setOwnerArchive]=useState('');
  const [ownerContext,setOwnerContext]=useState<OwnerContext|null>(null);
  useEffect(()=>{let active=true;void fetch('/demo-info').then(r=>r.ok?r.json():null).then(d=>{if(active)setDemo(d);}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{let active=true;void fetch('/owner-demo-info').then(r=>r.ok?r.json():null).then(d=>{if(active&&d?.archive_path==='/archive/')setOwnerArchive(d.archive_path);}).catch(()=>{});return()=>{active=false;};},[]);
  const [token, setToken] = useState<string | null>(null); // memory only; logout on page close
  useEffect(()=>{if(!token||!ownerArchive)return;let active=true;void http<OwnerContext>('/owner-demo/context',token).then(value=>{if(active)setOwnerContext(value);}).catch(()=>{if(active)setOwnerContext(null);});return()=>{active=false;};},[token,ownerArchive]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [authors, setAuthors] = useState<ReportAuthor[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [siteId, setSiteId] = useState('all');
  const [authorId, setAuthorId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interval,setInterval]=useState<Interval>('day');
  const [selected, setSelected] = useState<Report | null>(null);
  const [drill, setDrill] = useState<{title:string; ids:string[]} | null>(null);
  const reportOpener=useRef<HTMLElement|null>(null);
  const openReport=(report:Report)=>{reportOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSelected(report);};
  const openById=(id:string)=>{const local=reports.find(r=>r.id===id);if(local||!token){if(local)openReport(local);return;}const epoch=generation.current;void http<Report>('/reports/'+id,token).then(r=>{if(epoch===generation.current)openReport(r);}).catch(e=>{if(epoch===generation.current)setError(e instanceof Error?e.message:'Не удалось открыть отчёт');});};
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadedScope,setLoadedScope]=useState('');
  const filterKey=JSON.stringify([siteId,authorId,startDate,endDate]);
  const generation=useRef(0);
  const endSession=useCallback(()=>{generation.current++;setToken(null);setOwnerContext(null);setProfile(null);setSites([]);setAuthors([]);setReports([]);setSummary(null);setLoadedScope('');setSelected(null);setPage('overview');setSiteId('all');setAuthorId('all');setStartDate('');setEndDate('');setLoading(false);},[]);
  const refresh = useCallback(async () => {
    if (!token) return;
    const requestGeneration=++generation.current;
    setLoading(true); setError('');setSummary(null);
    try {
      if(startDate.startsWith('!') || endDate.startsWith('!'))throw new Error('Введите корректную дату в формате дд/мм/гггг');
      if(startDate && endDate && startDate>endDate)throw new Error('Начало периода позже окончания');
      const query=filterQuery(siteId,startDate,endDate,authorId);
      const [u, s, people, r, a] = await Promise.all([
        http<Profile>('/me', token), http<Site[]>('/sites', token),
        http<ReportAuthor[]>('/reports/authors',token),allReports(token, query), http<Summary>('/analytics/summary'+query, token)
      ]);
      if(requestGeneration!==generation.current)return;
      if(authorId!=='all' && !people.some(person=>person.id===authorId)) {
        setProfile(u);setSites(s);setAuthors(people);setReports([]);setSummary(null);setLoadedScope('');setAuthorId('all');return;
      }
      setProfile(u); setSites(s);setAuthors(people); setReports(r); setSummary(a);setLoadedScope(filterKey);
    } catch (e) {
      if(requestGeneration!==generation.current)return;
      const reason = e instanceof Error ? e.message : 'Ошибка загрузки';
      setError(reason);
      if (e instanceof ApiError && e.status===401) {endSession();}
    } finally { if(requestGeneration===generation.current)setLoading(false); }
  }, [token,siteId,authorId,startDate,endDate,filterKey,endSession]);
  useEffect(() => { void refresh(); return ()=>{generation.current++;}; }, [refresh]);
  const siteName = (id: string) => {const name=sites.find(s => s.id === id)?.name;if(ownerArchive&&name?.startsWith('Объект требует сверки'))return 'Объект не уточнён';if(ownerArchive&&name?.startsWith('ПС Факел'))return 'ПС Факел';return name ?? 'Неизвестный объект';};
  const displayAuthor = (login:string|null|undefined) => {
    if (!login) return 'Не указан';
    if(ownerArchive&&login==='owner')return 'Владелец';
    if(ownerArchive&&login==='max-import')return 'История MAX';
    if (demo) {
      if (login===demo.accounts.manager) return 'Руководитель (демо)';
      if (login===demo.accounts.foreman) return 'Бригадир (демо)';
      if (login===demo.accounts.admin) return 'Администратор (демо)';
    }
    return login;
  };
  const dataCurrent=loadedScope===filterKey && !loading && !error;
  const currentSummary=dataCurrent?summary:null;
  const visible = useMemo(() => dataCurrent?reports.filter(r => (siteId === 'all' || r.site_id === siteId)
    && (authorId === 'all' || r.author_id === authorId)
    && (!startDate || r.data.work_date >= startDate) && (!endDate || r.data.work_date <= endDate)):[],
    [reports, siteId, authorId, startDate, endDate,dataCurrent]);
  // A returned report was still received; a draft without a receipt was not.
  const received = visible.filter(r => !!r.receipt_id && ['submitted','reviewed','needs_revision'].includes(r.status));
  const needsReview = visible.filter(r => r.status === 'submitted').length;
  const overviewReports = [...visible].sort((a,b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'));
  const latestReport = (id:string) => visible.filter(r => r.site_id === id).sort((a,b) => b.data.work_date.localeCompare(a.data.work_date) || b.revision - a.revision)[0];
  const briefResult = (report:Report) => report.data.kind === 'no_work' ? (report.data.no_work_reason || 'Работ не было') : (report.data.work_entries[0] ? `${report.data.work_entries[0].type}${report.data.work_entries.length > 1 ? ` и ещё ${report.data.work_entries.length - 1}` : ''}` : 'Работы не указаны');
  const attentionReports = visible.filter(r => r.status === 'submitted' || r.status === 'needs_revision').sort((a,b) => b.data.work_date.localeCompare(a.data.work_date));
  const statedProblems = sites.filter(s => siteId === 'all' || s.id === siteId).flatMap(site => {
    const report = latestReport(site.id);
    const incident = report?.data.incidents?.[0];
    return report && incident ? [{site, report, incident}] : [];
  });
  const expenseKopecks = currentSummary?.financial_totals_kopecks.expense;
  const volumes = (currentSummary?.volumes ?? []).filter(v => siteId === 'all' || v.site_id === siteId);
  const reportPeriods=useMemo(()=>{
    const buckets=new Map<string,{count:number;ids:string[]}>();
    for(const day of currentSummary?.daily ?? []) {
      const key=interval==='year'?day.date.slice(0,4):interval==='month'?day.date.slice(0,7):day.date;
      const item=buckets.get(key)??{count:0,ids:[]};
      item.count+=day.report_count;
      for(const id of day.source_report_ids??[]) if(!item.ids.includes(id)) item.ids.push(id);
      buckets.set(key,item);
    }
    return Array.from(buckets,([key,item])=>({key,count:item.count,ids:item.ids,label:interval==='day'?dateText(key):interval==='month'?new Date(key+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'}):key}));
  },[currentSummary,interval]);
  const pageTitle = ownerArchive ? ({overview:'Сводка архива',objects:'Объект',reports:'Журнал записей',money:'Деньги',analytics:'Анализ архива',ai:'ИИ-аналитик',admin:'Управление'} as Record<Page,string>)[page] : labels[page];
  if (!token) return <Login onSuccess={setToken} demo={demo}/>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">C</span><span>CRS<small className="brand-caption">СТРОЙКОНТРОЛЬ</small></span></div>
      <nav aria-label="Основная навигация">{(Object.keys(labels) as Page[]).filter(key=>key!=='admin'||profile?.role==='admin').map(key =>
        <button key={key} className={page === key ? 'nav-item active' : 'nav-item'} onClick={() => setPage(key)}>
          <NavIcon page={key}/>{labels[key]}</button>)}{ownerArchive&&<a className="nav-item owner-archive-link" href={ownerArchive} target="_blank" rel="noreferrer">Архив MAX ↗</a>}</nav>
      <div className="sidebar-foot"><span className="online-dot"/> Серверные данные</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="mobile-brand">▣ СтройКонтроль</span><span className="topbar-right">{profile?.login ? displayAuthor(profile.login) : 'Пользователь'} <button className="quiet" onClick={() => {void http('/auth/logout',token,{method:'POST'}).catch(()=>{});endSession();setError('');}}>Выйти</button></span></header>
      <main className={`content${ownerArchive?' owner-content':''}`}>
        {demo&&<div className="card"><strong>ДЕМО · локальная база</strong><p>{demo.notice}</p></div>}
        <div className="heading"><div><h1>{pageTitle}</h1><p>{ownerArchive?({overview:'Последние записи, вопросы для решения и первичные источники',objects:'Рабочие даты, события и исходные сообщения',reports:'Поиск по содержанию и переход к первичке',money:'Зарегистрированные операции по дате операции',analytics:'Показатели, которые подтверждаются архивом',ai:'Вопросы к доступным данным',admin:'Настройки доступа'} as Record<Page,string>)[page]:page === 'overview' ? 'Что поступило, что требует проверки и где за период нет сведений' : page === 'money' ? 'Расходы, поступления и авансы по дате операции, без общего итога' : page === 'analytics' ? 'Работы по дате смены, деньги по дате операции. Считаются доставленные отчёты.' : 'Данные по выбранным условиям'}</p></div><button className="secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Обновление…' : '↻ Обновить'}</button></div>
        {error && <div className="error" role="alert">Ошибка: {error}</div>}
        {page!=='admin' && <><button className="mobile-filter-toggle secondary" aria-expanded={filtersOpen} aria-controls="report-filters" onClick={()=>setFiltersOpen(v=>!v)}>{filtersOpen?'Скрыть фильтры':'Фильтры'} <span>{siteId==='all'?'Все объекты':siteName(siteId)} · {authorId==='all'?'Все авторы':displayAuthor(authors.find(a=>a.id===authorId)?.login)} · {startDate.startsWith('!') || endDate.startsWith('!')?'Исправьте дату':`${startDate?formatDate(startDate):'начало'} — ${endDate?formatDate(endDate):'без ограничения'}`}</span></button><div id="report-filters" className={`filters ${filtersOpen?'filters-open':''}`}><label>Объект<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="all">Все объекты</option>{sites.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          <label>Автор<select value={authorId} onChange={e=>setAuthorId(e.target.value)}><option value="all">Все авторы</option>{authors.map(a=><option value={a.id} key={a.id}>{displayAuthor(a.login)}</option>)}</select></label>
          <DateFilter label="С" value={startDate} onChange={setStartDate}/><DateFilter label="По" value={endDate} onChange={setEndDate}/></div></>}
        {page === 'admin' ? <AdminPanel token={token} onExpired={endSession}/> : ownerArchive&&page==='reports' ? (dataCurrent&&ownerContext?<OwnerJournal reports={visible} sites={sites} context={ownerContext} onOpen={openReport}/>:<p className="empty">{error?'Не удалось загрузить журнал. Обновите страницу.':'Загрузка журнала…'}</p>) : ownerArchive&&(['overview','objects','analytics'] as Page[]).includes(page) ? (dataCurrent&&ownerContext?<OwnerDemo mode={page as 'overview'|'objects'|'analytics'} reports={visible} sites={sites} selectedSiteId={siteId} context={ownerContext} token={token} onOpen={openReport} onJournal={()=>setPage('reports')} onReconciliation={()=>{setSiteId(sites.find(site=>site.name.startsWith('Объект требует сверки'))?.id||'all');setPage('objects');}}/>:<p className="empty">{error?'Не удалось загрузить историю. Обновите страницу.':'Загрузка истории объекта…'}</p>) : page === 'ai' && (startDate.startsWith('!') || endDate.startsWith('!') || (!!startDate && !!endDate && startDate>endDate)) ? <p className="error">Исправьте период перед формированием анализа.</p> : page === 'ai' ? <AnalysisPanel key={JSON.stringify([siteId,authorId,startDate,endDate])} token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} onSource={id=>{const epoch=generation.current;void http<Report>('/reports/'+id,token).then(r=>{if(epoch===generation.current)setSelected(r);}).catch(e=>{if(epoch===generation.current)setError(e.message);});}}/> : <>
          {page !== 'reports' && page !== 'money' && <section className="metric-grid">
            <div className="metric"><span>Объектов</span><strong>{siteId==='all' ? sites.length : 1}</strong><small>Доступные объекты</small></div>
            <div className="metric"><span>Полученных отчётов</span><strong>{dataCurrent?received.length:'—'}</strong><small>Текущие версии с квитанцией, включая уточнение</small></div>
            <div className="metric"><span>Ожидают проверки</span><strong>{dataCurrent?needsReview:'—'}</strong><small>Статус «Доставлен»</small></div>
            {page==='overview' && <div className="metric"><span>Заявленные расходы</span><strong>{!dataCurrent?'—':expenseKopecks==null?'Нет':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(expenseKopecks/100)}</strong><small>{!dataCurrent?'По дате операции':expenseKopecks==null?'Нет расходных операций за период. Это не ноль.':'Только расходы, без поступлений и авансов'}</small></div>}
            <div className="metric"><span>Указано событий</span><strong>{currentSummary?.incident_count ?? '—'}</strong><small>Только явно внесённые записи</small></div>
          </section>}
          {page==='overview' && <section className="situation" aria-label="Ситуация на объектах"><div><div className="section-heading"><h2>Объекты</h2></div>
            {dataCurrent ? sites.filter(s=>siteId==='all'||s.id===siteId).map(site=>{const latest=latestReport(site.id);const problem=latest?.data.incidents?.[0];return <button type="button" className="situation-row" key={site.id} onClick={()=>{setSiteId(site.id);setPage('objects');}}><strong>{site.name}</strong><span>{latest?`Последний отчёт ${dateText(latest.data.work_date)} · ${displayAuthor(latest.author_login)}`:'В выбранном периоде сведений нет'}</span><span>{latest?briefResult(latest):'Последняя смена не попала в фильтр'}</span><span>{latest?<b className={`badge ${latest.status}`}>{reportStatusLabels[latest.status]}</b>:<b className="badge">Нет данных</b>}{problem?` Заявлено в отчёте ${dateText(latest.data.work_date)}: ${problem.description}`:''}</span></button>;}) : <p className="empty">{error?'Данные не загружены.':'Загрузка…'}</p>}
            {dataCurrent && !sites.length && <p className="empty">Нет назначенных объектов.</p>}<p className="footnote">Ожидания по сменам не настроены. Отсутствие записи не считается просрочкой. Строка показывает последний отчёт внутри выбранного периода.</p></div>
            <aside><h2>Требует внимания {dataCurrent?attentionReports.length:'—'}</h2>
              {dataCurrent && attentionReports.map(report=><button type="button" className="attention-item" key={report.id} onClick={()=>openReport(report)}><strong>{siteName(report.site_id)}</strong><span>{dateText(report.data.work_date)} · {briefResult(report)}</span><span className={`badge ${report.status}`}>{reportStatusLabels[report.status]}</span></button>)}
              {dataCurrent && !attentionReports.length && <p className="empty">Новых и возвращённых отчётов в периоде нет.</p>}
              {dataCurrent && statedProblems.map(item=><p className="attention-item" key={item.report.id}><strong>Заявлено в отчёте {dateText(item.report.data.work_date)}</strong><span>{item.incident.description}</span><span>{item.site.name}. Это запись отчёта, не признак продолжающейся аварии.</span></p>)}
            </aside></section>}
          {(page==='overview' || page==='reports') && <div className={page==='overview'?'overview-workspace':'journal-workspace'}>
          {(page==='overview' || page==='reports') && <section className="report-panel"><div className="section-heading"><h2>{page==='reports'?'Журнал отчётов':'Отчёты'}</h2>{page==='overview'&&<button className="link-button" onClick={()=>setPage('reports')}>Все отчёты →</button>}</div><p className="muted report-intro">{ownerArchive?'Исторические записи из MAX. Их статус доставки не является текущей очередью проверки.':page==='overview'?'Сначала показаны отчёты, ожидающие проверки':'Все отчёты по выбранным условиям'}</p>
            {visible.length ? <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Объект</th><th>Автор</th><th>Тип</th><th>Статус</th><th>Версия</th></tr></thead><tbody>{(page==='overview'?overviewReports.slice(0,6):visible).map(r=><tr key={r.id} onClick={()=>setSelected(r)}><td data-label="Дата"><button className="report-open" onClick={()=>setSelected(r)} aria-label={`Открыть отчёт за ${dateText(r.data.work_date)} · ${siteName(r.site_id)}`}>{dateText(r.data.work_date)}</button></td><td data-label="Объект">{siteName(r.site_id)}</td><td data-label="Автор">{displayAuthor(r.author_login)}</td><td data-label="Тип">{r.data.kind==='no_work'?'Без работ':'Работы'}</td><td data-label="Статус"><span className={`badge ${r.status}`}>{ownerArchive?'Архив MAX':reportStatusLabels[r.status]}</span></td><td data-label="Версия">№{r.revision}</td></tr>)}</tbody></table></div> : <p className="empty">{dataCurrent?'Отчёты по выбранным условиям отсутствуют.':error?'Данные не загружены.':'Загрузка отчётов…'}</p>}</section>}
          {page==='overview' &&
            <div className="chart-panel"><h2>Контроль отчётности</h2><p className="muted">Доставленные и проверенные отчёты по текущему фильтру; возвращённые на уточнение в график не включены</p>
              <label className="chart-period">Группировка<select value={interval} onChange={e=>setInterval(e.target.value as Interval)}><option value="day">По дням</option><option value="month">По месяцам</option><option value="year">По годам</option></select></label>
              <ul className="daily-chart" aria-label="Количество отчётов по периодам">{reportPeriods.map(period=><li key={period.key}><button type="button" className="chart-hit" onClick={()=>setDrill({title:`Отчёты за ${period.label}`,ids:period.ids})}><span>{period.label}</span><meter min={0} max={Math.max(...reportPeriods.map(p=>p.count),1)} value={period.count}/><b>{period.count}</b></button></li>)}</ul>{dataCurrent && !reportPeriods.length && <p className="empty">За выбранный период данных для графика нет. Это не подтверждённый ноль работ.</p>}
              <div className="big-number">{currentSummary?.report_count ?? '—'}<span> в графике</span></div>
              <p className="footnote">Просрочки пока не рассчитываются: график ожидаемых отчётов не согласован.</p></div>
          }
          </div>}
          {page==='analytics' && <section className="analytics-lead">
            <div className="chart-panel"><h2>Контроль отчётности</h2><p className="muted">Доставленные и проверенные отчёты по текущему фильтру; возвращённые на уточнение в график не включены</p>
              <label className="chart-period">Группировка<select value={interval} onChange={e=>setInterval(e.target.value as Interval)}><option value="day">По дням</option><option value="month">По месяцам</option><option value="year">По годам</option></select></label>
              <ul className="daily-chart" aria-label="Количество отчётов по периодам">{reportPeriods.map(period=><li key={period.key}><button type="button" className="chart-hit" onClick={()=>setDrill({title:`Отчёты за ${period.label}`,ids:period.ids})}><span>{period.label}</span><meter min={0} max={Math.max(...reportPeriods.map(p=>p.count),1)} value={period.count}/><b>{period.count}</b></button></li>)}</ul>{dataCurrent && !reportPeriods.length && <p className="empty">За выбранный период данных для графика нет. Это не подтверждённый ноль работ.</p>}
              <div className="big-number">{currentSummary?.report_count ?? '—'}<span> в графике</span></div>
              <p className="footnote">Просрочки пока не рассчитываются: график ожидаемых отчётов не согласован.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && <section className="work-volume">
            <div className="card"><h2>Выполненные объёмы</h2><p className="muted">По видам работ и отдельным единицам измерения</p>
              {volumes.length ? <div className="volume-list">{volumes.map((v,i) => <button type="button" className="volume-row" key={i} onClick={()=>setDrill({title:`${v.work_type}: ${v.quantity} ${v.unit}`,ids:v.source_report_ids??[]})}><div><strong>{v.work_type}</strong><small>{siteName(v.site_id)} · {v.unit}{v.confirmed_zero?' · подтверждённый ноль':''}</small></div><b>{v.quantity} {v.unit}</b></button>)}</div> : <p className="empty">{dataCurrent?'Нет подтверждённых количественных работ. Это не ноль.':error?'Данные не загружены.':'Загрузка сводки…'}</p>}
              {new Set(volumes.map(v=>v.work_type)).size>0 && [...new Set(volumes.map(v=>v.work_type))].some(type=>new Set(volumes.filter(v=>v.work_type===type).map(v=>v.unit)).size>1) && <p className="footnote">У одного вида работ разные единицы. Они показаны отдельно и не складываются.</p>}
              <p className="footnote">Объёмы считаются по дате смены. Каждая строка открывает исходные отчёты.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && !!currentSummary?.qualitative_works?.length && <section className="card"><h2>Описанные работы</h2><p className="muted">Сколько отчётов содержит каждую формулировку. Это не объём выполненных работ.</p><div className="volume-list" style={{maxHeight:420,overflowY:'auto'}}>{currentSummary.qualitative_works.map((item,i)=><details className="volume-row" key={`${item.site_id}-${item.work_type}-${i}`}><summary><strong>{item.work_type}</strong> · {item.report_count} отч.</summary><div className="source-links">{item.source_report_ids.map((id,j)=><button className="quiet" key={id} onClick={()=>setSelected(reports.find(r=>r.id===id) || null)}>Отчёт {j+1}</button>)}</div></details>)}</div><p className="footnote">Каждый счётчик раскрывает исходные отчёты; фильтры объекта, автора и периода применяются ко всем строкам.</p></section>}
          {(page==='overview' || page==='analytics') && <section className="dashboard-grid" aria-label="Деньги и спецтехника">
            <div className="card"><h2>Денежные операции</h2><p className="muted">Только зарегистрированные операции по дате операции. Текст переписки сюда не входит.</p>
              {currentSummary&&Object.keys(currentSummary.financial_totals_kopecks).length?<div className="volume-list">{(['funding_received','expense','advance_issued'] as const).filter(kind=>currentSummary.financial_totals_kopecks[kind]!=null).map(kind=>{const ids=[...new Set(currentSummary.financial_entries.filter(entry=>entry.kind===kind).map(entry=>entry.report_id))];return <button type="button" className="volume-row" key={kind} onClick={()=>setDrill({title:moneyLabels[kind],ids})}><strong>{moneyLabels[kind]}</strong><b>{new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format((currentSummary.financial_totals_kopecks[kind]||0)/100)}</b></button>;})}</div>:<p className="empty">{dataCurrent?'Подтверждённых структурированных операций нет. Упоминания расходов в исходниках требуют сверки и не становятся суммой.':'Загрузка сводки…'}</p>}
              <p className="footnote">Три вида не складываются и не образуют остаток: начальный остаток не задан.</p></div>
            <div className="card"><h2>Спецтехника</h2><p className="muted">Заявленные часы по виду и принадлежности</p>
              {currentSummary?.equipment_hours.length?<div className="volume-list">{currentSummary.equipment_hours.map((entry,i)=><div className="volume-row" key={i}><div><strong>{entry.type}</strong><small>{entry.hired?'Наёмная':'Своя'}</small></div><b>{entry.hours} ч</b></div>)}</div>:<p className="empty">{dataCurrent?'Структурированных часов техники нет. Исторические упоминания доступны в исходных сообщениях.':'Загрузка сводки…'}</p>}
              <p className="footnote">Стоимость без тарифа не рассчитывается.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && drill && <section className="card" aria-label="Исходные записи"><div className="section-heading"><h2>{drill.title}</h2><button type="button" className="link-button" onClick={()=>setDrill(null)}>Закрыть</button></div>{drill.ids.length?drill.ids.map(id=>{const report=reports.find(item=>item.id===id);return <button type="button" className="volume-row" key={id} onClick={()=>openById(id)}><span>{report?`${dateText(report.data.work_date)} · ${siteName(report.site_id)}`:'Открыть отчёт'}</span><b>К записи</b></button>;}):<p className="empty">Записей нет. Это не подтверждённый ноль.</p>}</section>}
          {page==='analytics' && <section className="card"><h2>Что не рассчитывается</h2><p>План и факт, процент готовности и просрочка не показаны: нет утверждённого плана и графика смен. Остаток денег не показан: нет начального остатка. Живые цифры берутся из доставленных отчётов с поля, а не из текста архива.</p></section>}
          {page==='objects' && (siteId==='all' ? <section className="card"><h2>Объекты</h2><div className="site-grid">{sites.map(s=><button className="site-tile" key={s.id} onClick={()=>setSiteId(s.id)}><div className="site-avatar" aria-hidden="true"><NavIcon page="objects"/></div><strong>{s.name}</strong><span>Открыть карточку</span></button>)}{!sites.length && <p className="empty">Нет назначенных объектов.</p>}</div></section> : <SiteCard site={sites.find(s=>s.id===siteId) || {id:siteId,name:siteName(siteId)}} reports={visible} ready={dataCurrent} token={token} authorName={displayAuthor} onOpen={openReport} onBack={()=>setSiteId('all')}/>)}
          {page==='money' && <MoneyPage token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} sites={sites} siteName={siteName} onOpen={openReport}/>}

        </>}
      </main>
      <footer>СтройКонтроль · данные сервера заказчика</footer>
      <nav className="bottom-nav" aria-label="Мобильная навигация">{(['overview','objects','reports','money','analytics','ai',...(profile?.role==='admin'?['admin']:[])] as Page[]).map(key=><button key={key} className={page===key?'active':''} aria-current={page===key?'page':undefined} aria-label={key==='ai'?labels[key]:undefined} onClick={()=>setPage(key)}><NavIcon page={key}/><span>{key==='ai'?'ИИ':labels[key]}</span></button>)}</nav>
    </div>
    {selected && <ReportDetails key={selected.id} report={selected} token={token} role={profile?.role||''} siteName={siteName(selected.site_id)} authorName={displayAuthor(selected.author_login)} ownerPhotos={ownerArchive?(ownerContext?.reports[selected.client_report_id]?.photos||[]):undefined} returnFocusTo={reportOpener.current} onClose={()=>{setSelected(null);reportOpener.current=null;}} onChange={r=>{setSelected(r);void refresh();}}/>}
  </div>;
}
