import { useCallback,useEffect,useRef,useState } from 'react';
import { ApiError,http,type Site } from './api';
type User={id:string;login:string;role:'admin'|'manager'|'foreman';active:boolean};
type Assignment={id:string;user_id:string;site_id:string};
type Audit={id:string;action:string;target_id:string;details:Record<string,unknown>;occurred_at:string};
const roles={foreman:'Бригадир',manager:'Руководитель',admin:'Администратор'};
const actions:Record<string,string>={user_created:'Пользователь создан',user_updated:'Пользователь обновлён',site_created:'Объект создан',access_granted:'Доступ выдан',access_revoked:'Доступ отозван'};
export function AdminPanel({token,onExpired}:{token:string;onExpired:()=>void}) {
  const [users,setUsers]=useState<User[]>([]),[sites,setSites]=useState<Site[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[audit,setAudit]=useState<Audit[]>([]);
  const [name,setName]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<User['role']>('foreman'),[siteName,setSiteName]=useState('');
  const [userId,setUserId]=useState(''),[siteId,setSiteId]=useState(''),[resetUser,setResetUser]=useState(''),[newPassword,setNewPassword]=useState('');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef(true);
  const fail=useCallback((e:unknown)=>{if(!active.current)return;if(e instanceof ApiError && e.status===401){onExpired();return;}setError(e instanceof Error?e.message:'Ошибка управления');},[onExpired]);
  const load=useCallback(async()=>{
    const [u,s,a,h]=await Promise.all([http<User[]>('/admin/users',token),http<Site[]>('/sites',token),http<Assignment[]>('/admin/assignments',token),http<Audit[]>('/admin/audit',token)]);
    if(active.current){setUsers(u);setSites(s);setAssignments(a);setAudit(h);}
  },[token]);
  useEffect(()=>{active.current=true;void load().catch(fail);return ()=>{active.current=false;};},[load,fail]);
  async function execute(action:()=>Promise<void>) {
    setBusy(true);setError('');setMessage('');
    try {await action();if(active.current){setMessage('Изменения сохранены');await load();}}
    catch(e){fail(e);}finally{if(active.current)setBusy(false);}
  }
  return <section aria-label="Администрирование">
    <p>Пользователи, объекты и разрешения. Отзыв доступа не удаляет историю отчётов.</p>
    <p className="muted">Отправители: {users.filter(u=>u.role==='foreman'&&u.active).length} из 5 планируемых. Проверяющий заказчик: {users.filter(u=>u.role==='manager'&&u.active).length}. Логины и доступы к объектам настраиваются здесь.</p>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="dashboard-grid">
      <form className="card analysis-form" onSubmit={e=>{e.preventDefault();void execute(async()=>{await http('/admin/users',token,{method:'POST',body:JSON.stringify({login:name,password,role})});setName('');setPassword('');});}}>
        <h2>Новый пользователь</h2><fieldset disabled={busy}><label>Логин нового пользователя<input required maxLength={128} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Первичный пароль<input required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label htmlFor="admin-role">Роль</label><select id="admin-role" value={role} onChange={e=>setRole(e.target.value as User['role'])}>{Object.entries(roles).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select>
        <button className="primary">Создать пользователя</button></fieldset>
      </form>
      <form className="card analysis-form" onSubmit={e=>{e.preventDefault();void execute(async()=>{await http('/admin/sites',token,{method:'POST',body:JSON.stringify({name:siteName})});setSiteName('');});}}>
        <h2>Новый объект</h2><fieldset disabled={busy}><label>Название объекта<input required maxLength={255} value={siteName} onChange={e=>setSiteName(e.target.value)}/></label><button className="primary">Создать объект</button></fieldset>
      </form>
    </div>
    <section className="card"><h2>Пользователи</h2><div className="table-wrap"><table><thead><tr><th>Логин</th><th>Роль</th><th>Доступ</th><th>Действие</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.login}</td><td>{roles[u.role]}</td><td>{u.active?'Активен':'Отключён'}</td><td>{u.role!=='admin'&&<button disabled={busy} className="quiet" onClick={()=>void execute(async()=>{await http('/admin/users/'+u.id,token,{method:'PATCH',body:JSON.stringify({active:!u.active})});})}>{u.active?'Отключить':'Включить'}</button>}</td></tr>)}</tbody></table></div></section>
    <div className="dashboard-grid"><form className="card analysis-form" onSubmit={e=>{e.preventDefault();void execute(async()=>{await http('/admin/assignments',token,{method:'POST',body:JSON.stringify({user_id:userId,site_id:siteId})});});}}>
      <h2>Доступ к объекту</h2><fieldset disabled={busy}><label htmlFor="grant-user">Пользователь</label><select id="grant-user" required value={userId} onChange={e=>setUserId(e.target.value)}><option value="">Выберите</option>{users.filter(u=>u.role!=='admin'&&u.active).map(u=><option key={u.id} value={u.id}>{u.login}</option>)}</select>
      <label htmlFor="grant-site">Объект</label><select id="grant-site" required value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Выберите</option>{sites.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select><button className="primary">Выдать доступ</button></fieldset>
    </form><form className="card analysis-form" onSubmit={e=>{e.preventDefault();void execute(async()=>{await http('/admin/users/'+resetUser,token,{method:'PATCH',body:JSON.stringify({password:newPassword})});setNewPassword('');});}}>
      <h2>Смена пароля</h2><p className="muted">Все сессии пользователя будут завершены. После смены собственного пароля потребуется повторный вход.</p>
      <fieldset disabled={busy}><label htmlFor="reset-user">Учётная запись</label><select id="reset-user" required value={resetUser} onChange={e=>setResetUser(e.target.value)}><option value="">Выберите</option>{users.map(u=><option value={u.id} key={u.id}>{u.login}</option>)}</select>
      <label>Новый пароль<input required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button className="primary">Сменить пароль</button></fieldset>
    </form></div>
    <section className="card"><h2>Выданные доступы</h2><ul>{assignments.map(a=><li key={a.id}>{users.find(u=>u.id===a.user_id)?.login||a.user_id} → {sites.find(s=>s.id===a.site_id)?.name||a.site_id} <button disabled={busy} className="quiet" onClick={()=>void execute(async()=>{await http('/admin/assignments/'+a.id,token,{method:'DELETE'});})}>Отозвать доступ</button></li>)}</ul>{!assignments.length&&<p>Назначений пока нет.</p>}</section>
    <section className="card"><h2>Журнал управления</h2><ol>{audit.map(e=><li key={e.id}>{actions[e.action]||e.action} · {users.find(u=>u.id===e.target_id)?.login||sites.find(s=>s.id===e.target_id)?.name||''} · {new Date(e.occurred_at).toLocaleString('ru-RU')}</li>)}</ol></section>
  </section>;
}
