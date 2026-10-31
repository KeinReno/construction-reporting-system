import { AuthorColorsProvider } from './reports/ReportSignals';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatDate } from './date';
import { AdminPanel } from './AdminPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { ReportDetails } from './ReportDetails';
import { ReportsJournal } from './reports/ReportsJournal';
import { SituationBoardV4 } from './workbench/SituationBoardV4';
import { WorkbenchCommandHero, WorkbenchMasthead, WorkbenchSection, WorkbenchTopbar } from './workbench/WorkbenchChrome';
import { SiteList } from './sites/SiteList';
import { http, login, ApiError, filterQuery, allReports, type Profile, type Report, type ReportAuthor, type Site, type Summary } from './api';
import { SiteCard } from './SiteCard';
import { MoneyPage } from './MoneyPage';
import { ImportData } from './ImportData';
import { equipmentOwnership } from './api';
import { CrSidebar } from './ui/CrSidebar';
import { CrProgress } from './ui/CrProgress';
import { CrCombobox } from './ui/CrCombobox';
import { CrDateField } from './ui/CrDateField';
import { CrReportChart } from './ui/CrReportChart';
import { CrBreadcrumbs } from './ui/CrBreadcrumbs';

type DemoInfo = {notice:string;accounts:Record<string,string>;password:string};
type Page = 'overview' | 'objects' | 'reports' | 'money' | 'analytics' | 'ai' | 'admin';
type Interval = 'day' | 'month' | 'year';
const reportFromLocation = () => /^#report\/([0-9a-f-]{36})$/i.exec(window.location.hash)?.[1] ?? null;
const labels: Record<Page, string> = {
  overview: 'Главная', objects: 'Объекты', reports: 'Отчёты', money: 'Деньги', analytics: 'Аналитика', ai: 'ИИ-аналитик', admin:'Управление'
};
const dateText = formatDate;
const moneyLabels = {funding_received:'Поступление',expense:'Расход',advance_issued:'Выдача аванса'} as const;
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
  const [token, setToken] = useState<string | null>(null); // memory only; logout on page close
  useEffect(()=>{let active=true;void fetch('/demo-info').then(r=>r.ok?r.json():null).then(d=>{if(active)setDemo(d);}).catch(()=>{});return()=>{active=false;};},[]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [authors, setAuthors] = useState<ReportAuthor[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [siteId, setSiteId] = useState('all');
  const [authorId, setAuthorId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interval,setInterval]=useState<Interval>('day');
  const [selected, setSelected] = useState<Report | null>(null);
  const [reportId, setReportId] = useState<string | null>(reportFromLocation());
  const [reportError, setReportError] = useState('');
  const [reportRetry, setReportRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const [drill, setDrill] = useState<{title:string; ids:string[]} | null>(null);
  const reportOpener=useRef<HTMLElement|null>(null);
  const openById=(id:string)=>{
    reportOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    window.history.pushState({crsReport:true},'',`#report/${id}`);
    setReportId(id);
  };
  const openReport=(report:Report)=>openById(report.id);
  const closeReport=()=>{
    if(window.history.state?.crsReport) window.history.back();
    else { window.history.replaceState(null,'',window.location.pathname+window.location.search); setReportId(null); }
  };
  const navigate=(next:Page)=>{
    if(reportId) { window.history.replaceState(null,'',window.location.pathname+window.location.search); setReportId(null); }
    setPage(next);
  };
  useEffect(()=>{
    const sync=()=>setReportId(reportFromLocation());
    window.addEventListener('popstate',sync);
    window.addEventListener('hashchange',sync);
    return ()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync);};
  },[]);
  useEffect(()=>{
    setSelected(null);setReportError('');
    if(!token||!reportId)return;
    let active=true;
    void http<Report>(`/reports/${reportId}`,token).then(value=>{if(active)setSelected(value);}).catch(e=>{if(active)setReportError(e instanceof Error?e.message:'Не удалось открыть отчёт');});
    return ()=>{active=false;};
  },[token,reportId,reportRetry]);
  useEffect(()=>{
    if(!reportId && reportOpener.current?.isConnected){reportOpener.current.focus();reportOpener.current=null;}
  },[reportId]);
  const filterKey=JSON.stringify([siteId,authorId,startDate,endDate]);
  const generation=useRef(0);
  const endSession=useCallback(()=>{generation.current++;setToken(null);setProfile(null);setSites([]);setAuthors([]);setReports([]);setSummary(null);setLoadedScope('');setSelected(null);setPage('overview');setSiteId('all');setAuthorId('all');setStartDate('');setEndDate('');setLoading(false);},[]);
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
  const siteName = (id: string) => {const name=sites.find(s => s.id === id)?.name;return name ?? 'Неизвестный объект';};
  const displayAuthor = (login:string|null|undefined) => {
    if (!login) return 'Не указан';
    if(authors.find(a=>a.login===login)?.imported_only)return 'Оператор переноса';
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
  const needsReview = visible.filter(r => r.origin!=='imported' && r.status === 'submitted').length;
  const overviewReports = [...visible].sort((a,b) => Number(b.origin!=='imported' && b.status === 'submitted') - Number(a.origin!=='imported' && a.status === 'submitted'));
  const latestReport = (id:string) => visible.filter(r => r.site_id === id).sort((a,b) => b.data.work_date.localeCompare(a.data.work_date) || b.revision - a.revision)[0];
  const attentionReports = visible.filter(r => r.origin!=='imported' && (r.status === 'submitted' || r.status === 'needs_revision')).sort((a,b) => b.data.work_date.localeCompare(a.data.work_date));
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
  const pageTitle = labels[page];
  if (!token) return <Login onSuccess={setToken} demo={demo}/>;
  return <AuthorColorsProvider authors={authors}><div className="app-shell wb-shell">
    <CrSidebar<Page>
      entries={(Object.keys(labels) as Page[]).filter(key=>key!=='admin'||profile?.role==='admin').map(key=>({key,label:labels[key]}))}
      current={page}
      onSelect={navigate}
      renderIcon={key=><NavIcon page={key}/>}
    />
    <div className="workspace">
      <WorkbenchTopbar pageTitle={pageTitle} user={profile?.login ? displayAuthor(profile.login) : 'Пользователь'} onLogout={() => {void http('/auth/logout',token,{method:'POST'}).catch(()=>{});endSession();setError('');}} />
      <main className={`content`}>
        <div hidden={!!reportId}>
        {demo&&<div className="card"><strong>ДЕМО · локальная база</strong><p>{demo.notice}</p></div>}
        <CrBreadcrumbs items={[{label:"СтройКонтроль",onSelect:()=>{navigate("overview");setSiteId("all");}},{label:pageTitle},...(page==="objects"&&siteId!=="all"?[{label:siteName(siteId)}]:[])]}/>
        <WorkbenchMasthead title={pageTitle} index={page==='overview'?'01':page==='objects'?'02':page==='reports'?'03':page==='money'?'04':page==='analytics'?'05':page==='ai'?'06':'07'}
           subtitle={page === 'overview' ? 'Единая рабочая картина по объектам, сменам и отчётности' :
             page === 'reports' ? 'Все отчёты по выбранным условиям. Содержание смены видно без открытия.' :
             page === 'money' ? 'Расходы, поступления и авансы по дате операции. Без вымышленного баланса.' :
             page === 'analytics' ? 'Фактические показатели с прямыми ссылками на источники' :
             page === 'objects' ? 'Объекты, смены, ресурсы и зафиксированные события' :
             page === 'ai' ? 'Анализ по данным реальных отчётов' :
             'Пользователи, объекты и разграничение доступа'}
           onRefresh={() => void refresh()} refreshing={loading} />
         {error && <div className="error" role="alert">Ошибка: {error}</div>}
        {(page!=='admin') && <><button className="mobile-filter-toggle secondary" aria-expanded={filtersOpen} aria-controls="report-filters" onClick={()=>setFiltersOpen(v=>!v)}>{filtersOpen?'Скрыть фильтры':'Фильтры'} <span>{siteId==='all'?'Все объекты':siteName(siteId)} · {authorId==='all'?'Все авторы':displayAuthor(authors.find(a=>a.id===authorId)?.login)} · {startDate.startsWith('!') || endDate.startsWith('!')?'Исправьте дату':`${startDate?formatDate(startDate):'начало'} — ${endDate?formatDate(endDate):'без ограничения'}`}</span></button><div id="report-filters" className={`filters ${filtersOpen?'filters-open':''}`}><CrCombobox label="Объект" value={siteId} onChange={setSiteId} options={[{value:'all',label:'Все объекты'},...sites.map(s=>({value:s.id,label:s.name}))]}/>
          <CrCombobox label="Автор" value={authorId} onChange={setAuthorId} options={[{value:'all',label:'Все авторы'},...authors.map(a=>({value:a.id,label:displayAuthor(a.login)}))]}/>
          <CrDateField label="С" value={startDate} onChange={setStartDate}/><CrDateField label="По" value={endDate} onChange={setEndDate}/></div></>}
        {page === 'admin' ? <AdminPanel token={token} onExpired={endSession}/> :
         page === 'ai' && (startDate.startsWith('!') || endDate.startsWith('!') || (!!startDate && !!endDate && startDate>endDate)) ? <p className="error">Исправьте период перед формированием анализа.</p> :
         page === 'ai' ? <AnalysisPanel key={JSON.stringify([siteId,authorId,startDate,endDate])} token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} onSource={openById}/> : <>
          {page==='overview' && <WorkbenchCommandHero
             reports={received.length} visibleReports={visible.length}
             pending={needsReview} siteCount={siteId==='all'?sites.length:1}
             incidents={currentSummary?.incident_count ?? null}
             expenseKopecks={expenseKopecks}
             ready={dataCurrent}
             onShowReports={()=>navigate('reports')} />}
           {page !== 'overview' && page !== 'reports' && page !== 'money' && <section className="metric-grid wb-secondary-kpis">
             <div className="metric"><span>Объектов</span><strong>{siteId==='all' ? sites.length : 1}</strong><small>Доступные объекты</small></div>
             <div className="metric crs-metric-featured"><span>Полученных отчётов</span><strong>{dataCurrent?received.length:'—'}</strong><small>Текущие версии с квитанцией, включая уточнение</small>{dataCurrent && visible.length > 0 && <CrProgress value={received.length} max={visible.length} label="Доля отчётов с квитанцией" />}</div>
             <div className="metric crs-metric-attention"><span>Ожидают проверки</span><strong>{dataCurrent?needsReview:'—'}</strong><small>Новые отчёты сотрудников</small></div>
             <div className="metric"><span>Указано событий</span><strong>{currentSummary?.incident_count ?? '—'}</strong><small>Только явно внесённые записи</small></div>
           </section>}
           {page==='overview' && <WorkbenchSection number="01" title="Объекты и контроль" detail="Текущая ситуация по площадкам" />}
           {page==='overview' && <SituationBoardV4
            sites={sites.filter(s=>siteId==='all'||s.id===siteId)}
            ready={dataCurrent}
            error={error}
            latestReport={latestReport}
            attentionReports={attentionReports}
            statedProblems={statedProblems}
            siteName={siteName}
            authorName={displayAuthor}
            onOpenSite={id=>{setSiteId(id);setPage('objects');}}
            onOpenReport={openReport}
          />}
          {page==='overview' && <WorkbenchSection number="02" title="Оперативная отчётность" detail="Записи, даты, первичные источники" />}
           {(page==='overview' || page==='reports') && <div className={page==='overview'?'overview-workspace wb-overview-data':'journal-workspace wb-journal-workspace'}>
          {(page==='overview' || page==='reports') && (dataCurrent || visible.length ? <ReportsJournal
              reports={page==='overview'?overviewReports:visible}
              token={token}
              siteName={siteName}
              authorName={displayAuthor}
              title={page==='reports'?'Журнал отчётов':'Отчёты'}
              intro={page==='overview'?'Сначала показаны отчёты, ожидающие проверки':'Все отчёты по выбранным условиям. Содержание смены видно без открытия.'}
              archive={false}
              compact={page==='overview'}
              onOpen={openReport}
              onShowAll={()=>setPage('reports')}
            /> : <section className="report-panel"><h2>{page==='reports'?'Журнал отчётов':'Отчёты'}</h2><p className="empty">{error?'Данные не загружены.':'Загрузка отчётов…'}</p></section>)}
          {page==='overview' &&
            <div className="chart-panel"><h2>Контроль отчётности</h2><p className="muted">Доставленные и проверенные отчёты по текущему фильтру; возвращённые на уточнение в график не включены</p>
              <label className="chart-period">Группировка<select value={interval} onChange={e=>setInterval(e.target.value as Interval)}><option value="day">По дням</option><option value="month">По месяцам</option><option value="year">По годам</option></select></label>
              <CrReportChart periods={reportPeriods} ready={dataCurrent} total={currentSummary?.report_count} onOpen={period=>setDrill({title:`Отчёты за ${period.label}`,ids:period.ids})} />
              <p className="footnote">Просрочки пока не рассчитываются: график ожидаемых отчётов не согласован.</p></div>
          }
          </div>}
          {page==='analytics' && <WorkbenchSection number="01" title="Динамика по периодам" detail="По данным сводки" />}
           {page==='analytics' && <section className="analytics-lead wb-analytics-lead">
            <div className="card"><h2>Аналитика объектов</h2><p className="muted">Сводка по данным периода</p>
              <label className="chart-period">Группировка<select value={interval} onChange={e=>setInterval(e.target.value as Interval)}><option value="day">По дням</option><option value="month">По месяцам</option><option value="year">По годам</option></select></label>
              <CrReportChart periods={reportPeriods} ready={dataCurrent} total={currentSummary?.report_count} onOpen={period=>setDrill({title:`Отчёты за ${period.label}`,ids:period.ids})} />
              <p className="footnote">Просрочки пока не рассчитываются: график ожидаемых отчётов не согласован.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && <WorkbenchSection number={page==='overview'?'03':'02'} title="Данные производства" detail="Количественные объёмы и описанные работы" />}
           {(page==='overview' || page==='analytics') && <section className="work-volume">
            <div className="card"><h2>Выполненные объёмы</h2><p className="muted">По видам работ и отдельным единицам измерения</p>
              {volumes.length ? <div className="volume-list">{volumes.map((v,i) => <button type="button" className="volume-row" key={i} onClick={()=>setDrill({title:`${v.work_type}: ${v.quantity} ${v.unit}`,ids:v.source_report_ids??[]})}><div><strong>{v.work_type}</strong><small>{siteName(v.site_id)} · {v.unit}{v.confirmed_zero?' · подтверждённый ноль':''}</small></div><b>{v.quantity} {v.unit}</b></button>)}</div> : <p className="empty">{dataCurrent?'Нет подтверждённых количественных работ. Это не ноль.':error?'Данные не загружены.':'Загрузка сводки…'}</p>}
              {new Set(volumes.map(v=>v.work_type)).size>0 && [...new Set(volumes.map(v=>v.work_type))].some(type=>new Set(volumes.filter(v=>v.work_type===type).map(v=>v.unit)).size>1) && <p className="footnote">У одного вида работ разные единицы. Они показаны отдельно и не складываются.</p>}
              <p className="footnote">Объёмы считаются по дате смены. Каждая строка открывает исходные отчёты.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && !!currentSummary?.qualitative_works?.length && <section className="card"><h2>Описанные работы</h2><p className="muted">Сколько отчётов содержит каждую формулировку. Это не объём выполненных работ.</p><div className="crs-qualitative-list">{currentSummary.qualitative_works.map((item,i)=><details className="crs-work-disclosure" key={`${item.site_id}-${item.work_type}-${i}`}><summary><strong>{item.work_type}</strong><span>{item.report_count} отч.</span></summary><div className="source-links">{item.source_report_ids.map((id,j)=><button className="quiet" key={id} onClick={()=>openById(id)}>Отчёт {j+1}</button>)}</div></details>)}</div><p className="footnote">Каждый счётчик раскрывает исходные отчёты; фильтры объекта, автора и периода применяются ко всем строкам.</p></section>}
          {(page==='overview' || page==='analytics') && <section className="dashboard-grid" aria-label="Деньги и спецтехника">
            <div className="card"><h2>Денежные операции</h2><p className="muted">Только зарегистрированные операции по дате операции.</p>
              {currentSummary&&Object.keys(currentSummary.financial_totals_kopecks).length?<div className="volume-list">{(['funding_received','expense','advance_issued'] as const).filter(kind=>currentSummary.financial_totals_kopecks[kind]!=null).map(kind=>{const ids=[...new Set(currentSummary.financial_entries.filter(entry=>entry.kind===kind).map(entry=>entry.report_id))];return <button type="button" className="volume-row" key={kind} onClick={()=>setDrill({title:moneyLabels[kind],ids})}><strong>{moneyLabels[kind]}</strong><b>{new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format((currentSummary.financial_totals_kopecks[kind]||0)/100)}</b></button>;})}</div>:<p className="empty">{dataCurrent?'Подтверждённых структурированных операций нет. Упоминания расходов в исходниках требуют сверки и не становятся суммой.':'Загрузка сводки…'}</p>}
              <p className="footnote">Три вида не складываются и не образуют остаток: начальный остаток не задан.</p></div>
            <div className="card"><h2>Спецтехника</h2><p className="muted">Заявленные часы по виду и принадлежности</p>
              {currentSummary?.equipment_hours.length?<div className="volume-list">{currentSummary.equipment_hours.map((entry,i)=><div className="volume-row" key={i}><div><strong>{entry.type}</strong><small>{equipmentOwnership(entry.hired)}</small></div><b>{entry.hours} ч</b></div>)}</div>:<p className="empty">{dataCurrent?'Часы работы техники не указаны.':'Загрузка сводки…'}</p>}
              <p className="footnote">Стоимость без тарифа не рассчитывается.</p></div>
          </section>}
          {(page==='overview' || page==='analytics') && drill && <section className="card" aria-label="Исходные записи"><div className="section-heading"><h2>{drill.title}</h2><button type="button" className="link-button" onClick={()=>setDrill(null)}>Закрыть</button></div>{drill.ids.length?drill.ids.map(id=>{const report=reports.find(item=>item.id===id);return <button type="button" className="volume-row" key={id} onClick={()=>openById(id)}><span>{report?`${dateText(report.data.work_date)} · ${siteName(report.site_id)}`:'Открыть отчёт'}</span><b>К записи</b></button>;}):<p className="empty">Записей нет. Это не подтверждённый ноль.</p>}</section>}
          {page==='analytics' && <section className="card"><h2>Что не рассчитывается</h2><p>План и факт, процент готовности и просрочка не показаны: нет утверждённого плана и графика смен. Остаток денег не показан: нет начального остатка. Показатели рассчитываются по зарегистрированным данным отчётов.</p></section>}
          {page==='analytics' && ['manager','admin'].includes(profile?.role||'') && <ImportData token={token} reports={visible} onOpen={openById}/>}
          {page==='objects' && (siteId==='all' ? <SiteList sites={sites} latestReport={latestReport} authorName={displayAuthor} onOpen={id=>setSiteId(id)}/> : <SiteCard site={sites.find(s=>s.id===siteId) || {id:siteId,name:siteName(siteId)}} reports={visible} ready={dataCurrent} token={token} authorName={displayAuthor} onOpen={openReport} onBack={()=>setSiteId('all')}/>)}
          {page==='money' && <MoneyPage token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} sites={sites} siteName={siteName} onOpen={openReport}/>}
        </>}
        </div>
        {reportId && (selected?.id===reportId ? <ReportDetails key={selected.id} report={selected} token={token} role={profile?.role||''} siteName={siteName(selected.site_id)} authorName={displayAuthor(selected.author_login)} onClose={closeReport} onChange={r=>{setSelected(r);void refresh();}}/> : <section className="report-load" aria-live="polite"><button className="quiet" onClick={closeReport}>← Назад</button>{reportError?<><h1>Не удалось открыть отчёт</h1><p role="alert">{reportError}</p><button className="secondary" onClick={()=>setReportRetry(n=>n+1)}>Попробовать снова</button></>:<p>Загрузка отчёта…</p>}</section>)}
      </main>
      <footer>СтройКонтроль · данные сервера заказчика</footer>
      <nav className="bottom-nav crs-bottom-nav" aria-label="Мобильная навигация">
        {(['overview','objects','reports','money'] as Page[]).map(key=>(
          <button key={key} type="button" className={page===key?'active':''}
            aria-current={page===key?'page':undefined}
            onClick={()=>{navigate(key);setMobileMoreOpen(false);}}>
            <NavIcon page={key}/><span>{labels[key]}</span>
          </button>
        ))}
        <button type="button" className={`crs-more-toggle${(['analytics','ai','admin'] as Page[]).includes(page)?' active':''}`}
          aria-label="Дополнительные разделы" aria-expanded={mobileMoreOpen}
          aria-controls="crs-more-menu" onClick={()=>setMobileMoreOpen(open=>!open)}>
          <span aria-hidden="true" style={{fontSize:22,lineHeight:1}}>⋯</span><span>Ещё</span>
        </button>
        {mobileMoreOpen && <div id="crs-more-menu" className="crs-more-menu" role="menu" aria-label="Дополнительные разделы">
          {(['analytics','ai',...(profile?.role==='admin'?['admin']:[])] as Page[]).map(key=>(
            <button type="button" key={key} role="menuitem" aria-current={page===key?'page':undefined}
              onClick={()=>{navigate(key);setMobileMoreOpen(false);}}>
              <NavIcon page={key}/><span>{labels[key]}</span>
            </button>
          ))}
        </div>}
      </nav>
    </div>

  </div></AuthorColorsProvider>;
}
