import {blankForm,type Form,type Pending} from './model';
import type {Site} from '../api';
let database:Promise<IDBDatabase>|undefined;
function open(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('crs-employee',1);r.onupgradeneeded=()=>{r.result.createObjectStore('forms');r.result.createObjectStore('queue',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};});}
async function transaction<T>(names:string[],mode:IDBTransactionMode,work:(tx:IDBTransaction,result:(value:T)=>void)=>void):Promise<T>{
  const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction(names,mode);let value:T;
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||new Error('Не удалось сохранить данные'));tx.onabort=()=>reject(tx.error||new Error('Черновик изменён в другой вкладке. Обновите страницу, сохранив свои правки'));
    try{work(tx,v=>{value=v;});}catch(error){tx.abort();reject(error);}
  });
}
export function openForm(owner:string,sites:Site[]=[]){return transaction<Form>(['forms'],'readwrite',(tx,set)=>{const s=tx.objectStore('forms');const r=s.get(owner);r.onsuccess=()=>{const form:Form=r.result||blankForm(sites);if(!r.result)s.put(form,owner);set(form);};});}
export function saveForm(owner:string,form:Form){return transaction<number|null>(['forms'],'readwrite',(tx,set)=>{const s=tx.objectStore('forms');const r=s.get(owner);r.onsuccess=()=>{if(r.result?.nonce!==form.nonce||r.result?.version!==form.version){set(null);return;}const version=form.version+1;s.put({...form,version},owner);set(version);};});}
export function replaceForm(owner:string,form:Form,expected:{nonce:string;version:number}){return transaction<void>(['forms'],'readwrite',tx=>{const s=tx.objectStore('forms');const r=s.get(owner);r.onsuccess=()=>{if(r.result?.nonce!==expected.nonce||r.result?.version!==expected.version){tx.abort();return;}s.put(form,owner);};});}
export function enqueue(owner:string,form:Form,payload:Pending['payload']){return transaction<void>(['forms','queue'],'readwrite',tx=>{
  const forms=tx.objectStore('forms');const r=forms.get(owner);r.onsuccess=()=>{if(r.result?.nonce!==form.nonce||r.result?.version!==form.version){tx.abort();return;}
    tx.objectStore('queue').put({key:owner+':'+form.id,owner,id:form.id,form,payload,state:'queued',created:Date.now()} satisfies Pending);forms.delete(owner);};
});}
export function queueFor(owner:string){return transaction<Pending[]>(['queue'],'readonly',(tx,set)=>{const r=tx.objectStore('queue').getAll();r.onsuccess=()=>set((r.result as Pending[]).filter(x=>x.owner===owner).sort((a,b)=>b.created-a.created));});}
export function savePending(item:Pending){return transaction<void>(['queue'],'readwrite',tx=>{tx.objectStore('queue').put(item);});}
