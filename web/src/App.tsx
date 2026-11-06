import { AuthorColorsProvider } from './reports/ReportSignals';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatDate } from './date';
import { ConversationDock } from './ConversationDock';
import { OwnerOperations } from './OwnerOperations';
import { TariffGrid } from './TariffGrid';
import { AdminPanel } from './AdminPanel';
import { AnalyticsOverview } from './AnalyticsOverview';
import { AnalyticsProduction } from './AnalyticsProduction';
import './design/control-review.css';
import { AnalysisPanel } from './AnalysisPanel';
import { ReportDetails } from './ReportDetails';
import { ReportsJournal } from './reports/ReportsJournal';
import { WorkbenchMasthead, WorkbenchSection, WorkbenchTopbar } from './workbench/WorkbenchChrome';
import { SiteList } from './sites/SiteList';
import { http, login, ApiError, filterQuery, allReports, type Profile, type Report, type ReportAuthor, type Site, type Summary, type Production } from './api';
import { SiteCard } from './SiteCard';
import { MoneyPage } from './MoneyPage';
import { equipmentOwnership } from './api';
import { CrSidebar } from './ui/CrSidebar';
import { primaryWorks } from './reports/reportView';
import { reportViewData, reportWorkState } from './api';
import { CrCombobox } from './ui/CrCombobox';
import { CrDateField } from './ui/CrDateField';
import { CrReportChart } from './ui/CrReportChart';
import { CrBreadcrumbs } from './ui/CrBreadcrumbs';
import { OwnerIcon } from './ui/OwnerIcon';
import { OwnerActivity } from './OwnerActivity';
import { ImportData } from './ImportData';
import { HostAddress } from './HostAddress';
import { Workspace } from './employee/EmployeeApp';
import './employee/employee.css';
import './design/owner-simple.css';
import './design/owner-visual.css';

type DemoInfo = {notice:string;accounts:Record<string,string>;password:string};
type Page = 'overview' | 'objects' | 'reports' | 'submit' | 'money' | 'analytics' | 'ai' | 'admin' | 'catalog' | 'labor' | 'staff';
type Interval = 'day' | 'month' | 'year';
const reportFromLocation = () => /^#report\/([0-9a-f-]{36})$/i.exec(window.location.hash)?.[1] ?? null;
const labels: Record<Page, string> = {
  catalog:'Виды работ',labor:'Табель',staff:'Сотрудники',overview: 'Главная', objects: 'Объекты', reports: 'Отчёты', submit:'Сдать отчёт', money: 'Деньги', analytics: 'Аналитика', ai: 'Помощник', admin:'Управление'
};
const dateText = formatDate;
const moneyLabels = {funding_received:'Поступление',expense:'Расход',advance_issued:'Выдача аванса'} as const;
function NavIcon({page}:{page:Page}) {
  const paths:Record<Page,React.ReactNode> = {
    overview:<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    objects:<><path d="M3 21h18M5 21V7l7-4 7 4v14M9 11h2m3 0h2m-7 4h2m3 0h2"/></>,
    reports:<><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6"/></>,
    submit:<><path d="M6 3h9l3 3v15H6zM14 3v4h4"/><path d="M12 11v6M9 14h6"/></>,
    money:<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M12 14h.01"/></>,
    analytics:<><path d="M4 20V11m5 9V5m5 15v-7m5 7V3M2 21h20"/></>,
    ai:<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></>,
    catalog:<path d="M4 5h16M4 12h16M4 19h16"/>,
    labor:<path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h8"/>,
    staff:<><circle cx="9" cy="8" r="2.2"/><circle cx="15" cy="8" r="2.2"/><path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6M12.5 14.6c.7-1.3 2-2.1 3.6-2.1 1.8 0 3.3 1 4 2.8"/></>,
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
  const [production, setProduction] = useState<Production | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [chatOpen,setChatOpen]=useState(false);
  const [ownerReload,setOwnerReload]=useState(0);
  const [chatReport,setChatReport]=useState<string|null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [siteId, setSiteId] = useState('all');
  const [authorId, setAuthorId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interval,setInterval]=useState<Interval>('month');
  const [selected, setSelected] = useState<Report | null>(null);
  const [reportId, setReportId] = useState<string | null>(reportFromLocation());
  const [reportError, setReportError] = useState('');
  const [reportRetry, setReportRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const [drill, setDrill] = useState<{title:string; ids:string[]} | null>(null);
  const sourceList=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(drill){sourceList.current?.scrollIntoView({block:"start"});sourceList.current?.focus({preventScroll:true});}},[drill]);
  const reportOpener=useRef<HTMLElement|null>(null);
  const openById=(id:string)=>{
    setChatReport(id);
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
    if(next==='overview'){setSiteId('all');setAuthorId('all');setStartDate('');setEndDate('');}
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
  const endSession=useCallback(()=>{generation.current++;setToken(null);setProfile(null);setChatOpen(false);setChatReport(null);setSites([]);setAuthors([]);setReports([]);setSummary(null);setProduction(null);setLoadedScope('');setSelected(null);setPage('overview');setSiteId('all');setAuthorId('all');setStartDate('');setEndDate('');setLoading(false);},[]);
  const refresh = useCallback(async () => {
    if (!token) return;
    const requestGeneration=++generation.current;
    setLoading(true); setError('');setSummary(null);setProduction(null);
    try {
      if(startDate.startsWith('!') || endDate.startsWith('!'))throw new Error('Введите корректную дату в формате дд/мм/гггг');
      if(startDate && endDate && startDate>endDate)throw new Error('Начало периода позже окончания');
      const query=filterQuery(siteId,startDate,endDate,authorId);
      const [u, s, people, r, a, prod] = await Promise.all([
        http<Profile>('/me', token), http<Site[]>('/sites', token),
        http<ReportAuthor[]>('/reports/authors',token),allReports(token, query), http<Summary>('/analytics/summary'+query, token),
        http<Production>('/analytics/production'+query, token).catch(e=>{
          if(e instanceof ApiError && e.status===401)throw e;
          return null;
        })
      ]);
      if(requestGeneration!==generation.current)return;
      if(authorId!=='all' && !people.some(person=>person.id===authorId)) {
        setProfile(u);setSites(s.map(site=>({...site,name:site.name.startsWith('Объект требует сверки')?'Без объекта':site.name.replace(/ · по истории чата$/,'')})));setAuthors(people);setReports([]);setSummary(null);setLoadedScope('');setAuthorId('all');return;
      }
      setProfile(u); setSites(s.map(site=>({...site,name:site.name.startsWith('Объект требует сверки')?'Без объекта':site.name.replace(/ · по истории чата$/,'')})));setAuthors(people); setReports(r); setSummary(a);setProduction(prod);setLoadedScope(filterKey);
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
    if(authors.find(a=>a.login===login)?.imported_only)return '';
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
  const volumes = (currentSummary?.volumes ?? []).filter(v => siteId === 'all' || v.site_id === siteId);
  const maxVolumeForUnit = (unit:string) => Math.max(0,...volumes.filter(v=>v.unit===unit).map(v=>Number(v.quantity)).filter(Number.isFinite));
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
  const morePages: Page[] = ['money','analytics','ai','catalog',...(profile?.is_owner?['labor' as Page]:[]),...((profile?.role==='admin'||!!profile?.is_owner)?['staff' as Page,'admin' as Page]:[])];
  if (!token) return <Login onSuccess={setToken} demo={demo}/>;
  return <AuthorColorsProvider authors={authors}><div className={`app-shell wb-shell owner-simple${chatOpen?' has-conversation':''}`}>
    <CrSidebar<Page>
      entries={(Object.keys(labels) as Page[]).filter(key=>(key!=='admin'||profile?.role==='admin'||profile?.is_owner)&&(key!=='labor'||profile?.is_owner)&&(key!=='staff'||profile?.role==='admin'||profile?.is_owner)).map(key=>({key,label:labels[key]}))}
      current={page}
      onSelect={navigate}
      renderIcon={key=><NavIcon page={key}/>}
    />
    <div className="workspace">
      <WorkbenchTopbar pageTitle={pageTitle} user={profile?.login ? displayAuthor(profile.login) : 'Пользователь'} onLogout={() => {void http('/auth/logout',token,{method:'POST'}).catch(()=>{});endSession();setError('');}} />
      <main className={`content${page==='objects' && siteId!=='all' ? ' site-page' : ''}`}>
        <div hidden={!!reportId}>
        {demo&&<div className="card"><strong>ДЕМО · локальная база</strong><p>{demo.notice}</p></div>}
        {page!=='overview' && <CrBreadcrumbs items={[{label:"СтройКонтроль",onSelect:()=>{navigate("overview");setSiteId("all");}},{label:pageTitle},...(page==="objects"&&siteId!=="all"?[{label:siteName(siteId)}]:[])]}/>}
        {page==='overview' ? <div className="owner-heading"><div><h1>Объекты и отчёты</h1><p>Выберите объект или откройте отчёт для проверки.</p></div><button className="secondary" onClick={()=>void refresh()} disabled={loading}>{loading?'Обновление…':'Обновить'}</button></div> : <WorkbenchMasthead title={page==='objects' && siteId!=='all'?siteName(siteId):pageTitle} index="" subtitle={page==='reports'?'Отчёты по выбранным условиям':page==='money'?'Денежные операции':page==='analytics'?'Итоги по отчётам':page==='objects'?'Работы и отчёты по объектам':page==='ai'?'Анализ отчётов':page==='catalog'?'Основные, вспомогательные и особые работы':page==='labor'?'Люди, дни и начисления':page==='staff'?'Фамилии и суммы, которые задаёт администратор':page==='submit'?'Отчёт за смену с телефона и компьютера':'Пользователи и доступ'} onRefresh={()=>{if(page==='catalog'||page==='labor'||page==='staff')setOwnerReload(v=>v+1);void refresh();}} refreshing={loading} />}
         {error && <div className="error" role="alert">Ошибка: {error}</div>}
        {(page!=='admin' && page!=='overview' && page!=='catalog' && page!=='submit' && page!=='staff') && <><div className="owner-filter-bar"><button type="button" className="secondary" aria-expanded={filtersOpen} aria-controls="report-filters" onClick={()=>setFiltersOpen(v=>!v)}>{filtersOpen?'Скрыть фильтры':'Фильтры'}</button><span>{siteId==='all'?'Все объекты':siteName(siteId)} · {page==='labor'?'Все работники':authorId==='all'?'Все авторы':displayAuthor(authors.find(a=>a.id===authorId)?.login)} · {startDate.startsWith('!') || endDate.startsWith('!')?'Исправьте дату':`${startDate?formatDate(startDate):'начало'} — ${endDate?formatDate(endDate):'без ограничения'}`}{page==='money'?' · даты операций':' · даты смен'}</span>{(siteId!=='all'||(page!=='labor'&&authorId!=='all')||startDate||endDate)&&<button type="button" className="link-button" onClick={()=>{setSiteId('all');setAuthorId('all');setStartDate('');setEndDate('');}}>Сбросить</button>}</div><div id="report-filters" className="filters filters-open" hidden={!filtersOpen}><CrCombobox label="Объект" value={siteId} onChange={setSiteId} options={[{value:'all',label:'Все объекты'},...sites.map(s=>({value:s.id,label:s.name}))]}/>
          {page!=='labor'&&<CrCombobox label="Автор" value={authorId} onChange={setAuthorId} options={[{value:'all',label:'Все авторы'},...authors.filter(a=>!a.imported_only).map(a=>({value:a.id,label:displayAuthor(a.login)}))]}/>}
          <CrDateField label="С" value={startDate} onChange={setStartDate}/><CrDateField label="По" value={endDate} onChange={setEndDate}/></div></>}
        {page === 'staff' ? <TariffGrid token={token} reloadKey={ownerReload}/> : page === 'catalog' || page==='labor' ? <OwnerOperations key={page} mode={page==='catalog'?'catalog':'labor'} token={token} sites={sites} isOwner={!!profile?.is_owner} siteId={siteId} fromDate={startDate} toDate={endDate} reloadKey={ownerReload}/> : page === 'submit' && profile ? <section className="employee-app employee-embedded" aria-label="Сдать отчёт"><Workspace embedded token={token} profile={profile} onExpired={endSession} onLogout={()=>undefined}/></section> : page === 'admin' ? <AdminPanel token={token} onExpired={endSession} allowUsers={profile?.role==='admin'}/> :
         page === 'ai' && (startDate.startsWith('!') || endDate.startsWith('!') || (!!startDate && !!endDate && startDate>endDate)) ? <p className="error">Исправьте период перед формированием анализа.</p> :
         page === 'ai' ? <AnalysisPanel key={JSON.stringify([siteId,authorId,startDate,endDate])} token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} onSource={openById} siteName={siteName} onChanged={refresh}/> : <>
          {page==='overview' && <section className="owner-home" aria-label="Объекты и отчёты">
            <div className="owner-snapshot" aria-label="Сводка по доступным данным">
              <div className="owner-snapshot-item"><span className="owner-snapshot-icon"><OwnerIcon name="building"/></span><span><small>Объекты</small><strong>{dataCurrent?sites.length:'—'}</strong></span></div>
              <div className="owner-snapshot-item"><span className="owner-snapshot-icon"><OwnerIcon name="reports"/></span><span><small>Получено отчётов</small><strong>{dataCurrent?received.length:'—'}</strong></span></div>
              <div className="owner-snapshot-item"><span className={`owner-snapshot-icon ${dataCurrent && needsReview?'is-attention':''}`}><OwnerIcon name="review"/></span><span><small>На проверке</small><strong>{dataCurrent?needsReview:'—'}</strong></span></div>
            </div>
            <div className="owner-home-dashboard"><div className="owner-home-main">
              <div className="owner-home-top"><div><h2>Объекты</h2><p>Последние записи по каждому объекту</p></div><button className="owner-text-button" onClick={()=>{setSiteId('all');navigate('objects');}}>Все объекты</button></div>
              {dataCurrent ? <div className="owner-sites">{sites.map(site=>{const latest=latestReport(site.id);const data=latest?reportViewData(latest):null;const works=latest?primaryWorks(latest):[];return <button key={site.id} className="owner-site" onClick={()=>{setSiteId(site.id);navigate('objects');}}><span className="owner-site-copy"><span className="owner-site-heading"><span className="owner-site-icon"><OwnerIcon name="building"/></span><strong>{site.name}</strong></span><small>{latest?`Последний отчёт: ${dateText(latest.data.work_date)}`:'Отчётов пока нет'}</small>{latest && <span className="owner-site-result">{reportWorkState(latest)==='no_work'?`Работ не было: ${data?.no_work_reason||'причина не указана'}`:works.length?works.slice(0,2).map(w=>w.description||w.type).join('; '):'Работы не указаны'}</span>}{data?.incidents?.[0]&&<small className="owner-site-event">Указано событие: {data.incidents[0].description}</small>}</span><span className="owner-site-arrow"><OwnerIcon name="arrow"/></span></button>;})}{!sites.length&&<p>Доступных объектов пока нет.</p>}</div> : <p>{error?'Не удалось загрузить объекты.':'Загрузка объектов…'}</p>}
              <div className="owner-home-top owner-report-heading"><div><h2>Последние отчёты</h2><p>{dataCurrent?(needsReview?`Ожидают проверки: ${needsReview}`:'Нет новых отчётов на проверку'):error?'Не удалось загрузить отчёты.':'Загрузка отчётов…'}</p></div><button className="owner-text-button" onClick={()=>navigate('reports')}>Все отчёты</button></div>
              {dataCurrent && <ReportsJournal reports={overviewReports} token={token} siteName={siteName} authorName={displayAuthor} title="Последние отчёты" intro="Сначала отчёты, ожидающие проверки" archive={false} compact onOpen={openReport} />}
            </div><aside className="owner-home-aside">
              {dataCurrent ? <OwnerActivity reports={received} siteName={siteName} onOpen={openReport}/> : <div className="owner-widget-loading">{error?'Данные графика не загружены.':'Загрузка графика…'}</div>}
              <div className="owner-home-links"><button onClick={()=>navigate('analytics')}><span className="owner-link-icon"><OwnerIcon name="chart"/></span><span><strong>Работы и аналитика</strong><small>Объёмы работ</small></span><OwnerIcon name="arrow"/></button><button onClick={()=>navigate('money')}><span className="owner-link-icon"><OwnerIcon name="money"/></span><span><strong>Деньги</strong><small>Расходы, поступления и авансы</small></span><OwnerIcon name="arrow"/></button></div>
            </aside></div>
          </section>}
           {(page==='reports') && <div className="journal-workspace wb-journal-workspace">
          {(page==='reports') && (dataCurrent || visible.length ? <ReportsJournal
              reports={visible}
              token={token}
              siteName={siteName}
              authorName={displayAuthor}
              title="Журнал отчётов"
              intro="Все отчёты по выбранным условиям."
              archive={false}
              compact={false}
              onOpen={openReport}
              onShowAll={()=>setPage('reports')}
            /> : <section className="report-panel"><h2>{page==='reports'?'Журнал отчётов':'Отчёты'}</h2><p className="empty">{error?'Данные не загружены.':'Загрузка отчётов…'}</p></section>)}
          </div>}
          {page==='analytics' && <AnalyticsOverview summary={currentSummary} reports={visible} ready={dataCurrent} siteName={siteName} onOpen={openById} onSources={(title,ids)=>setDrill({title,ids})}/>}
          {(page==='analytics') && <WorkbenchSection number="01" title="Данные производства" detail="Количественные объёмы и описанные работы" />}
           {(page==='analytics') && <AnalyticsProduction production={dataCurrent?production:null} ready={dataCurrent} error={!!error || dataCurrent&&!production} siteName={siteName} onOpen={openById} onSources={(title,ids)=>setDrill({title,ids})}/>}
           {(page==='analytics') && <section className="work-volume">
            <div className="card"><h2>Выполненные объёмы</h2><p className="muted">По видам работ</p>
              {volumes.length ? <div className="volume-list">{volumes.map((v,i) => <button type="button" className="volume-row" key={i} onClick={()=>setDrill({title:`${v.work_type}: ${v.quantity} ${v.unit}`,ids:v.source_report_ids??[]})}><div className="owner-volume-main"><strong>{v.work_type}</strong><small>{siteName(v.site_id)} · {v.unit}</small>{Number.isFinite(Number(v.quantity)) && maxVolumeForUnit(v.unit)>0 && <span className="owner-volume-track" aria-hidden="true"><span style={{width:`${Math.min(100,Math.max(0,Number(v.quantity)/maxVolumeForUnit(v.unit)*100))}%`}}/></span>}</div><b>{v.quantity} {v.unit}</b></button>)}</div> : <p className="empty">{dataCurrent?'Объёмы работ не указаны.':error?'Данные не загружены.':'Загрузка сводки…'}</p>}
              </div>
          </section>}
          {page==='analytics' && <WorkbenchSection number="02" title="Отчёты по периодам" detail="По данным сводки" />}
           {page==='analytics' && <section className="analytics-lead wb-analytics-lead">
            <div className="card"><h2>Полученные отчёты</h2><p className="muted">По дням, месяцам и годам</p>
              <label className="chart-period">Группировка<select value={interval} onChange={e=>setInterval(e.target.value as Interval)}><option value="day">По дням</option><option value="month">По месяцам</option><option value="year">По годам</option></select></label>
              <CrReportChart periods={reportPeriods} ready={dataCurrent} total={currentSummary?.report_count} onOpen={period=>setDrill({title:`Отчёты за ${period.label}`,ids:period.ids})} />
              </div>
          </section>}
          {(page==='analytics') && <section className="dashboard-grid" aria-label="Деньги и спецтехника">
            <div className="card"><h2>Денежные операции</h2><p className="muted">По датам операций</p>
              {currentSummary&&Object.keys(currentSummary.financial_totals_kopecks).length?<div className="volume-list">{(['funding_received','expense','advance_issued'] as const).filter(kind=>currentSummary.financial_totals_kopecks[kind]!=null).map(kind=>{const ids=[...new Set(currentSummary.financial_entries.filter(entry=>entry.kind===kind).map(entry=>entry.report_id))];return <button type="button" className="volume-row" key={kind} onClick={()=>setDrill({title:moneyLabels[kind],ids})}><strong>{moneyLabels[kind]}</strong><b>{new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format((currentSummary.financial_totals_kopecks[kind]||0)/100)}</b></button>;})}</div>:<p className="empty">{dataCurrent?'Денежные операции не указаны.':'Загрузка сводки…'}</p>}
              </div>
            <div className="card"><h2>Спецтехника</h2><p className="muted">Заявленные часы по виду и принадлежности</p>
              {currentSummary?.equipment_hours.length?<div className="volume-list">{currentSummary.equipment_hours.map((entry,i)=><div className="volume-row" key={i}><div><strong>{entry.type}</strong><small>{equipmentOwnership(entry.hired)}</small></div><b>{entry.hours} ч</b></div>)}</div>:<p className="empty">{dataCurrent?'Часы работы техники не указаны.':'Загрузка сводки…'}</p>}
              </div>
          </section>}
          {(page==='analytics') && drill && <section ref={sourceList} tabIndex={-1} className="card control-source-disclosure" aria-label="Отчёты"><div className="section-heading"><h2>{drill.title}</h2><button type="button" className="link-button" onClick={()=>setDrill(null)}>Закрыть</button></div>{drill.ids.length?drill.ids.map(id=>{const report=reports.find(item=>item.id===id);return <button type="button" className="volume-row" key={id} onClick={()=>openById(id)}><span>{report?`${dateText(report.data.work_date)} · ${siteName(report.site_id)}`:'Открыть отчёт'}</span><b>Открыть отчёт</b></button>;}):<p className="empty">Нет записей.</p>}</section>}


          {page==='analytics' && ['manager','admin'].includes(profile?.role||'') && <details className="card"><summary>Архив документов</summary><ImportData token={token} reports={visible} onOpen={openById}/></details>}
          {page==='objects' && siteId==='all' && <WorkbenchSection number="01" title="Объекты" detail="Ход работ" />}
           {page==='objects' && (siteId==='all' ? <SiteList sites={sites} latestReport={latestReport} authorName={displayAuthor} onOpen={id=>setSiteId(id)}/> : <SiteCard site={sites.find(s=>s.id===siteId) || {id:siteId,name:siteName(siteId)}} reports={visible} ready={dataCurrent} token={token} authorName={displayAuthor} onOpen={openReport} onBack={()=>setSiteId('all')} onMoney={()=>navigate('money')}/>)}
           {page==='money' && <MoneyPage token={token} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate} sites={sites} siteName={siteName} onOpen={openReport}/>}
        </>}
        </div>
        {reportId && (selected?.id===reportId ? <ReportDetails key={selected.id} report={selected} token={token} role={profile?.role||''} siteName={siteName(selected.site_id)} authorName={displayAuthor(selected.author_login)} onClose={closeReport} onChange={r=>{setSelected(r);void refresh();}}/> : <section className="report-load" aria-live="polite"><button className="quiet" onClick={closeReport}>← Назад</button>{reportError?<><h1>Не удалось открыть отчёт</h1><p role="alert">{reportError}</p><button className="secondary" onClick={()=>setReportRetry(n=>n+1)}>Попробовать снова</button></>:<p>Загрузка отчёта…</p>}</section>)}
      </main>
      <footer>СтройКонтроль
        {token && ['manager','admin'].includes(profile?.role||'') && <HostAddress token={token}/>}
      </footer>
      <button type="button" className="conversation-toggle" aria-expanded={chatOpen} onClick={()=>setChatOpen(v=>!v)}>Переписка / ИИ</button>
      {chatOpen&&<ConversationDock key={filterKey} token={token} reports={visible} reportId={visible.some(r=>r.id===chatReport)?chatReport:null} onClose={()=>setChatOpen(false)} onReport={openById} siteName={siteName} onChanged={refresh} siteId={siteId} authorId={authorId} fromDate={startDate} toDate={endDate}/>}
      <nav className="bottom-nav crs-bottom-nav" aria-label="Мобильная навигация">
        {(['overview','objects','submit','reports'] as Page[]).map(key=>(
          <button key={key} type="button" className={page===key?'active':''}
            aria-current={page===key?'page':undefined}
            onClick={()=>{navigate(key);setMobileMoreOpen(false);}}>
            <NavIcon page={key}/><span>{labels[key]}</span>
          </button>
        ))}
        <button type="button" className={`crs-more-toggle${(['money','analytics','ai','admin','catalog','labor','staff'] as Page[]).includes(page)?' active':''}`}
          aria-label="Дополнительные разделы" aria-expanded={mobileMoreOpen}
          aria-controls="crs-more-menu" onClick={()=>setMobileMoreOpen(open=>!open)}>
          <span aria-hidden="true" style={{fontSize:22,lineHeight:1}}>⋯</span><span>Ещё</span>
        </button>
        {mobileMoreOpen && <div id="crs-more-menu" className="crs-more-menu" role="menu" aria-label="Дополнительные разделы">
          {morePages.map(key=>(
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
