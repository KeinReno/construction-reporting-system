const WORK_CATALOG=[['Монтаж металлоконструкций','шт'],['Кладка перегородок','м²'],['Прокладка кабеля','м'],['Устройство покрытия','м²'],['Установка окон','шт'],['Уборка территории',''],['Подготовка участка',''],['Планировка грунта',''],['Другое','']];
const baseInitial=initial;
initial=function(){const row=baseInitial();row.works=[{id:'w1',catalog:'Монтаж металлоконструкций',other:'',note:row.work,quantity:row.quantity,unit:row.unit}];row.materials=[];row.equipment=[];row.photos=[];row.receipt=null;row.crewConfirmed=false;return row};
function nid(){return 'id'+Math.random().toString(36).slice(2,8)}
function unitFor(catalog){const found=WORK_CATALOG.find(row=>row[0]===catalog);return found?found[1]:''}
function catalogOf(name){return WORK_CATALOG.some(row=>row[0]===name)?name:'Другое'}
function blankWork(){return {id:nid(),catalog:'Монтаж металлоконструкций',other:'',note:'',quantity:'',unit:'шт'}}
function hydrate(raw){
 const s=Object.assign(initial(),raw||{});
 if(!raw||!Array.isArray(raw.works)||!raw.works.length){
  const catalog=catalogOf(s.work||'');
  s.works=[{id:'w1',catalog,other:catalog==='Другое'?s.work||'':'',note:s.work||'',quantity:s.quantity||'',unit:s.unit||unitFor(catalog)}];
 }
 s.materials=Array.isArray(s.materials)?s.materials:[];
 s.equipment=Array.isArray(s.equipment)?s.equipment:[];
 s.photos=Array.isArray(s.photos)?s.photos:[];
 s.crewConfirmed=!!s.crewConfirmed;
 return s;
}
state=hydrate(state);
function workTitle(work){return work.catalog==='Другое'?(work.other.trim()||'Другое'):work.catalog}
function syncFlat(){
 const work=state.works&&state.works[0];
 if(!work)return;
 state.work=work.note.trim()||workTitle(work);
 state.quantity=work.quantity||'';
 state.unit=work.unit||'';
}
function applyCatalog(work,catalog){
 const next=unitFor(catalog);
 if(work.unit!==next)work.quantity='';
 work.catalog=catalog;
 work.unit=next;
}
function captureField(el){
 if(el.name==='crewConfirmed'){state.crewConfirmed=!!el.checked;save();return true}
 const materialId=el.dataset.material;
 if(materialId){const row=state.materials.find(item=>item.id===materialId);if(!row)return false;row[el.dataset.field]=el.value;save();return true}
 const equipId=el.dataset.equip;
 if(equipId){const row=state.equipment.find(item=>item.id===equipId);if(!row)return false;if(el.dataset.field==='hired'){row.hired=!!el.checked;save();return true}row[el.dataset.field]=el.value;save();return true}
 const workId=el.dataset.work;
 if(!workId)return false;
 const work=state.works.find(item=>item.id===workId);
 if(!work)return false;
 if(el.dataset.field==='catalog'){applyCatalog(work,el.value);syncFlat();save();render();return true}
 work[el.dataset.field]=el.value;
 syncFlat();save();
 return true;
}
function validation(){
 if(!state.crewConfirmed)return 'Подтвердите, что состав бригады актуален.';
 if(state.kind==='no_work'&&!state.reason.trim())return 'Укажите причину отсутствия работ.';
 if(state.kind==='work'){
  if(!state.works.length)return 'Добавьте выполненную работу.';
  for(const work of state.works){
   if(work.catalog==='Другое'&&!work.other.trim())return 'Для пункта «Другое» напишите, что это была за работа.';
   if(!work.unit){if(String(work.quantity||'').trim())return 'У этой работы нет численной единицы. Очистите объём или выберите измеряемый вид.';continue}
   if(String(work.quantity||'').trim()&&(!/^\d+([.,]\d{1,6})?$/.test(work.quantity)||Number(String(work.quantity).replace(',','.'))<=0))return 'Укажите положительный объём или оставьте его пустым.';
  }
 }
 for(const row of state.materials){
  const started=row.name.trim()||row.quantity.trim()||row.unit.trim();
  if(started&&(!row.name.trim()||!/^\d+([.,]\d{1,6})?$/.test(row.quantity)||Number(String(row.quantity).replace(',','.'))<=0||!row.unit.trim()))return 'Завершите строку материала или удалите её. Направление без догадки уже выбрано отдельно.';
 }
 for(const row of state.equipment){
  const started=row.kind.trim()||row.hours.trim();
  if(started&&(!row.kind.trim()||!/^\d+([.,]\d{1,2})?$/.test(row.hours)||Number(String(row.hours).replace(',','.'))<=0))return 'Укажите вид техники и часы или удалите строку. Стоимость не считается.';
 }
 if(state.amount&&(!/^\d+([.,]\d{1,2})?$/.test(state.amount)||Number(String(state.amount).replace(',','.'))<=0||!state.expense.trim()))return 'Проверьте сумму расхода и укажите, на что потрачено.';
 return '';
}
function photoBlock(){
 const own=state.photos.filter(photo=>photo.dataUrl);
 const receipt=state.receipt&&state.receipt.dataUrl?`<img src="${state.receipt.dataUrl}" alt="${esc(state.receipt.name||'Чек')}">`:'';
 if(!own.length&&!receipt)return typeof gallery==='function'?gallery():'';
 return `<div class="gallery">${own.map(photo=>`<img src="${photo.dataUrl}" alt="${esc(photo.name||'Фото работы')}">`).join('')}${receipt}</div><div class="caption">${own.length?'Фото выбраны в этом браузере.':'Иллюстрации для макета.'}</div>`;
}
summary=function(){
 syncFlat();
 const works=state.kind==='work'?state.works.map(work=>{const qty=String(work.quantity||'').trim();return `<div class="work-line"><span>${esc(workTitle(work))}${work.note&&work.note!==workTitle(work)?` · ${esc(work.note)}`:''}</span>${qty?`<strong>${esc(qty)} ${esc(work.unit)}</strong>`:''}</div>`}).join(''):`<p>${esc(state.reason)}</p>`;
 const materials=state.materials.filter(row=>row.name.trim()).map(row=>`<p>${esc(row.name)} · ${row.direction==='in'?'поступило':row.direction==='out'?'израсходовано':'направление не указано'} · ${esc(row.quantity)} ${esc(row.unit)}</p>`).join('');
 const equipment=state.equipment.filter(row=>row.kind.trim()).map(row=>`<p>${esc(row.kind)} · ${esc(row.hours)} ч${row.hired?' · наёмная':''}. Стоимость не считается.</p>`).join('');
 return `<div class="review-summary"><h3>${state.kind==='work'?'Выполненные работы':'Работ не было'}</h3>${works}${state.kind==='work'?photoBlock():''}</div><div class="review-summary"><h3>Бригада</h3><p>${esc(state.crew)||'Состав не указан'}${state.crewConfirmed?' · состав подтверждён':' · состав не подтверждён'}</p></div>${state.problem?`<div class="review-summary"><h3>Проблема на объекте</h3><p>${esc(state.problem)}</p></div>`:''}${materials?`<div class="review-summary"><h3>Материалы</h3>${materials}</div>`:''}${equipment?`<div class="review-summary"><h3>Техника</h3>${equipment}</div>`:''}${state.amount?`<div class="review-summary"><h3>Расход</h3><div class="work-line"><span>${esc(state.expense)}</span><strong>${money()}</strong></div><p>29/10/2026 · ${state.receipt?'чек приложен':'чек не приложен'}</p>${state.receipt&&state.receipt.dataUrl?`<img class="receipt-preview" src="${state.receipt.dataUrl}" alt="${esc(state.receipt.name||'Чек')}">`:''}</div>`:''}${state.plan?`<div class="review-summary"><h3>План следующей смены</h3><p>${esc(state.plan)}</p></div>`:''}`;
};
function workEditor(work,index){
 const options=WORK_CATALOG.map(([name])=>`<option ${work.catalog===name?'selected':''}>${esc(name)}</option>`).join('');
 const measured=!!work.unit;
 const photos=state.photos.filter(photo=>photo.workId===work.id&&photo.dataUrl).map(photo=>`<figure><img src="${photo.dataUrl}" alt="${esc(photo.name||'Фото работы')}"><button type="button" data-drop-photo="${photo.id}">Удалить</button></figure>`).join('');
 return `<article class="work-row"><div class="row-head"><h3>Работа ${index+1}</h3>${state.works.length>1?`<button type="button" data-drop-work="${work.id}">Удалить</button>`:''}</div><label class="field">Вид работы<select data-work="${work.id}" data-field="catalog">${options}</select></label>${work.catalog==='Другое'?`<label class="field">Что именно *<input data-work="${work.id}" data-field="other" value="${esc(work.other)}" maxlength="300"></label>`:''}<label class="field">Пояснение${index===0?'':' к работе'}<input ${index===0?'name="work"':''} data-work="${work.id}" data-field="note" value="${esc(work.note)}" maxlength="300"></label>${measured?`<div class="fields-two"><label class="field">Объём, если измеряли<input ${index===0?'name="quantity"':''} data-work="${work.id}" data-field="quantity" value="${esc(work.quantity)}" inputmode="decimal" maxlength="15"></label><label class="field">Единица<input ${index===0?'name="unit"':''} data-work="${work.id}" data-field="unit" value="${esc(work.unit)}" readonly></label></div>`:`<p class="caption">Без численного объёма: для этого вида единица не задаётся.</p>`}<label class="file">Фото этой работы<input type="file" accept="image/*" data-photo-for="${work.id}"></label><div class="photo-row">${photos}</div></article>`;
}
function materialEditor(row){
 const direction=value=>`<option value="${value}" ${row.direction===value?'selected':''}>${value==='in'?'Поступило':value==='out'?'Израсходовано':'Направление не указано'}</option>`;
 return `<article class="work-row"><label class="field">Материал<input data-material="${row.id}" data-field="name" value="${esc(row.name)}" maxlength="120"></label><label class="field">Движение<select data-material="${row.id}" data-field="direction">${direction('in')}${direction('out')}${direction('unknown')}</select></label><div class="fields-two"><label class="field">Количество<input data-material="${row.id}" data-field="quantity" value="${esc(row.quantity)}" inputmode="decimal" maxlength="15"></label><label class="field">Единица<input data-material="${row.id}" data-field="unit" value="${esc(row.unit)}" maxlength="20"></label></div><button type="button" data-drop-material="${row.id}">Удалить материал</button></article>`;
}
function equipEditor(row){
 return `<article class="work-row"><label class="field">Вид техники<input data-equip="${row.id}" data-field="kind" value="${esc(row.kind)}" maxlength="120"></label><label class="field">Часы<input data-equip="${row.id}" data-field="hours" value="${esc(row.hours)}" inputmode="decimal" maxlength="8"></label><label class="offline"><input type="checkbox" data-equip="${row.id}" data-field="hired" ${row.hired?'checked':''}>Наёмная техника</label><p class="caption">Стоимость не считается: тариф не задан.</p><button type="button" data-drop-equip="${row.id}">Удалить технику</button></article>`;
}
const baseForm=formPage;
formPage=function(){
 if(!['draft','needs_revision'].includes(state.status)||state.transport==='queued')return baseForm();
 state=hydrate(state);
 const open=name=>state[name]&&state[name].length?'open':'';
 return `<div class="form-top"><a href="#app/today">← Сегодня</a><span class="save-state">${storageOK?'Сохранено в браузере':'Только в памяти'}</span></div><h1>${state.status==='needs_revision'?'Уточнение смены':'Отчёт за смену'}</h1><p>Северный · корпус 2 / 29 октября</p>${state.feedback?`<div class="warn-note"><strong>Комментарий заказчика</strong><p>${esc(state.feedback)}</p></div>`:''}<form id="shift-form"><section class="form-section"><h2>Объект и бригада</h2><p>Объект назначен: Северный · корпус 2. Рабочая дата: 29/10/2026.</p><label class="field">Кто работал<input name="crew" value="${esc(state.crew)}" maxlength="300"></label><label class="offline"><input type="checkbox" name="crewConfirmed" ${state.crewConfirmed?'checked':''}>Состав бригады актуален</label><p class="caption">Предложен состав прошлой смены. Отметьте его, если он тот же.</p></section><section class="form-section"><h2>Результат дня</h2><div class="segmented"><label><input type="radio" name="kind" value="work" ${state.kind==='work'?'checked':''}><span>Работали</span></label><label><input type="radio" name="kind" value="no_work" ${state.kind==='no_work'?'checked':''}><span>Работ не было</span></label></div>${state.kind==='work'?state.works.map(workEditor).join('')+`<button type="button" id="add-work">Добавить работу</button>`:`<label class="field">Почему работы не выполнялись *<textarea name="reason" required maxlength="500">${esc(state.reason)}</textarea></label><p class="caption">Расходы, события и фото при отсутствии работ можно добавить ниже.</p>`}</section><section class="form-section"><h2>Дополнительно</h2><details ${state.problem?'open':''} ${state.status==='needs_revision'?'open':''}><summary>Проблема на объекте ${state.problem?'· добавлена':''}</summary><label class="field">Что произошло<textarea name="problem" maxlength="500">${esc(state.problem)}</textarea></label></details><details ${state.materials.length?'open':''}><summary>Материалы ${state.materials.length?'· '+state.materials.length:''}</summary>${state.materials.map(materialEditor).join('')}<button type="button" id="add-material">Добавить материал</button></details><details><summary>Расход ${state.amount?'· '+money():''}</summary><label class="field">На что потрачено<input name="expense" value="${esc(state.expense)}" maxlength="300"></label><label class="field">Сумма, ₽<input name="amount" value="${esc(state.amount)}" inputmode="decimal" maxlength="15"></label><p>Дата операции: 29/10/2026. Это расход, не поступление и не аванс.</p><label class="file">Чек к этому расходу<input type="file" accept="image/*" id="receipt-file"></label>${state.receipt&&state.receipt.dataUrl?`<figure><img class="receipt-preview" src="${state.receipt.dataUrl}" alt="${esc(state.receipt.name||'Чек')}"><button type="button" id="drop-receipt">Удалить чек</button></figure>`:'<p class="caption">Чек появится здесь, рядом с операцией.</p>'}</details><details ${open('equipment')}><summary>Техника ${state.equipment.length?'· '+state.equipment.length:''}</summary>${state.equipment.map(equipEditor).join('')}<button type="button" id="add-equip">Добавить технику</button></details><details ${state.plan?'open':''}><summary>План следующей смены ${state.plan?'· есть':''}</summary><label class="field">Что планируется<textarea name="plan" maxlength="500">${esc(state.plan)}</textarea></label></details></section><p class="error" id="form-error" role="alert"></p><div class="mobile-action"><button type="submit" class="primary">Проверить отчёт →</button><p>Ввод сохраняется в этом браузере</p></div></form>`;
};
sendNow=function(){
 syncFlat();
 if(state.status==='needs_revision')state.revision++;
 state.deliveredSnapshot=JSON.parse(JSON.stringify({kind:state.kind,work:state.work,quantity:state.quantity,unit:state.unit,crew:state.crew,reason:state.reason,problem:state.problem,amount:state.amount,expense:state.expense,plan:state.plan,works:state.works,materials:state.materials,equipment:state.equipment,photos:state.photos,receipt:state.receipt,crewConfirmed:state.crewConfirmed}));
 state.status='submitted';state.transport='delivered';state.offline=false;state.history.push(`Версия ${state.revision}: доставлена заказчику (демо).`);save();location.hash='#app/today';render();notify('Отчёт доставлен в демонстрационный кабинет заказчика.');
};
function readImage(file,done){
 if(!file)return;
 if(!file.type||!file.type.startsWith('image/')){notify('Нужен файл изображения.');return}
 if(file.size>500000){notify('Для демонстрации выберите изображение до 500 КБ.');return}
 const reader=new FileReader();
 reader.onload=()=>done({name:file.name,dataUrl:reader.result});
 reader.readAsDataURL(file);
}
function bindFormExtras(){
 document.querySelector('#add-work')?.addEventListener('click',()=>{state.works.push(blankWork());save();render()});
 document.querySelector('#add-material')?.addEventListener('click',()=>{state.materials.push({id:nid(),name:'',direction:'unknown',quantity:'',unit:''});save();render()});
 document.querySelector('#add-equip')?.addEventListener('click',()=>{state.equipment.push({id:nid(),kind:'',hours:'',hired:false});save();render()});
 document.querySelectorAll('[data-drop-work]').forEach(button=>button.addEventListener('click',()=>{state.works=state.works.filter(work=>work.id!==button.dataset.dropWork);state.photos=state.photos.filter(photo=>photo.workId!==button.dataset.dropWork);syncFlat();save();render()}));
 document.querySelectorAll('[data-drop-material]').forEach(button=>button.addEventListener('click',()=>{state.materials=state.materials.filter(row=>row.id!==button.dataset.dropMaterial);save();render()}));
 document.querySelectorAll('[data-drop-equip]').forEach(button=>button.addEventListener('click',()=>{state.equipment=state.equipment.filter(row=>row.id!==button.dataset.dropEquip);save();render()}));
 document.querySelectorAll('[data-drop-photo]').forEach(button=>button.addEventListener('click',()=>{state.photos=state.photos.filter(photo=>photo.id!==button.dataset.dropPhoto);save();render()}));
 document.querySelector('#drop-receipt')?.addEventListener('click',()=>{state.receipt=null;save();render()});
 document.querySelectorAll('[data-photo-for]').forEach(input=>input.addEventListener('change',()=>{const workId=input.dataset.photoFor;readImage(input.files[0],photo=>{state.photos.push(Object.assign({id:nid(),workId},photo));save();render()})}));
 document.querySelector('#receipt-file')?.addEventListener('change',event=>readImage(event.target.files[0],photo=>{state.receipt=photo;save();render()}));
}
