import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AdminPanel } from './AdminPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { ReportDetails } from './ReportDetails';
import { http, login, ApiError, filterQuery, allReports, type Profile, type Report, type Site, type Summary } from './api';

type DemoInfo = {notice:string;accounts:Record<string,string>;password:string};
type Page = 'overview' | 'objects' | 'reports' | 'analytics' | 'ai' | 'admin';
const labels: Record<Page, string> = {
  overview: 'Главная', objects: 'Объекты', reports: 'Отчёты', analytics: 'Аналитика', ai: 'ИИ-аналитик', admin:'Управление'
};
const statusLabels: Record<Report['status'], string> = {
  draft: 'Черновик', submitted: 'Доставлен', reviewed: 'Проверен', needs_revision: 'На уточнении'
};
const dateText = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU');

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
  useEffect(()=>{let active=true;void fetch('/demo-info').then(r=>r.ok?r.json():null).then(d=>{if(active)setDemo(d);}).catch(()=>{});return()=>{active=false;};},[]);
  const [token, setToken] = useState<string | null>(null); // memory only; logout on page close
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [siteId, setSiteId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation=useRef(0);
  const endSession=useCallback(()=>{generation.current++;setToken(null);setProfile(null);setSites([]);setReports([]);setSummary(null);setSelected(null);setPage('overview');setSiteId('all');setStartDate('');setEndDate('');setLoading(false);},[]);
  const refresh = useCallback(async () => {
    if (!token) return;
    const requestGeneration=++generation.current;
    setLoading(true); setError('');
    try {
      if(startDate && endDate && startDate>endDate)throw new Error('Начало периода позже окончания');
      const query=filterQuery(siteId,startDate,endDate);
      const [u, s, r, a] = await Promise.all([
        http<Profile>('/me', token), http<Site[]>('/sites', token),
        allReports(token, query), http<Summary>('/analytics/summary'+query, token)
      ]);
      if(requestGeneration!==generation.current)return;
      setProfile(u); setSites(s); setReports(r); setSummary(a);
    } catch (e) {
      if(requestGeneration!==generation.current)return;
      const reason = e instanceof Error ? e.message : 'Ошибка загрузки';
      setError(reason);
      if (e instanceof ApiError && e.status===401) {endSession();}
    } finally { if(requestGeneration===generation.current)setLoading(false); }
  }, [token,siteId,startDate,endDate,endSession]);
  useEffect(() => { void refresh(); return ()=>{generation.current++;}; }, [refresh]);
  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? 'Неизвестный объект';
  const visible = useMemo(() => reports.filter(r => (siteId === 'all' || r.site_id === siteId)
    && (!startDate || r.data.work_date >= startDate) && (!endDate || r.data.work_date <= endDate)),
    [reports, siteId, startDate, endDate]);
  const received = visible.filter(r => r.status === 'submitted' || r.status === 'reviewed');
  const needsReview = visible.filter(r => r.status === 'submitted').length;
  const incidents = '—'; // Endpoint is not implemented yet: do not invent values.
  const volumes = (summary?.volumes ?? []).filter(v => siteId === 'all' || v.site_id === siteId);
  const pageTitle = labels[page];
  if (!token) return <Login onSuccess={setToken} demo={demo}/>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">▣</span> СтройКонтроль</div>
      <nav aria-label="Основная навигация">{(Object.keys(labels) as Page[]).filter(key=>key!=='admin'||profile?.role==='admin').map((key, index) =>
        <button key={key} className={page === key ? 'nav-item active' : 'nav-item'} onClick={() => setPage(key)}>
          <span className="nav-icon" aria-hidden="true">{['▦','▤','▣','▥','✧','⚙'][index]}</span>{labels[key]}</button>)}</nav>
      <div className="sidebar-foot"><span className="online-dot"/> Серверные данные</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="mobile-brand">▣ СтройКонтроль</span><span className="topbar-right">{profile?.login || 'Пользователь'} <button className="quiet" onClick={() => {generation.current++;void http('/auth/logout',token,{method:'POST'}).catch(()=>{});setToken(null);setProfile(null);setReports([]);setSummary(null);setSelected(null);setSites([]);setPage('overview');setSiteId('all');setStartDate('');setEndDate('');setError('');setLoading(false);}}>Выйти</button></span></header>
      <main className="content">
        {demo&&<div className="card"><strong>ДЕМО · локальная база</strong><p>{demo.notice}</p></div>}
        <div className="heading"><div><h1>{pageTitle}</h1><p>Статистика формируется из подтверждённых записей сервера.</p></div><button className="secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Обновление…' : '↻ Обновить'}</button></div>
        {error && <div className="error" role="alert">Ошибка API: {error}</div>}
        {page!=='admin' && <div className="filters"><label>Объект<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="all">Все объекты</option>{sites.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          <label>С<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>По<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div>}
        {page === 'admin' ? <AdminPanel token={token} onExpired={endSession}/> : page === 'ai' ? <AnalysisPanel key={JSON.stringify([siteId,startDate,endDate])} token={token} siteId={siteId} fromDate={startDate} toDate={endDate} onSource={id=>{const epoch=generation.current;void http<Report>('/reports/'+id,token).then(r=>{if(epoch===generation.current)setSelected(r);}).catch(e=>{if(epoch===generation.current)setError(e.message);});}}/> : <>
          {page !== 'reports' && <section className="metric-grid">
            <div className="metric"><span>Объектов</span><strong>{siteId==='all' ? sites.length : 1}</strong><small>Доступные объекты</small></div>
            <div className="metric"><span>Полученных отчётов</span><strong>{received.length}</strong><small>Доставлено или проверено</small></div>
            <div className="metric"><span>Ожидают проверки</span><strong>{needsReview}</strong><small>Статус «Доставлен»</small></div>
            <div className="metric"><span>Инциденты</span><strong>{incidents}</strong><small>После подключения API событий</small></div>
          </section>}
          {(page==='overview' || page==='analytics') && <section className="dashboard-grid">
            <div className="card"><h2>Выполненные объёмы</h2><p className="muted">По видам работ и отдельным единицам измерения</p>
              {volumes.length ? <div className="volume-list">{volumes.map((v,i) => <div key={i} className="volume-row"><div><strong>{v.work_type}</strong><small>{siteName(v.site_id)} · {v.unit}</small></div><b>{v.quantity} {v.unit}</b></div>)}</div> : <p className="empty">Нет подтверждённых количественных работ.</p>}
              <p className="footnote">Сводка и журнал используют одинаковые фильтры объекта и периода.</p></div>
            <div className="card"><h2>Контроль отчётности</h2><p className="muted">Полученные отчёты по текущему фильтру</p>
              <ul className="daily-chart" aria-label="Количество отчётов по датам">{summary?.daily.map(day=><li key={day.date}><span>{dateText(day.date)}</span><meter min={0} max={Math.max(...summary.daily.map(d=>d.report_count),1)} value={day.report_count}/><b>{day.report_count}</b></li>)}</ul>
              <div className="big-number">{received.length}<span> получено</span></div>
              <p className="footnote">Просрочки не рассчитываются, пока не согласованы графики и ожидаемые отчёты (SPEC-00 B01/B02).</p></div>
          </section>}
          {(page==='overview' || page==='objects') && <section className="card"><h2>Объекты</h2><div className="site-grid">{sites.filter(s=>siteId==='all'||s.id===siteId).map(s=><button className="site-tile" key={s.id} onClick={()=>{setSiteId(s.id);setPage('reports')}}><div className="site-avatar">▧</div><strong>{s.name}</strong><span>{reports.filter(r=>r.site_id===s.id).length} отчётов в журнале</span></button>)}{!sites.length && <p className="empty">Нет назначенных объектов.</p>}</div></section>}
          {(page==='overview' || page==='reports') && <section className="card"><div className="section-heading"><h2>{page==='reports'?'Журнал отчётов':'Последние отчёты'}</h2>{page==='overview'&&<button className="link-button" onClick={()=>setPage('reports')}>Все отчёты →</button>}</div>
            {visible.length ? <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Объект</th><th>Тип</th><th>Статус</th><th>Версия</th></tr></thead><tbody>{visible.slice(0,page==='overview'?8:visible.length).map(r=><tr key={r.id} tabIndex={0} onClick={()=>setSelected(r)} onKeyDown={e=>{if(e.key==='Enter')setSelected(r)}}><td>{dateText(r.data.work_date)}</td><td>{siteName(r.site_id)}</td><td>{r.data.kind==='no_work'?'Без работ':'Работы'}</td><td><span className={`badge ${r.status}`}>{statusLabels[r.status]}</span></td><td>№{r.revision}</td></tr>)}</tbody></table></div> : <p className="empty">Отчёты по выбранным условиям отсутствуют.</p>}</section>}
        </>}
      </main>
      <footer>СтройКонтроль · MVP · Источник данных: API заказчика</footer>
      <nav className="bottom-nav" aria-label="Мобильная навигация">{(['overview','objects','reports','analytics','ai',...(profile?.role==='admin'?['admin']:[])] as Page[]).map(key=><button key={key} className={page===key?'active':''} onClick={()=>setPage(key)}>{labels[key]}</button>)}</nav>
    </div>
    {selected && <ReportDetails key={selected.id} report={selected} token={token} role={profile?.role||''} siteName={siteName(selected.site_id)} onClose={()=>setSelected(null)} onChange={r=>{setSelected(r);void refresh();}}/>}
  </div>;
}
