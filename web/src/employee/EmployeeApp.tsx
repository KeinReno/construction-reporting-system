import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ApiError,allReports,http,login,reportStatusLabels,type Profile,type Report,type Site} from '../api';
import {formatDate} from '../date';
import {blankWork,fromReport,toPayload,uid,type Form,type Pending,type Photo} from './model';
import {enqueue,openForm,queueFor,replaceForm,saveForm,savePending} from './store';
import {CAPABILITIES,syncQueue} from './sync';
import {ExtraFields} from './ExtraFields';
import './employee.css';

const KEY='crs-employee-token';
function cachedToken(){try{return sessionStorage.getItem(KEY)||'';}catch{return '';}}
function rememberToken(token:string){try{if(token)sessionStorage.setItem(KEY,token);else sessionStorage.removeItem(KEY);}catch{/* Memory session remains usable. */}}
function Icon({history=false}:{history?:boolean}){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{history?<><path d="M5 5h14v15H5zM8 9h8M8 13h8M8 17h5"/></>:<><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6"/></>}</svg>;}
function PhotoPreview({photo}:{photo:Photo}){const [url,setUrl]=useState('');useEffect(()=>{const u=URL.createObjectURL(photo.blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[photo.blob]);return <img src={url} alt={photo.name}/>;}
export default function EmployeeApp(){
  const [token,setToken]=useState(cachedToken);const tokenRef=useRef(token);tokenRef.current=token;
  const [profile,setProfile]=useState<Profile|null>(null);const [name,setName]=useState('');const [password,setPassword]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [checking,setChecking]=useState(!!token);
  const expired=useCallback((expected:string)=>{if(tokenRef.current!==expected)return;rememberToken('');setToken('');setProfile(null);setError('Войдите снова. Черновик и очередь сохранены на этом устройстве');},[]);
  useEffect(()=>{if(!token)return;let active=true;setChecking(true);
    void http<Profile>('/me',token).then(p=>{if(!active)return;if(p.role!=='foreman'){setError('Здесь вход для сотрудников. Для руководителя откройте основной кабинет');rememberToken('');setToken('');setProfile(null);}else setProfile(p);}).catch(e=>{if(active){if(e instanceof ApiError&&e.status===401)expired(token);else setError(e.message);}}).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;};
  },[token,expired]);
  async function signIn(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const value=await login(name,password);rememberToken(value);setToken(value);setPassword('');}catch(e){setError(e instanceof Error?e.message:'Не удалось войти');}finally{setBusy(false);}}
  async function signOut(){const old=token;rememberToken('');setToken('');setProfile(null);setError('');try{await http('/auth/logout',old,{method:'POST'});}catch{/* Local sign-out is immediate. */}}
  return <div className="employee-app">
    {profile&&token?<Workspace key={profile.id} token={token} profile={profile} onExpired={expired} onLogout={signOut}/>:<main className="employee-login">
      <span className="employee-brand">СтройКонтроль</span><h1>Отчёт за смену</h1><p>Вход для сотрудников</p>
      {error&&<p className="employee-error" role="alert">{error}</p>}
      {checking?<p role="status">Проверка входа…</p>:<form onSubmit={signIn}><label>Логин<input autoComplete="username" value={name} onChange={e=>setName(e.target.value)} required/></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="employee-primary" disabled={busy}>{busy?'Подключение…':'Войти'}</button></form>}
      <a href="/">Кабинет руководителя</a>
    </main>}
  </div>;
}

function Workspace({token,profile,onExpired,onLogout}:{token:string;profile:Profile;onExpired:(token:string)=>void;onLogout:()=>void}){
  const [sites,setSites]=useState<Site[]>([]);const [form,setForm]=useState<Form|null>(null);const [page,setPage]=useState<'form'|'history'>('form');
  const [local,setLocal]=useState<Pending[]>([]);const [reports,setReports]=useState<Report[]>([]);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState('');const [busy,setBusy]=useState(false);const [online,setOnline]=useState(navigator.onLine);const [tick,setTick]=useState(0);
  const alive=useRef(true);const syncing=useRef(false);const formElement=useRef<HTMLFormElement>(null);const owner=profile.id;
  const formVersion=useRef(1);const formNonce=useRef('');formNonce.current=form?.nonce||'';
  const persistedForm=useRef<Form|null>(null);const saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const storageWrites=useRef<Promise<void>>(Promise.resolve());const historyRequest=useRef(0);const [conflict,setConflict]=useState(false);
  const refreshLocal=useCallback(()=>{void queueFor(owner).then(rows=>{if(alive.current)setLocal(rows);}).catch(()=>{if(alive.current)setError('Не удалось открыть очередь на устройстве');});},[owner]);
  const refreshReports=useCallback(async()=>{const request=++historyRequest.current;try{const rows=await allReports(token,'');if(alive.current&&request===historyRequest.current)setReports(rows.filter(r=>r.author_id===owner));}catch(e){if(!alive.current||request!==historyRequest.current)return;if(e instanceof ApiError&&e.status===401)onExpired(token);else setError(e instanceof Error?e.message:'Не удалось обновить историю');}},[token,owner,onExpired]);
  useEffect(()=>{alive.current=true;let active=true;
    void (async()=>{let available:Site[]=[];try{available=await http<Site[]>('/sites',token);}catch(e){if(active&&e instanceof ApiError&&e.status===401){onExpired(token);return;}if(active)setError('Не удалось загрузить объекты. Черновик доступен, попробуйте обновить страницу');}
      if(!active)return;setSites(available);try{const saved=await openForm(owner,available);if(active){formVersion.current=saved.version;persistedForm.current=saved;setForm(saved);}}catch{if(active)setError('Браузер не разрешает локальное сохранение. Разрешите хранилище для этого сайта');}
    })();refreshLocal();void refreshReports();
    const onNetwork=()=>{setOnline(navigator.onLine);setTick(n=>n+1);};window.addEventListener('online',onNetwork);window.addEventListener('offline',onNetwork);
    return()=>{active=false;alive.current=false;window.removeEventListener('online',onNetwork);window.removeEventListener('offline',onNetwork);};
  },[owner,token,onExpired,refreshLocal,refreshReports]);
  useEffect(()=>{if(!form)return;if(persistedForm.current===form){setSaving('Черновик сохранён');return;}let active=true;setSaving('Сохранение…');
    const timer=setTimeout(()=>{storageWrites.current=storageWrites.current.catch(()=>{}).then(async()=>{
      if(formNonce.current!==form.nonce)return;
      const version=await saveForm(owner,{...form,version:formVersion.current});
      if(version!==null&&formNonce.current===form.nonce){formVersion.current=version;persistedForm.current=form;}
      if(active){if(version!==null)setSaving('Черновик сохранён');else{setConflict(true);setSaving('Есть изменения в другой вкладке');setError('Этот черновик изменён в другой вкладке. Скопируйте свои несохранённые правки и обновите страницу; новая версия не перезаписана');}}
    }).catch(()=>{if(active){setSaving('Не удалось сохранить');setError('Не хватает места или браузер запретил сохранение. Не закрывайте вкладку');}});},180);
    saveTimer.current=timer;return()=>{active=false;clearTimeout(timer);};
  },[owner,form]);
  useEffect(()=>{let active=true;
    const run=async()=>{if(!online||syncing.current)return;syncing.current=true;try{await syncQueue({token,profile},()=>active&&alive.current,()=>onExpired(token),()=>{refreshLocal();void refreshReports();});}catch(e){if(active)setError(e instanceof Error?e.message:'Не удалось открыть очередь');}finally{syncing.current=false;}};
    void run();const timer=setInterval(()=>{void run();},15000);return()=>{active=false;clearInterval(timer);};
  },[token,profile,online,tick,onExpired,refreshLocal,refreshReports]);
  function showError(message:string){setError(message);formElement.current?.querySelectorAll('details').forEach(d=>{d.open=true;});}
  async function submit(e:FormEvent){e.preventDefault();if(!form||busy)return;setError('');setBusy(true);
    try{const payload=toPayload(form);clearTimeout(saveTimer.current);await storageWrites.current;await enqueue(owner,{...form,version:formVersion.current},payload);const next=await openForm(owner,sites);formVersion.current=next.version;persistedForm.current=next;setForm(next);refreshLocal();setTick(n=>n+1);setNotice(online?'Отчёт сохранён и отправляется. Результат — в «Моих отчётах»':'Отчёт в очереди. Отправится после восстановления связи при открытой вкладке');setPage('history');}
    catch(e){showError(e instanceof Error?e.message:'Не удалось сохранить отчёт');}finally{setBusy(false);}
  }
  function hasInput(){return !!form&&(form.works.some(w=>w.type||w.description||w.quantity)||form.photos.length>0||form.kind==='no_work'||!!form.crew||form.money.length>0||form.materials.length>0||form.equipment.length>0||!!form.incident||!!form.plans||!!form.comment||!!form.base);}
  async function useForm(next:Form){if(!form)return;if(hasInput()&&!window.confirm('Текущий черновик будет заменён выбранным отчётом. Продолжить?'))return;clearTimeout(saveTimer.current);await storageWrites.current;await replaceForm(owner,next,{nonce:form.nonce,version:formVersion.current});if(alive.current){formVersion.current=next.version;persistedForm.current=next;setConflict(false);setForm(next);setPage('form');setNotice('');setError('');}}
  async function revise(r:Report){setBusy(true);setError('');try{const events=await http<Array<{event:string;revision:number;reason:string|null}>>(`/reports/${r.id}/history`,token);const reason=[...events].reverse().find(e=>e.event==='needs_revision'&&e.revision===r.revision)?.reason||'Замечание не указано';await useForm(fromReport(r,reason));}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть отчёт');}finally{setBusy(false);}}
  async function editLocal(item:Pending){setBusy(true);try{let next={...item.form,nonce:uid()};try{const remote=await http<Report>('/reports/by-client/'+item.id,token,{headers:CAPABILITIES});if(!['draft','needs_revision'].includes(remote.status))throw new Error('Отчёт уже доставлен. Обновите историю');next={...next,base:{id:remote.id,revision:remote.revision,data:remote.data,reason:''}};}catch(e){if(!(e instanceof ApiError&&e.status===404))throw e;}await useForm(next);}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть сохранённый отчёт');}finally{setBusy(false);}}
  async function addPhotos(files:FileList|null){if(!files||!form)return;const current=form;setBusy(true);setError('');
    try{const selected=Array.from(files);if(current.photos.length+current.retainedPhotos.length+selected.length>30)throw new Error('В одном отчёте — до 30 фото');const added:Photo[]=[];
      for(const file of selected){if(file.size>25*1024*1024)throw new Error('Фото слишком большое. Выберите файл до 25 МБ');let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('Фото не добавлены. Сохраните их в JPEG, PNG или WebP');}
        const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Не удалось обработать фото');}ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось обработать фото')),'image/jpeg',.82));if(blob.size>8*1024*1024)throw new Error('Не удалось уменьшить фото до допустимого размера');added.push({id:uid(),name:file.name,blob});
      }
      if(alive.current)setForm(f=>f?.nonce===current.nonce?{...f,photos:[...f.photos,...added]}:f);
    }catch(e){showError(e instanceof Error?e.message:'Не удалось добавить фото');}finally{setBusy(false);}
  }
  const remoteIds=new Set(reports.map(r=>r.client_report_id));
  return <>
    <header className="employee-header"><span className="employee-brand">СтройКонтроль</span><div><span>{profile.login}</span><button type="button" onClick={onLogout} className="employee-link">Выйти</button></div></header>
    <main className="employee-content"><div className="employee-title"><h1>{page==='form'?(form?.base?'Исправить отчёт':'Отчёт за смену'):'Мои отчёты'}</h1><span className="employee-connection">{online?'Есть связь':'Без сети'}</span></div>
      {error&&<p role="alert" className="employee-error">{error}</p>}{notice&&<p role="status" className="employee-notice">{notice}</p>}
      {page==='form'&&(!form?<p>Открываем сохранённый черновик…</p>:<form ref={formElement} onSubmit={submit} noValidate><fieldset disabled={busy||conflict} className="employee-editor">
        {form.base?.reason&&<aside className="employee-return"><strong>Замечание проверяющего</strong><p>{form.base.reason}</p></aside>}
        <div className="employee-pair employee-shift"><label>Объект<select value={form.site} disabled={!!form.base||busy} onChange={e=>setForm({...form,site:e.target.value})}><option value="">Выберите объект</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}{!!form.site&&!sites.some(s=>s.id===form.site)&&<option value={form.site}>Ранее выбранный объект</option>}</select></label><label>Дата смены<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>
        <div className="employee-kind" role="group" aria-label="Работы на смене"><button type="button" aria-pressed={form.kind==='work'} onClick={()=>setForm({...form,kind:'work'})}>Работали</button><button type="button" aria-pressed={form.kind==='no_work'} onClick={()=>setForm({...form,kind:'no_work'})}>Работ не было</button></div>
        {form.kind==='no_work'?<label>Почему работ не было<textarea value={form.reason} maxLength={2000} onChange={e=>setForm({...form,reason:e.target.value})}/></label>:<section aria-label="Выполненные работы" className="employee-works">
          {form.works.map((w,i)=>{const change=(part:Partial<typeof w>)=>setForm({...form,works:form.works.map(row=>row.id===w.id?{...row,...part}:row)});return <fieldset key={w.id}><legend>{form.works.length>1?`Работа ${i+1}`:'Выполненная работа'}</legend>
            <label>Вид работы<select value={w.type} onChange={e=>change({type:e.target.value})}><option value="">Выберите вид</option>{[...new Set(['Монтаж','Сварка','Бетонирование','Арматурные работы','Кладка','Электромонтаж','Покраска','Разгрузка','Уборка территории','Подготовка участка','Другое',w.type].filter(Boolean))].map(type=><option key={type}>{type}</option>)}</select></label>
            <label>Что сделано<textarea value={w.description} placeholder="Коротко опишите результат смены" maxLength={2000} onChange={e=>change({description:e.target.value})}/></label>
            <details open={!!w.quantity||undefined}><summary>Указать объём, если известен</summary><div className="employee-pair"><label>Объём<input inputMode="decimal" value={w.quantity} onChange={e=>change({quantity:e.target.value})}/></label><label>Единица<input value={w.unit} maxLength={50} onChange={e=>change({unit:e.target.value})}/></label></div></details>
            {form.works.length>1&&<button type="button" className="employee-link" onClick={()=>setForm({...form,works:form.works.filter(row=>row.id!==w.id)})}>Удалить работу</button>}
          </fieldset>;})}<button type="button" className="employee-secondary" disabled={form.works.length>=100} onClick={()=>setForm({...form,works:[...form.works,blankWork()]})}>Ещё одна работа</button>
        </section>}
        <section className="employee-photos" aria-label="Фото смены"><div className="employee-section-title"><h2>Фото</h2><span>Необязательно</span></div><label className="employee-file">Добавить фото<input type="file" accept="image/*" multiple disabled={busy} onChange={e=>{void addPhotos(e.target.files);e.target.value='';}}/></label>
          {!!form.retainedPhotos.length&&<p>{form.retainedPhotos.length} фото из отправленного отчёта сохранены</p>}
          <div className="employee-photo-grid">{form.photos.map(p=><div key={p.id}><PhotoPreview photo={p}/><button type="button" className="employee-link" disabled={busy||form.money.some(m=>m.receipt_photo_id===p.id)} onClick={()=>setForm({...form,photos:form.photos.filter(x=>x.id!==p.id)})}>{form.money.some(m=>m.receipt_photo_id===p.id)?'Используется как чек':'Убрать фото'}</button></div>)}</div>
        </section>
        <details className="employee-additional" open={!!form.base||undefined}><summary>Добавить сведения: материалы, деньги, техника</summary><ExtraFields form={form} onChange={setForm}/></details>
        <div className="employee-submit"><button className="employee-primary" disabled={busy||!form.site||conflict}>{busy?'Подождите…':online?'Отправить отчёт':'Сохранить в очередь'}</button><span role="status">{saving}</span></div>
      </fieldset></form>)}
      {page==='history'&&<section className="employee-history" aria-label="История моих отчётов"><button type="button" className="employee-secondary" onClick={()=>{setError('');void refreshReports();refreshLocal();setTick(n=>n+1);}}>Обновить</button>
        {local.filter(item=>item.state!=='delivered'||!remoteIds.has(item.id)).map(item=><article key={item.key} className="employee-report"><span>{formatDate(item.form.date)}</span><h2>{sites.find(s=>s.id===item.form.site)?.name||'Отчёт смены'}</h2><strong>{item.state==='delivered'?'Доставлен':item.state==='failed'?'Нужно исправить отправку':'В очереди'}</strong><p>{item.error|| (item.state==='queued'?'Отправится автоматически при наличии связи и открытой вкладке':'Сервер получил отчёт')}</p>{item.state==='failed'&&<button className="employee-secondary" disabled={busy} onClick={()=>{void editLocal(item);}}>Открыть и исправить</button>}{item.state==='queued'&&item.error&&<button className="employee-link" onClick={()=>{void savePending({...item,error:undefined}).then(()=>{refreshLocal();setTick(n=>n+1);});}}>Повторить отправку</button>}</article>)}
        {reports.map(r=><article key={r.id} className="employee-report" data-report-id={r.client_report_id}><div className="employee-section-title"><span>{formatDate(r.data.work_date)}</span><strong>{reportStatusLabels[r.status]}</strong></div><h2>{sites.find(s=>s.id===r.site_id)?.name||'Отчёт смены'}</h2><p>{r.data.kind==='no_work'?r.data.no_work_reason:r.data.work_entries.map(w=>w.description||w.type).join('; ')}</p>{r.status==='needs_revision'&&<button className="employee-primary" disabled={busy} onClick={()=>{void revise(r);}}>Посмотреть замечание и исправить</button>}</article>)}
        {!local.length&&!reports.length&&<div className="employee-empty"><h2>Отчётов пока нет</h2><p>Заполните первый отчёт за смену</p><button className="employee-primary" onClick={()=>setPage('form')}>Заполнить отчёт</button></div>}
      </section>}
    </main>
    <nav className="employee-nav" aria-label="Разделы сотрудника"><button aria-current={page==='form'?'page':undefined} onClick={()=>{setPage('form');setNotice('');}}><Icon/><span>Отчёт</span></button><button aria-current={page==='history'?'page':undefined} onClick={()=>{setPage('history');void refreshReports();}}><Icon history/><span>Мои отчёты</span></button></nav>
  </>;
}
