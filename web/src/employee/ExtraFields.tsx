import {today,uid,type Form} from './model';
export function ExtraFields({form:f,onChange}:{form:Form;onChange:(f:Form)=>void}){
  const update=(next:Partial<Form>)=>onChange({...f,...next});
  const photos=[...f.retainedPhotos.map((id,i)=>({id,name:`Сохранённое фото ${i+1}`})),...f.photos];
  return <div className="employee-extras">
    <label>Трансформатор<select value={f.work_area||''} onChange={e=>update({work_area:(e.target.value||null) as Form['work_area']})}><option value="">Не указан</option>{['Т1','Т2','Т1/Т2'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Погода<select value={f.weather||''} onChange={e=>update({weather:(e.target.value||null) as Form['weather']})}><option value="">Не указана</option>{['Ясно','Облачно','Дождь','Снег','Ветер','Мороз и гололёд','Жара'].map(v=><option key={v}>{v}</option>)}</select></label>
    <details open={!!f.crew||undefined}><summary>Бригада</summary><label>Кто работал<textarea value={f.crew} maxLength={1000} onChange={e=>update({crew:e.target.value})}/></label></details>
    <details open={!!f.materials.length||undefined}><summary>Материалы{f.materials.length?` · ${f.materials.length}`:''}</summary>
      {f.materials.map((m,i)=><fieldset key={m.id}><legend>Материал {i+1}</legend>
        <label>Название<input value={m.name} maxLength={200} onChange={e=>update({materials:f.materials.map(x=>x.id===m.id?{...x,name:e.target.value}:x)})}/></label>
        <label>Что произошло<select value={m.direction} onChange={e=>update({materials:f.materials.map(x=>x.id===m.id?{...x,direction:e.target.value as typeof m.direction}:x)})}><option value="mentioned">Упомянут в отчёте</option><option value="received">Поступил</option><option value="consumed">Израсходован</option></select></label>
        <div className="employee-pair"><label>Количество<input inputMode="decimal" value={m.quantity} onChange={e=>update({materials:f.materials.map(x=>x.id===m.id?{...x,quantity:e.target.value}:x)})}/></label><label>Единица<input value={m.unit} maxLength={50} onChange={e=>update({materials:f.materials.map(x=>x.id===m.id?{...x,unit:e.target.value}:x)})}/></label></div>
        <button type="button" className="employee-link" onClick={()=>update({materials:f.materials.filter(x=>x.id!==m.id)})}>Удалить материал</button>
      </fieldset>)}<button type="button" className="employee-secondary" disabled={f.materials.length>=100} onClick={()=>update({materials:[...f.materials,{id:uid(),name:'',quantity:'',unit:'',direction:'mentioned'}]})}>Добавить материал</button>
    </details>
    <details open={!!f.money.length||undefined}><summary>Деньги{f.money.length?` · ${f.money.length}`:''}</summary>
      {f.money.map((m,i)=>{const change=(part:Partial<typeof m>)=>update({money:f.money.map(x=>x.id===m.id?{...x,...part}:x)});return <fieldset key={m.id}><legend>Запись {i+1}</legend>
        <label>Вид операции<select value={m.kind} onChange={e=>change({kind:e.target.value as typeof m.kind})}><option value="expense">Расход</option><option value="funding_received">Поступление</option><option value="advance_issued">Выдача аванса</option></select></label>
        <label>На что / назначение<input value={m.category} maxLength={100} onChange={e=>change({category:e.target.value})}/></label>
        <div className="employee-pair"><label>Сумма, ₽<input inputMode="decimal" value={m.amount} onChange={e=>change({amount:e.target.value})}/></label><label>Дата операции<input type="date" value={m.date} onChange={e=>change({date:e.target.value})}/></label></div>
        <label>Пояснение<input value={m.description} maxLength={1000} onChange={e=>change({description:e.target.value})}/></label>
        {!!photos.length&&<label>Фото чека<select value={m.receipt_photo_id||''} onChange={e=>change({receipt_photo_id:e.target.value||null})}><option value="">Без чека</option>{photos.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <button type="button" className="employee-link" onClick={()=>update({money:f.money.filter(x=>x.id!==m.id)})}>Удалить запись</button>
      </fieldset>;})}<button type="button" className="employee-secondary" disabled={f.money.length>=100} onClick={()=>update({money:[...f.money,{id:uid(),kind:'expense',category:'',amount:'',date:f.date||today(),description:'',receipt_photo_id:null}]})}>Добавить денежную запись</button>
    </details>
    <details open={!!f.equipment.length||undefined}><summary>Техника{f.equipment.length?` · ${f.equipment.length}`:''}</summary>
      {f.equipment.map((m,i)=>{const change=(part:Partial<typeof m>)=>update({equipment:f.equipment.map(x=>x.id===m.id?{...x,...part}:x)});return <fieldset key={m.id}><legend>Техника {i+1}</legend><label>Вид техники<input value={m.type} maxLength={100} onChange={e=>change({type:e.target.value})}/></label><label>Отработано часов<input inputMode="decimal" value={m.hours} onChange={e=>change({hours:e.target.value})}/></label><label>Принадлежность<select value={m.hired===null?"unknown":m.hired?"hired":"own"} onChange={e=>change({hired:e.target.value==="unknown"?null:e.target.value==="hired"})}><option value="unknown">Не указана</option><option value="own">Своя</option><option value="hired">Наёмная</option></select></label><button type="button" className="employee-link" onClick={()=>update({equipment:f.equipment.filter(x=>x.id!==m.id)})}>Удалить технику</button></fieldset>;})}
      <button type="button" className="employee-secondary" disabled={f.equipment.length>=50} onClick={()=>update({equipment:[...f.equipment,{id:uid(),type:'',hours:'',hired:null}]})}>Добавить технику</button>
    </details>
    <details open={!!f.incident||undefined}><summary>Проблемы на смене</summary><label>Что произошло<textarea value={f.incident} maxLength={2000} onChange={e=>update({incident:e.target.value})}/></label></details>
    <details open={!!f.plans||undefined}><summary>План следующей смены</summary><label>Что планируется<textarea value={f.plans} maxLength={15000} onChange={e=>update({plans:e.target.value})}/></label></details>
    <details open={!!f.comment||undefined}><summary>Комментарий</summary><label>Дополнительное пояснение<textarea value={f.comment} maxLength={5000} onChange={e=>update({comment:e.target.value})}/></label></details>
  </div>;
}
