import type {Report,Site} from '../api';
export type Photo={id:string;name:string;blob:Blob};
export type Work={id:string;type:string;description:string;quantity:string;unit:string};
export type Material={id:string;name:string;quantity:string;unit:string;direction:'mentioned'|'received'|'consumed'};
export type Money={id:string;kind:'expense'|'funding_received'|'advance_issued';category:string;amount:string;date:string;description:string;receipt_photo_id:string|null};
export type Machine={id:string;type:string;hours:string;hired:boolean|null};
export type Form={id:string;nonce:string;version:number;site:string;date:string;kind:'work'|'no_work';reason:string;works:Work[];crew:string;materials:Material[];money:Money[];equipment:Machine[];incident:string;plans:string;comment:string;photos:Photo[];retainedPhotos:string[];base?:{id:string;revision:number;data:Report['data'];reason:string}};
export type Payload=Report['data'] & {client_report_id:string;site_id:string};
export type Pending={key:string;owner:string;id:string;form:Form;payload:Payload;state:'queued'|'delivered'|'failed';error?:string;receipt?:string;created:number};
export const uid=()=>crypto.randomUUID();
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function blankWork():Work{return {id:uid(),type:'',description:'',quantity:'',unit:'шт'};}
export function blankForm(sites:Site[]=[]):Form{return {id:uid(),nonce:uid(),version:1,site:sites.length===1?sites[0].id:'',date:today(),kind:'work',reason:'',works:[blankWork()],crew:'',materials:[],money:[],equipment:[],incident:'',plans:'',comment:'',photos:[],retainedPhotos:[]};}
function decimal(raw:string,scale=6):string|null {
  const v=raw.trim().replace(',','.');
  if(!new RegExp(`^\\d{1,14}(?:\\.\\d{1,${scale}})?$`).test(v))return null;
  return v;
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function kopecks(raw:string):number|null {
  const v=raw.trim().replace(',','.');if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v))return null;
  const [r,k='']=v.split('.');const value=Number(r)*100+Number(k.padEnd(2,'0'));
  return Number.isSafeInteger(value)&&value>0&&value<=10_000_000_000?value:null;
}
export function toPayload(f:Form):Payload {
  if(!f.site)throw new Error('Выберите объект');
  if(!validDate(f.date))throw new Error('Укажите дату смены');
  if(f.kind==='no_work'&&!f.reason.trim())throw new Error('Укажите, почему работ не было');
  const works=f.kind==='no_work'?[]:f.works.map(w=>{
    if(!w.type)throw new Error('Выберите вид работы');
    const quantity=w.quantity.trim()?decimal(w.quantity):null;
    if(w.quantity.trim()&&quantity===null)throw new Error('Проверьте объём работы');
    if(quantity!==null&&!w.unit.trim())throw new Error('Укажите единицу объёма');
    if(quantity===null&&!w.description.trim())throw new Error('Опишите, что сделано, или укажите объём');
    return {type:w.type,description:w.description.trim()||null,quantity,unit:quantity===null?null:w.unit.trim()};
  });
  if(f.kind==='work'&&!works.length)throw new Error('Добавьте выполненную работу');
  const materials=f.materials.map(m=>{
    const quantity=m.quantity.trim()?decimal(m.quantity):null;
    if(!m.name.trim()||(m.quantity.trim()&&quantity===null)||(quantity!==null&&!m.unit.trim())||(m.direction!=='mentioned'&&!(Number(quantity)>0)))throw new Error('Проверьте название, количество и единицу материала');
    return {name:m.name.trim(),direction:m.direction,quantity,unit:m.unit.trim()||null};
  });
  const financial_entries=f.money.map(m=>{
    const amount=kopecks(m.amount);
    if(amount===null||!m.category.trim()||!validDate(m.date))throw new Error('Проверьте сумму, назначение и дату денежной записи');
    return {id:m.id,kind:m.kind,amount_kopecks:amount,category:m.category.trim(),operation_date:m.date,description:m.description.trim()||null,receipt_photo_id:m.receipt_photo_id};
  });
  const equipment=f.equipment.map(m=>{if(m.hired===null)throw new Error('Укажите принадлежность техники: своя или наёмная');const hours=decimal(m.hours,2);if(!m.type.trim()||!hours||!(Number(hours)>0)||Number(hours)>=1_000_000)throw new Error('Укажите вид техники и часы работы');return {type:m.type.trim(),hours,hired:m.hired};});
  const photos=[...f.retainedPhotos,...f.photos.map(p=>p.id)];
  if(photos.length>30)throw new Error('В одном отчёте можно сохранить до 30 фото');
  if(financial_entries.some(e=>e.receipt_photo_id&&!photos.includes(e.receipt_photo_id)))throw new Error('Чек денежной записи должен остаться в отчёте');
  const previous=f.base?.data;
  const incidents=previous?.incidents&&f.incident===previous.incidents.map(i=>i.description).join('\n')?previous.incidents:f.incident.split('\n').filter(s=>s.trim()).map(description=>({description}));
  const plans=previous?.next_shift_plans&&f.plans===previous.next_shift_plans.join('\n')?previous.next_shift_plans:f.plans.split('\n').map(s=>s.trim()).filter(Boolean);
  if(plans.length>30||plans.some(p=>p.length>500))throw new Error('В плане — до 30 пунктов, каждый до 500 символов');
  if(incidents.length>100)throw new Error('В отчёте — до 100 событий');
  return {...f.base?.data,client_report_id:f.id,site_id:f.site,work_date:f.date,kind:f.kind,
    no_work_reason:f.kind==='no_work'?f.reason.trim():null,work_entries:works as Report['data']['work_entries'],
    required_photo_ids:photos,crew:f.crew.trim()||null,materials,financial_entries,equipment,
    incidents,next_shift_plans:plans,comment:f.comment.trim()||null};
}
export function fromReport(r:Report,reason:string):Form {
  const d=r.data;
  return {...blankForm(),id:r.client_report_id,site:r.site_id,date:d.work_date,kind:d.kind,reason:d.no_work_reason||'',crew:d.crew||'',
    works:d.work_entries.map(w=>({id:uid(),type:w.type,description:w.description||'',quantity:w.quantity??'',unit:w.unit||'шт'})),
    materials:(d.materials||[]).map(m=>({id:uid(),name:m.name,quantity:m.quantity??'',unit:m.unit||'',direction:m.direction||'mentioned'})),
    money:(d.financial_entries||[]).map(m=>({id:m.id,kind:m.kind,category:m.category,amount:(m.amount_kopecks/100).toFixed(2),date:m.operation_date,description:m.description||'',receipt_photo_id:m.receipt_photo_id||null})),
    equipment:(d.equipment||[]).map(m=>({id:uid(),type:m.type,hours:m.hours,hired:m.hired})),
    incident:(d.incidents||[]).map(i=>i.description).join('\n'),plans:(d.next_shift_plans||[]).join('\n'),comment:d.comment||'',retainedPhotos:d.required_photo_ids||[],
    base:{id:r.id,revision:r.revision,data:d,reason}};
}
