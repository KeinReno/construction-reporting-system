import {ApiError,BASE,http,type Profile,type Report} from '../api';
import {type Payload,type Pending} from './model';
import {queueFor,savePending} from './store';
export const CAPABILITIES={'X-Report-Capabilities':'report-extras-v2'};
type Identity={token:string;profile:Profile};
class Conflict extends Error {}
export function samePayload(a:unknown,b:unknown):boolean {
  function normalize(value:unknown):unknown {
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,v])=>v!==undefined&&!(v===null&&['crew','materials','incidents','financial_entries','equipment','next_shift_plans'].includes(key))).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,key==='required_photo_ids'&&Array.isArray(v)?[...v].sort():['quantity','hours'].includes(key)&&typeof v==='string'?v.replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,''):normalize(v)]));
    return value;
  }
  return JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
}
async function deliver(item:Pending,identity:Identity,valid:()=>boolean):Promise<Report>{
  function check(){if(!valid())throw new Error('Сеанс изменился');}
  async function call<T>(path:string,options?:RequestInit){check();const result=await http<T>(path,identity.token,{...options,headers:{...CAPABILITIES,...options?.headers}});check();return result;}
  let remote:Report;
  try{remote=await call<Report>('/reports/by-client/'+item.id);}catch(error){if(!(error instanceof ApiError)||error.status!==404)throw error;remote=await call<Report>('/reports',{method:'POST',body:JSON.stringify(item.payload)});}
  if(remote.author_id!==identity.profile.id)throw new Conflict('Этот отчёт принадлежит другому сотруднику');
  const payload=item.payload as Payload;
  if(item.form.base&&remote.revision===item.form.base.revision&&['draft','needs_revision'].includes(remote.status)){
    remote=await call<Report>('/reports/'+remote.id,{method:'PATCH',body:JSON.stringify({expected_revision:item.form.base.revision,reason:'Исправление по замечанию проверяющего',data:payload})});
  }else if(item.form.base&&remote.revision!==item.form.base.revision+1){throw new Conflict('Версия отчёта изменилась. Обновите историю перед исправлением');}
  if(!samePayload(remote.data,payload))throw new Conflict('Сохранённый отчёт отличается от отправляемого. Требуется проверка');
  if(['submitted','reviewed'].includes(remote.status)&&remote.receipt_id)return remote;
  if(remote.status!=='draft')throw new Conflict('Отчёт уже возвращён или изменён. Обновите историю');
  for(const photo of item.form.photos){
    check();const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await photo.blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');check();
    const response=await fetch(`${BASE}/reports/${remote.id}/attachments/${photo.id}`,{method:'PUT',headers:{Authorization:`Bearer ${identity.token}`,'Content-Type':photo.blob.type,'X-Content-SHA256':sha},body:photo.blob});check();
    if(!response.ok)throw new ApiError(response.status,response.status===401?'Войдите снова':'Не удалось отправить фото. Проверьте формат и размер');
  }
  const submitted=await call<Report>('/reports/'+remote.id+'/submit',{method:'POST',body:JSON.stringify({expected_revision:remote.revision})});
  if(!submitted.receipt_id)throw new Conflict('Сервер не подтвердил доставку. Обновите историю');
  return submitted;
}
export async function syncQueue(identity:Identity,valid:()=>boolean,onExpired:()=>void,onChange:()=>void){
  const run=async()=>{
    for(const item of await queueFor(identity.profile.id)){
      if(!valid())return;
      if(item.state!=='queued')continue;
      try{const remote=await deliver(item,identity,valid);if(!valid())return;await savePending({...item,state:'delivered',error:undefined,receipt:remote.receipt_id||undefined});onChange();}
      catch(error){if(!valid())return;
        if(error instanceof ApiError&&error.status===401){try{await savePending({...item,state:'queued',error:'Нужен повторный вход'});onChange();}finally{onExpired();}return;}
        const retry=!(error instanceof Conflict)&&(!(error instanceof ApiError)||error.status>=500||[408,429].includes(error.status));
        await savePending({...item,state:retry?'queued':'failed',error:error instanceof Error?error.message:'Не удалось отправить отчёт'});onChange();if(retry)return;
      }
    }
  };
  if(navigator.locks)await navigator.locks.request('crs-employee-sync',run);else await run();
}
