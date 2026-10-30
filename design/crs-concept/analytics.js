const PRESETS={today:['2026-10-29','2026-10-29'],week:['2026-10-26','2026-10-29'],month:['2026-10-01','2026-10-29']};
const WORK_TYPES=['Монтаж металлоконструкций','Кладка перегородок','Прокладка кабеля','Устройство покрытия','Установка окон','Уборка территории','Подготовка участка','Планировка грунта'];
let photoGallery=[];

function ui(){
 if(!state.ui)state.ui={from:'2026-10-29',to:'2026-10-29',site:'',author:'',preset:'today',q:'',status:'',workType:'Монтаж металлоконструкций',category:'',moneyKind:''};
 return state.ui;
}
function hashQuery(){return new URLSearchParams(location.hash.split('?')[1]||'')}
function filters(){const u=ui();return {from:u.from,to:u.to,site:u.site,author:u.author,kind:'',category:u.category,workType:u.workType}}
function customerReports(){
 const list=DATA.reports.slice();
 if(typeof delivered==='function'&&delivered()){
  const content=state.deliveredSnapshot?Object.assign({},state,state.deliveredSnapshot):state;
  list.push(liveReport(content));
 }
 return list;
}
function liveReport(content){
 const works=[];
 if(content.kind!=='no_work'){
  const source=Array.isArray(content.works)&&content.works.length?content.works:[{catalog:content.work||'Работа',note:'',quantity:content.quantity,unit:content.unit,other:''}];
  source.forEach(work=>{
   const type=work.catalog==='Другое'?(work.other||'Другое'):(work.catalog||work.note||'Работа');
   const qty=String(work.quantity||'').trim();
   works.push(!work.unit||!qty?{type,qty:null,unit:null,note:work.note||''}:{type,qty:Number(String(qty).replace(',','.')),unit:work.unit,note:work.note||''});
  });
 }
 const kopeks=parseKopeks(content.amount);
 const money=kopeks&&String(content.expense||'').trim()?[{kind:'expense',category:content.expense,kopeks,opDate:'2026-10-29',note:content.expense,receipt:!!content.receipt}]:[];
 const own=(content.photos||[]).filter(photo=>photo.dataUrl).map(photo=>({id:photo.id,src:photo.dataUrl,alt:photo.name||'Фото работы',basis:'same'}));
 const photos=content.kind==='no_work'?[]:own.length?own:[{id:'live-photo',src:'site.svg',alt:'Иллюстрация для макета, не фотография смены',basis:'same'}];
 const materials=(content.materials||[]).filter(row=>row.name&&String(row.quantity||'').trim()&&row.unit).map(row=>({name:row.name,direction:row.direction||'unknown',qty:Number(String(row.quantity).replace(',','.')),unit:row.unit}));
 const equipment=(content.equipment||[]).filter(row=>row.kind&&String(row.hours||'').trim()).map(row=>({kind:row.kind,hours:Number(String(row.hours).replace(',','.')),hired:!!row.hired}));
 return {id:'live-2026-10-29',siteId:'north',workDate:'2026-10-29',author:'Бригадир № 1',crew:content.crew||'Бригада № 1',revision:state.revision,status:state.status,noWork:content.kind==='no_work'?content.reason:null,works,problems:content.problem?[{text:content.problem,hours:null}]:[],materials,equipment,money,plan:content.plan?[content.plan]:[],comment:'',photos,history:state.history.slice(),source:'shift',live:true};
}
function demoFlag(){return '<p class="demo-flag">Демонстрационные данные · итоги посчитаны по записям · доставка только в этом браузере</p>'}
function freshness(){return `<p class="caption">Актуальность демонстрации: ${ruDate('2026-10-29')}, 09:40. Это не время сервера.</p>`}
function statusText(value){return value==='reviewed'?'Принят':value==='needs_revision'?'На уточнении':value==='submitted'?'На проверке':'Черновик'}
function statusHtml(value){const tone=value==='reviewed'?'good':value==='needs_revision'?'bad':value==='submitted'?'':'muted';return `<span class="status ${tone}">${statusText(value)}</span>`}
function objectTitle(){return siteById(hashQuery().get('site')||'north').name}
function sourceHref(metric,extra){
 const u=ui();const q=new URLSearchParams();
 q.set('metric',metric);q.set('from',u.from);q.set('to',u.to);q.set('site',u.site||'');q.set('author',u.author||'');q.set('preset',u.preset||'');q.set('workType',u.workType||'');
 Object.entries(extra||{}).forEach(([key,value])=>{if(value!=null&&value!=='')q.set(key,value)});
 return '#web/source?'+q.toString();
}
function recordHref(id){const q=new URLSearchParams();q.set('id',id);q.set('return',location.hash);return '#web/record?'+q.toString()}
function syncFiltersFromHash(){
 const q=hashQuery();const u=ui();
 ['from','to','site','author','preset','workType','category'].forEach(key=>{if(q.has(key))u[key]=q.get(key)||''});
}
function filterBar(extra,siteShown){
 const u=ui();
 const siteValue=siteShown!=null?siteShown:u.site;
 const sites=`<option value="">Все объекты</option>`+DATA.sites.map(site=>`<option value="${site.id}" ${siteValue===site.id?'selected':''}>${esc(site.name)}</option>`).join('');
 const authors=`<option value="">Все ответственные</option>`+[...new Set(DATA.sites.map(site=>site.lead))].map(name=>`<option ${u.author===name?'selected':''}>${esc(name)}</option>`).join('');
 const presets=Object.entries({today:'Сегодня',week:'Неделя',month:'Октябрь'}).map(([key,label])=>`<button type="button" data-preset="${key}" aria-pressed="${u.preset===key}">${label}</button>`).join('');
 return `<form id="view-filters" class="filters">${demoFlag()}<div class="presets" role="group" aria-label="Период">${presets}</div><label>С<input type="date" name="from" value="${esc(u.from)}" required></label><label>По<input type="date" name="to" value="${esc(u.to)}" required></label><label>Объект<select name="site">${sites}</select></label><label>Ответственный<select name="author">${authors}</select></label>${extra||''}</form><p class="caption">Работы, фото и события — по дате работ. Деньги — по дате операции.</p>${freshness()}`;
}
function emptyCopy(kind){
 if(kind==='zero')return 'Подтверждённый ноль: в записи явно указан объём 0.';
 if(kind==='partial')return 'Сведения неполные. Недостающее не достраивается.';
 return 'Нет записей за выбранные условия. Это не подтверждённый ноль.';
}
function metricFigure(title,body,href,kopeks){
 const value=kopeks==null?body:`<strong class="num" data-kopeks="${kopeks}">${body}</strong>`;
 const link=href?`<a class="text-link" href="${href}">Показать записи →</a>`:'';
 return `<article class="figure"><h3>${title}</h3>${value}${link}</article>`;
}
function siteRows(reports){
 const u=ui();
 return DATA.sites.filter(site=>!u.site||site.id===u.site).map(site=>{
  const latest=latestReport(reports,site.id);
  const inPeriod=periodReports(reports,Object.assign({},u,{site:site.id}));
  const problem=latest&&latest.problems[0];
  const periodNote=inPeriod.length?`За период: ${inPeriod.length}`:'За выбранный период сведений нет';
  return `<a class="site-row" href="#web/object?site=${site.id}"><span><strong>${esc(site.name)}</strong><small>${esc(site.lead)}</small></span><span><small>Последний отчёт</small><b>${latest?ruDate(latest.workDate):'—'}</b></span><span><small>Результат</small>${esc(latest?resultText(latest):'Сведений нет')}<small>${periodNote}</small></span><span>${latest?statusHtml(latest.status):'<span class="status muted">Нет данных</span>'}</span><span>${problem?`<span class="status bad">Заявлено в отчёте ${ruDate(latest.workDate)}</span><small>${esc(problem.text)}</small>`:'<small>Проблема в последнем отчёте не заявлена</small>'}</span></a>`;
 }).join('')||`<p class="empty-note">${emptyCopy('empty')}</p>`;
}
function attentionBlock(reports){
 const open=reports.filter(r=>r.status==='submitted'||r.status==='needs_revision').sort((a,b)=>b.workDate.localeCompare(a.workDate));
 const problems=DATA.sites.map(site=>latestReport(reports,site.id)).filter(r=>r&&r.problems.length);
 const cards=open.map(report=>`<article class="attention-item">${statusHtml(report.status)}<h3>${esc(siteById(report.siteId).name)}</h3><p>${esc(resultText(report))} · ${ruDate(report.workDate)}</p><a class="link-button ${report.status==='submitted'?'primary':''}" href="${report.live?'#web/report':recordHref(report.id)}">${report.status==='needs_revision'?'Открыть последнюю доставленную версию':'Проверить отчёт'}</a></article>`).join('');
 const problemCards=problems.map(report=>`<article class="attention-item"><span class="status bad">Заявлено в отчёте</span><h3>${esc(report.problems[0].text)}</h3><p>${esc(siteById(report.siteId).name)} · ${ruDate(report.workDate)}. Это запись отчёта, не признак продолжающейся аварии.</p><a class="text-link" href="${recordHref(report.id)}">Источник →</a></article>`).join('');
 const count=open.length;
 return `<aside class="attention"><h2>Требует внимания <span class="count">${count}</span></h2>${cards||'<div class="attention-item"><span class="status good">Очередь проверки свободна</span><p>Новых и возвращённых отчётов нет.</p></div>'}${problemCards}<p class="subtle">Ожидания по сменам не настроены. Отсутствие записи не считается просрочкой.</p></aside>`;
}
function periodMetrics(reports){
 const rows=periodReports(reports,ui());
 const money=periodMoney(reports,ui());
 const expenses=money.filter(row=>row.kind==='expense');
 const received=rows.length?metricFigure('Получено отчётов',`<strong class="num">${rows.length}</strong>`,sourceHref('reports')):metricFigure('Получено отчётов',`<p>${emptyCopy('empty')}</p>`);
 const expense=expenses.length?metricFigure('Заявленные расходы',formatMoney(sumKind(expenses,'expense')),sourceHref('expense'),sumKind(expenses,'expense')):metricFigure('Заявленные расходы',`<p>${emptyCopy('empty')}</p>`);
 return `<div class="totals">${received}${expense}<article class="figure"><h3>Что не смешивается</h3><p>Число отчётов не является объёмом работ. Расход не складывается с поступлением и авансом.</p></article></div>`;
}

overview=function(){
 const reports=customerReports();
 const u=ui();
 return `${filterBar()}<div class="page-head"><div><div class="eyebrow">${u.preset==='today'?'Рабочий день':'Выбранный период'}</div><h1>Ситуация на объектах</h1><p>Что поступило, что требует проверки и где за период нет сведений.</p></div></div><div class="overview-layout"><div><div class="section-heading"><h2>Объекты</h2><a href="#web/objects">Все объекты →</a></div><div class="site-list">${siteRows(reports)}</div>${periodMetrics(reports)}<p class="caption">Показатели относятся к выбранному периоду. Строка объекта показывает последний известный отчёт.</p></div>${attentionBlock(reports)}</div>`;
};
objectsPage=function(){
 const reports=customerReports();
 return `${filterBar()}<div class="page-head"><div><div class="eyebrow">Три объекта демонстрации</div><h1>Объекты</h1><p>Откройте карточку, чтобы увидеть ход работ, фото, деньги и ресурсы.</p></div></div><div class="site-list">${siteRows(reports)}</div>`;
};
objectPage=function(){
 const id=hashQuery().get('site')||'north';
 const site=siteById(id);
 const reports=customerReports();
 const latest=latestReport(reports,id);
 const period=periodReports(reports,Object.assign({},ui(),{site:id})).sort((a,b)=>b.workDate.localeCompare(a.workDate));
 const money=periodMoney(reports,Object.assign({},ui(),{site:id}));
 const problem=latest&&latest.problems[0];
 const photos=period.flatMap(report=>report.photos.filter(photo=>photo.basis!=='date').map(photo=>Object.assign({report},photo)));
 const dated=period.flatMap(report=>report.photos.filter(photo=>photo.basis==='date').map(photo=>Object.assign({report},photo)));
 const timeline=period.map(report=>`<article><small>${ruDate(report.workDate)} · ${esc(report.crew||report.author)}</small><h3>${esc(report.noWork?'Работ не было':resultText(report))}</h3><p>${report.noWork?esc(report.noWork):report.works.map(work=>work.qty==null?esc(work.type):`${esc(work.type)} · ${esc(String(work.qty))} ${esc(work.unit)}`).join('<br>')}</p>${report.problems.map(item=>`<p>Заявлено: ${esc(item.text)}${item.hours==null?' · длительность не указана':` · ${item.hours} ч`}</p>`).join('')}<a class="text-link" href="${report.live?'#web/report':recordHref(report.id)}">Открыть отчёт →</a></article>`).join('')||`<p class="empty-note">${emptyCopy('empty')}</p>${latest?`<p class="caption">Последние сведения до периода: ${ruDate(latest.workDate)}. <a class="text-link" href="${recordHref(latest.id)}">Открыть запись</a></p>`:''}`;
 const photoBlock=photos.length?`<div class="gallery">${photos.map((photo,index)=>`<button type="button" class="photo-open" data-photo="${index}" data-group="confirmed"><img src="${esc(photo.src)}" alt="${esc(photo.alt)}"></button>`).join('')}</div><div class="caption">${photos.map(photo=>`${ruDate(photo.report.workDate)} · ${BASIS[photo.basis]}`).join(' · ')}</div>`:`<p class="empty-note">Подтверждённых фото за период нет.</p>`;
 const materials=materialTable(period);
 const equipment=equipmentTable(period);
 return `${filterBar('',id)}<div class="page-head"><div><div class="eyebrow">Объект</div><h1>${esc(site.name)}</h1><p>${esc(site.lead)} · последние сведения ${latest?ruDate(latest.workDate):'—'}</p></div>${id==='north'&&delivered()?'<a class="link-button primary" href="#web/report">Отчёт за сегодня →</a>':''}</div><div class="object-grid"><div><section class="block"><h2>Сводка</h2><p>${period.length?`За период: ${period.length}.`:'За выбранный период отчётов нет.'}</p>${problem?`<p><span class="status bad">Заявлено в отчёте ${ruDate(latest.workDate)}</span> ${esc(problem.text)}</p>`:'<p>В последнем отчёте проблема не заявлена.</p>'}<p>План следующей смены: ${esc(latest&&latest.plan[0]||'не заявлен')}.</p><p class="caption">Сравнение с планом и процент готовности не показаны: плановые данные не заданы.</p></section><section class="block"><h2>Ход работ</h2><div class="timeline">${timeline}</div></section><section class="block"><h2>Фото</h2>${photoBlock}${dated.length?`<p class="caption">Отдельно, только совпадение даты: ${dated.length}. В подтверждённую галерею не включены.</p>`:''}</section><section class="block"><h2>Деньги объекта</h2>${moneyTotals(money,id)}</section><section class="block"><h2>Ресурсы</h2><h3>Материалы</h3>${materials}<h3 class="stack-gap">Техника</h3>${equipment}<h3 class="stack-gap">Бригада по отчётам</h3>${period.length?period.map(report=>`<p>${ruDate(report.workDate)} · ${esc(report.crew||'состав не указан')}</p>`).join(''):`<p class="empty-note">${emptyCopy('empty')}</p>`}</section></div><aside><div class="right-note"><h3>Состояние отчётности</h3><p>${latest?statusText(latest.status)+' · '+ruDate(latest.workDate):'Отчётов нет'}</p><p class="caption">Ожидаемые и просроченные появятся только после назначения смен.</p></div><img class="object-image" src="site.svg" alt="Иллюстрация объекта для концепции"><p class="caption">Иллюстрация макета, не фотография заказчика.</p></aside></div>`;
};

function moneyTotals(rows,site){
 const parts=['expense','income','advance'].map(kind=>{
  const found=rows.filter(row=>row.kind===kind);
  const href=sourceHref(kind,site?{site}:undefined);
  if(!found.length)return metricFigure(MONEY_KIND[kind],`<p>${emptyCopy('empty')}</p>`);
  return metricFigure(MONEY_KIND[kind],formatMoney(sumKind(found,kind)),href,sumKind(found,kind));
 }).join('');
 return `<div class="totals">${parts}</div><p class="caption">Остаток не показан: нет согласованного начального остатка. Виды операций не складываются.</p>`;
}
function materialTable(reports){
 const groups=new Map();
 for(const report of reports)for(const row of report.materials){
  const key=row.name+'\0'+row.unit;
  if(!groups.has(key))groups.set(key,{name:row.name,unit:row.unit,in:null,out:null,unknown:null});
  const group=groups.get(key);
  group[row.direction]=(group[row.direction]||0)+row.qty;
 }
 if(!groups.size)return `<p class="empty-note">${emptyCopy('empty')}</p>`;
 const cell=value=>value==null?'<span class="muted">—</span>':`<span class="num">${value}</span>`;
 return `<div class="sheet"><div class="sheet-row head"><span>Материал</span><span>Поступило</span><span>Израсходовано</span><span>Не указано</span></div>${[...groups.values()].map(row=>`<a class="sheet-row" href="${sourceHref('material',{name:row.name,unit:row.unit})}"><span>${esc(row.name)}, ${esc(row.unit)}</span><span>${cell(row.in)}</span><span>${cell(row.out)}</span><span>${cell(row.unknown)}</span></a>`).join('')}</div><p class="caption">Прочерк — записи нет. Это не ноль. Неизвестное направление не переносится в приход или расход.</p>`;
}
function equipmentTable(reports){
 const groups=new Map();
 for(const report of reports)for(const row of report.equipment){
  const key=row.kind+'\0'+report.siteId;
  if(!groups.has(key))groups.set(key,{kind:row.kind,siteId:report.siteId,hours:0,hired:row.hired});
  groups.get(key).hours+=row.hours;
 }
 if(!groups.size)return `<p class="empty-note">${emptyCopy('empty')}</p>`;
 return [...groups.values()].map(row=>`<p>${esc(row.kind)} · ${esc(siteById(row.siteId).name)} · <span class="num">${row.hours} ч</span>${row.hired?' · наёмная':''}</p>`).join('')+'<p class="caption">Стоимость не считается: тариф не задан.</p>';
}

reportsPage=function(){
 const u=ui();
 const q=u.q.trim().toLowerCase();
 let rows=periodReports(customerReports(),u);
 if(u.status)rows=rows.filter(report=>report.status===u.status);
 if(q)rows=rows.filter(report=>[report.author,resultText(report),report.noWork,report.comment,...report.works.map(work=>work.type),...report.problems.map(item=>item.text)].join(' ').toLowerCase().includes(q));
 rows.sort((a,b)=>b.workDate.localeCompare(a.workDate));
 const status=`<label>Статус<select name="status"><option value="">Все</option><option value="submitted" ${u.status==='submitted'?'selected':''}>На проверке</option><option value="needs_revision" ${u.status==='needs_revision'?'selected':''}>На уточнении</option><option value="reviewed" ${u.status==='reviewed'?'selected':''}>Принят</option></select></label>`;
 const list=rows.map(report=>`<a class="entry" href="${report.live?'#web/report':recordHref(report.id)}"><span><i>Дата</i>${ruDate(report.workDate)}</span><span><i>Объект</i>${esc(siteById(report.siteId).name)}</span><span><i>Ответственный</i>${esc(report.author)}</span><span><i>Результат</i>${esc(resultText(report))}</span><span><i>Статус</i>${statusHtml(report.status)}</span><span><i>Вложения</i>${report.photos.some(photo=>photo.basis!=='date')?'Есть':'Нет'}</span></a>`).join('');
 return `${filterBar(status)}<div class="page-head"><div><div class="eyebrow">Журнал</div><h1>Отчёты</h1></div></div><label class="search">Поиск по содержанию<input id="journal-q" value="${esc(u.q)}" placeholder="Работа, проблема, автор"></label><div class="sheet entries"><div class="entry head" aria-hidden="true"><span>Дата</span><span>Объект</span><span>Ответственный</span><span>Результат</span><span>Статус</span><span>Вложения</span></div>${list||`<p class="empty-note">${emptyCopy('empty')}</p>`}</div>`;
};
moneyPage=function(){
 const reports=customerReports();
 const rows=periodMoney(reports,ui()).sort((a,b)=>b.opDate.localeCompare(a.opDate)||b.reportId.localeCompare(a.reportId));
 const categories=[...new Set(flattenMoney(DATA.reports).map(row=>row.category))];
 const u=ui();
 const category=`<label>Категория<select name="category"><option value="">Все</option>${categories.map(item=>`<option ${u.category===item?'selected':''}>${esc(item)}</option>`).join('')}</select></label><label>Вид<select name="moneyKind"><option value="">Все</option><option value="expense" ${u.moneyKind==='expense'?'selected':''}>Расход</option><option value="income" ${u.moneyKind==='income'?'selected':''}>Поступление</option><option value="advance" ${u.moneyKind==='advance'?'selected':''}>Аванс</option></select></label>`;
 const filtered=rows.filter(row=>!u.moneyKind||row.kind===u.moneyKind);
 const list=filtered.map(row=>`<a class="entry" href="${recordHref(row.reportId)}"><span><i>Дата операции</i>${ruDate(row.opDate)}</span><span><i>Объект</i>${esc(siteById(row.siteId).name)}</span><span><i>Вид</i>${MONEY_KIND[row.kind]}</span><span><i>Категория</i>${esc(row.category)}</span><span class="num"><i>Сумма</i>${formatMoney(row.kopeks)}</span><span><i>Пояснение</i>${esc(row.note)}${row.opDate!==row.workDate?` · дата операции ${ruDate(row.opDate)}, отчёт ${ruDate(row.workDate)}`:''}</span><span><i>Чек</i>${row.receipt?'Есть':'Нет'}</span></a>`).join('');
 const notes=DATA.excludedNotes.map(note=>`<p class="warn-note">${esc(note.text)}</p>`).join('');
 return `${filterBar(category)}<div class="page-head"><div><div class="eyebrow">Журнал операций</div><h1>Деньги</h1><p>Расходы, поступления и авансы показаны раздельно.</p></div></div>${moneyTotals(rows)}${notes}<div class="sheet entries money-entries"><div class="entry head" aria-hidden="true"><span>Операция</span><span>Объект</span><span>Вид</span><span>Категория</span><span>Сумма</span><span>Пояснение</span><span>Чек</span></div>${list||`<p class="empty-note">${emptyCopy('empty')}</p>`}</div>`;
};

function analyticsWorks(reports){
 const u=ui();
 const rows=workRows(periodReports(reports,u)).filter(work=>work.type===u.workType);
 const measurable=rows.filter(work=>work.qty!=null);
 const qualitative=rows.filter(work=>work.qty==null);
 const units=[...new Set(measurable.map(work=>work.unit))];
 let body;
 if(!rows.length)body=`<p class="empty-note">${emptyCopy('empty')}</p>`;
 else if(qualitative.length&&!measurable.length)body=`<p><strong>${qualitative.length}</strong> записей без численного объёма. Сумма не выводится.</p><a class="text-link" href="${sourceHref('work',{workType:u.workType})}">Записи →</a>`;
 else if(units.length!==1)body=`<p class="empty-note">У вида разные единицы. Они не складываются.</p>`;
 else if(measurable.every(work=>work.qty===0))body=`<p><strong class="num" data-confirmed-zero="true">0 ${esc(units[0])}</strong></p><p>${emptyCopy('zero')}</p><a class="text-link" href="${sourceHref('work',{workType:u.workType})}">Записи →</a>`;
 else {
  const qty=measurable.reduce((sum,work)=>sum+work.qty,0);
  const byDay=new Map();
  measurable.forEach(work=>{const item=byDay.get(work.workDate)||{qty:0,zero:true};item.qty+=work.qty;item.zero=item.zero&&work.qty===0;byDay.set(work.workDate,item)});
  const bySite=new Map();
  measurable.forEach(work=>bySite.set(work.siteId,(bySite.get(work.siteId)||0)+work.qty));
  const maxDay=Math.max(...[...byDay.values()].map(item=>item.qty));
  body=`<p><strong class="num">${qty} ${esc(units[0])}</strong> за период</p><a class="text-link" href="${sourceHref('work',{workType:u.workType})}">Все записи вида →</a><div class="bars">${[...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,item])=>`<a class="bar-row" href="${sourceHref('work',{workType:u.workType,day})}"><span>${ruDate(day)}</span><span class="bar"><i style="width:${Math.max(8,Math.round(item.qty/maxDay*100))}%"></i></span><strong class="num">${item.qty}</strong></a>`).join('')}</div><p class="caption">Дни без этой работы не заполняются нулями.</p><h3>По объектам</h3>${[...bySite.entries()].map(([siteId,value])=>`<p>${esc(siteById(siteId).name)} · <span class="num">${value} ${esc(units[0])}</span></p>`).join('')}`;
 }
 return `<section class="block"><h2>Работы</h2>${body}</section>`;
}
function workTypeField(){
 const u=ui();
 return `<label>Вид работы<select name="workType">${WORK_TYPES.map(type=>`<option ${u.workType===type?'selected':''}>${esc(type)}</option>`).join('')}</select></label>`;
}
function analyticsMoney(reports){
 const money=periodMoney(reports,ui());
 const expenses=money.filter(row=>row.kind==='expense');
 const byCategory=new Map();
 expenses.forEach(row=>byCategory.set(row.category,(byCategory.get(row.category)||0)+row.kopeks));
 const cats=[...byCategory.entries()].sort((a,b)=>b[1]-a[1]);
 const max=cats[0]?cats[0][1]:0;
 return `<section class="block"><h2>Деньги</h2>${moneyTotals(money)}<h3>Расходы по категориям</h3>${cats.length?cats.map(([category,kopeks])=>`<a class="bar-row" href="${sourceHref('expense',{category})}"><span>${esc(category)}</span><span class="bar"><i style="width:${Math.round(kopeks/max*100)}%"></i></span><strong class="num">${formatMoney(kopeks)}</strong></a>`).join(''):`<p class="empty-note">${emptyCopy('empty')}</p>`}<h3 class="stack-gap">Поступления и авансы</h3><p>Это отдельные операции. Они не входят в сумму расходов выше.</p><p><a class="text-link" href="${sourceHref('income')}">Поступления →</a> · <a class="text-link" href="${sourceHref('advance')}">Авансы →</a></p></section>`;
}
function analyticsProblems(reports){
 const items=periodReports(reports,ui()).flatMap(report=>report.problems.map(problem=>Object.assign({report},problem)));
 const withHours=items.filter(item=>item.hours!=null);
 const hours=withHours.reduce((sum,item)=>sum+item.hours,0);
 if(!items.length)return `<section class="block"><h2>Простои и проблемы</h2><p class="empty-note">${emptyCopy('empty')}</p></section>`;
 return `<section class="block"><h2>Простои и проблемы</h2><p><strong class="num">${items.length}</strong> заявленных событий. <a class="text-link" href="${sourceHref('problem')}">Записи →</a></p><p>${withHours.length?`${hours} ч указаны в ${withHours.length} событии.`:'Длительность нигде не указана.'} ${items.length-withHours.length?`Ещё ${items.length-withHours.length} без длительности.`:''} Число сообщений не переводится в часы.</p></section>`;
}
function analyticsReporting(reports){
 const rows=periodReports(reports,ui());
 if(!rows.length)return `<section class="block"><h2>Отчётность</h2><p class="empty-note">${emptyCopy('empty')}</p><p class="caption">Ожидаемые и просроченные не рассчитываются: график смен не задан.</p></section>`;
 const reviewed=rows.filter(r=>r.status==='reviewed').length;
 const returned=rows.filter(r=>r.history.some(line=>line.includes('возвращ'))||r.status==='needs_revision').length;
 const pending=rows.filter(r=>r.status==='submitted').length;
 return `<section class="block"><h2>Отчётность</h2><div class="totals">${metricFigure('Получено',`<strong class="num">${rows.length}</strong>`,sourceHref('reports'))}${metricFigure('Проверено',`<strong class="num">${reviewed}</strong>`,sourceHref('reports',{status:'reviewed'}))}${metricFigure('Сейчас на проверке',`<strong class="num">${pending}</strong>`,sourceHref('reports',{status:'submitted'}))}</div><p class="stack-gap">Возвращались на уточнение: ${returned}. <a class="text-link" href="${sourceHref('returned')}">История возвратов →</a></p><p class="caption">Ожидаемые и просроченные не показаны: график смен не задан.</p></section>`;
}
analyticsPage=function(){
 syncFiltersFromHash();
 const reports=customerReports();
 return `${filterBar(workTypeField())}<div class="page-head"><div><div class="eyebrow">Расчёт по записям</div><h1>Аналитика</h1><p>Это не диалог с ИИ. Каждое число открывает исходные записи.</p></div></div>${analyticsWorks(reports)}${analyticsMoney(reports)}${analyticsProblems(reports)}<section class="block"><h2>Материалы</h2>${materialTable(periodReports(reports,ui()))}</section><section class="block"><h2>Техника</h2>${equipmentTable(periodReports(reports,ui()))}</section>${analyticsReporting(reports)}`;
};

function sourceRows(){
 syncFiltersFromHash();
 const q=hashQuery();
 const metric=q.get('metric')||'reports';
 const reports=customerReports();
 const period=periodReports(reports,ui());
 const money=periodMoney(reports,ui());
 if(metric==='expense'||metric==='income'||metric==='advance'){
  return {title:MONEY_KIND[metric]||'Операции',rows:money.filter(row=>row.kind===metric&&(!q.get('category')||row.category===q.get('category'))).map(row=>({href:recordHref(row.reportId),title:`${formatMoney(row.kopeks)} · ${row.category}`,text:`${ruDate(row.opDate)} · ${siteById(row.siteId).name}${row.opDate!==row.workDate?` · операция ${ruDate(row.opDate)}, отчёт ${ruDate(row.workDate)}`:''} · ${row.note}${row.receipt?' · чек есть':' · чека нет'}`}))};
 }
 if(metric==='work'){
  const type=q.get('workType')||ui().workType;
  const day=q.get('day');
  return {title:type,rows:workRows(period).filter(work=>work.type===type&&(!day||work.workDate===day)).map(work=>({href:recordHref(work.reportId),title:work.qty==null?work.type:`${work.qty} ${work.unit}`,text:`${ruDate(work.workDate)} · ${siteById(work.siteId).name}${work.qty===0?' · подтверждённый ноль':''}${work.note?` · ${work.note}`:''}`}))};
 }
 if(metric==='problem')return {title:'Заявленные события',rows:period.flatMap(report=>report.problems.map(problem=>({href:recordHref(report.id),title:problem.text,text:`${ruDate(report.workDate)} · ${siteById(report.siteId).name} · ${problem.hours==null?'длительность не указана':problem.hours+' ч'}`})))};
 if(metric==='material')return {title:q.get('name')||'Материалы',rows:period.flatMap(report=>report.materials.filter(row=>(!q.get('name')||row.name===q.get('name'))&&(!q.get('unit')||row.unit===q.get('unit'))).map(row=>({href:recordHref(report.id),title:`${DIRECTION[row.direction]} · ${row.qty} ${row.unit}`,text:`${ruDate(report.workDate)} · ${row.name}`})))};
 if(metric==='returned')return {title:'Возвраты на уточнение',rows:period.filter(report=>report.history.some(line=>line.includes('возвращ'))||report.status==='needs_revision').map(report=>({href:report.live?'#web/report':recordHref(report.id),title:siteById(report.siteId).name,text:report.history.join(' ')||statusText(report.status)}))};
 const status=q.get('status');
 return {title:'Отчёты',rows:period.filter(report=>!status||report.status===status).map(report=>({href:report.live?'#web/report':recordHref(report.id),title:`${ruDate(report.workDate)} · ${siteById(report.siteId).name}`,text:`${resultText(report)} · ${statusText(report.status)}`}))};
}
sourcePage=function(){
 const data=sourceRows();
 const back=`#web/analytics?${new URLSearchParams({from:ui().from,to:ui().to,site:ui().site,author:ui().author,preset:ui().preset,workType:ui().workType})}`;
 const list=data.rows.map(row=>`<article class="source-row"><h3>${esc(row.title)}</h3><p>${esc(row.text)}</p><a class="text-link" href="${row.href}">Открыть запись →</a></article>`).join('')||`<p class="empty-note">${emptyCopy('empty')}</p>`;
 return `<div class="page-head"><div><div class="eyebrow"><a href="${back}">Аналитика</a> / Источник</div><h1>${esc(data.title)}</h1><p>${data.rows.length?`Записей: ${data.rows.length}. Те же фильтры, что на предыдущем экране.`:'Выборка пустая.'}</p></div></div>${demoFlag()}${list}`;
};
recordPage=function(){
 const id=hashQuery().get('id');
 const report=customerReports().find(item=>item.id===id);
 const back=hashQuery().get('return')||'#web/reports';
 if(!report)return `<div class="page-head"><div><h1>Запись не найдена</h1></div></div><p class="empty-note">${emptyCopy('empty')}</p><a class="text-link" href="${esc(back)}">Назад</a>`;
 const works=report.noWork?`<p>${esc(report.noWork)}</p>`:report.works.map(work=>`<div class="work-line"><span>${esc(work.type)}${work.note?` · ${esc(work.note)}`:''}</span>${work.qty==null?'':`<strong>${work.qty===0?'0 · подтверждённый ноль':esc(String(work.qty))+' '+esc(work.unit)}</strong>`}</div>`).join('');
 const photos=report.photos.filter(photo=>photo.basis!=='date');
 const gallery=photos.length?`<div class="gallery">${photos.map((photo,index)=>`<button type="button" class="photo-open" data-photo="${index}"><img src="${esc(photo.src)}" alt="${esc(photo.alt)}"></button>`).join('')}</div><p class="caption">${photos.map(photo=>BASIS[photo.basis]).join(' · ')}</p>`:'<p>Фото не приложены.</p>';
 const money=report.money.map(row=>`<div class="work-line"><span>${MONEY_KIND[row.kind]} · ${esc(row.category)} · ${esc(row.note)}</span><strong>${formatMoney(row.kopeks)}</strong></div><p>Дата операции ${ruDate(row.opDate)}${row.opDate!==report.workDate?` · дата отчёта ${ruDate(report.workDate)}`:''} · чек ${row.receipt?'есть':'не приложен'}</p>`).join('')||'<p>Денежных операций нет.</p>';
 return `<div class="page-head"><div><div class="eyebrow"><a href="${esc(back)}">К списку</a> / Запись</div><h1>${esc(siteById(report.siteId).name)}</h1><p>${ruDate(report.workDate)} · ${esc(report.author)} · версия ${report.revision}</p></div>${statusHtml(report.status)}</div><article class="report-paper"><div class="meta"><span><small>Бригада</small>${esc(report.crew||'не указана')}</span><span><small>Источник</small>${report.live?'Текущая демонстрационная смена':'Синтетическая запись месяца'}</span></div><section class="report-section"><h3>${report.noWork?'Работ не было':'Выполненные работы'}</h3>${works}</section><section class="report-section"><h3>Фото</h3>${gallery}</section><section class="report-section"><h3>Проблемы</h3>${report.problems.map(item=>`<p>${esc(item.text)} · ${item.hours==null?'длительность не указана':item.hours+' ч'} · заявлено в отчёте ${ruDate(report.workDate)}</p>`).join('')||'<p>Не заявлены.</p>'}</section><section class="report-section"><h3>Материалы и техника</h3>${report.materials.map(row=>`<p>${esc(row.name)} · ${DIRECTION[row.direction]} · ${row.qty} ${esc(row.unit)}</p>`).join('')||'<p>Материалы не указаны.</p>'}${report.equipment.map(row=>`<p>${esc(row.kind)} · ${row.hours} ч${row.hired?' · наёмная':''}. Стоимость не считается.</p>`).join('')}</section><section class="report-section"><h3>Деньги</h3>${money}</section><section class="report-section"><h3>План следующей смены</h3><p>${esc(report.plan.join(' ')||'Не заявлен')}</p></section>${report.comment?`<section class="report-section"><h3>Комментарий</h3><p>${esc(report.comment)}</p></section>`:''}<section class="report-section"><h3>История</h3>${report.history.length?`<ul class="history">${report.history.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:'<p>Исправлений нет.</p>'}${report.live?'<p><a class="text-link" href="#web/report">Проверка этой смены →</a></p>':''}</section></article>`;
};
morePage=function(){
 return `<div class="page-head"><div><div class="eyebrow">Вторичные разделы</div><h1>Ещё</h1><p>Деньги и аналитика на телефоне. Настройки не входят в ежедневную проверку.</p></div></div><div class="source-row"><h3><a href="#web/money">Деньги</a></h3><p>Расходы, поступления и авансы по дате операции.</p></div><div class="source-row"><h3><a href="#web/analytics">Аналитика</a></h3><p>Объёмы, деньги и события с переходом к записям.</p></div><div class="source-row"><h3>Архив и настройки</h3><p>История сообщений хранится отдельно и не задаёт вид этих экранов. В демонстрации три ответственных; учётные записи отправителей настраивает администратор. Сервер к прототипу не подключён.</p></div>`;
};

const baseReportPage=reportPage;
reportPage=function(){return baseReportPage().replace('<h2>Проверка смены</h2>','<h2>Проверка смены</h2><p class="caption">Принятие подтверждает отчёт. Оно не утверждает каждую денежную операцию как бухгалтерский документ.</p>')};
const baseToday=today;
today=function(){
 const transport=state.transport==='queued'?'Ожидает отправки':state.transport==='delivered'||delivered()?'Доставлен в демонстрационный кабинет':'Черновик сохранён в браузере';
 return baseToday().replace('<article class="day-card">','<article class="day-card"><p class="caption">Доставка: '+transport+'. Проверка: '+statusText(state.status)+'.</p>');
};
historyPage=function(){
 const past=DATA.reports.filter(report=>report.siteId==='north').sort((a,b)=>b.workDate.localeCompare(a.workDate));
 return `<h1>Мои отчёты</h1><p>Северный · корпус 2</p><div class="day-card">${status()}<h2>29 октября</h2><p>${esc(state.kind==='work'?state.work:'Работ не было')}</p><a href="#app/preview" class="text-link">Открыть отчёт →</a></div>${past.slice(0,5).map(report=>`<div class="right-note"><h3>${ruDate(report.workDate)}</h3><p>${esc(resultText(report))}</p>${statusHtml(report.status)}</div>`).join('')}<p class="caption">Прошлые смены — демонстрационный месяц. Текущая смена хранится отдельно в этом браузере.</p>`;
};

function bindConcept(){
 document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  const [from,to]=PRESETS[button.dataset.preset];const u=ui();u.from=from;u.to=to;u.preset=button.dataset.preset;save();render();
 }));
 document.querySelector('#view-filters')?.addEventListener('change',event=>{
  const u=ui();const name=event.target.name;if(!name)return;
  if(name==='moneyKind')u.moneyKind=event.target.value;
  else u[name]=event.target.value;
  if(name==='from'||name==='to')u.preset='';
  if(name==='site'&&location.hash.startsWith('#web/object')){u.site=event.target.value||'north';save();location.hash='#web/object?site='+encodeURIComponent(u.site);return}
  save();render();
 });
 const search=document.querySelector('#journal-q');
 search?.addEventListener('input',()=>{const pos=search.selectionStart;ui().q=search.value;save();render();const again=document.querySelector('#journal-q');again?.focus();if(again&&pos!=null)again.setSelectionRange(pos,pos)});
 photoGallery=[...document.querySelectorAll('.photo-open img')].map(img=>({src:img.getAttribute('src'),alt:img.alt}));
 document.querySelectorAll('.photo-open').forEach((button,index)=>button.addEventListener('click',()=>openPhoto(index)));
}
let photoIndex=0;
function openPhoto(index){
 photoIndex=index;const dialog=document.querySelector('#lightbox');const item=photoGallery[index];if(!dialog||!item)return;
 dialog.querySelector('img').src=item.src;dialog.querySelector('img').alt=item.alt;dialog.querySelector('p').textContent=`${index+1} из ${photoGallery.length}. ${item.alt}`;
 if(!dialog.open)dialog.showModal();
}
function bindLightbox(){
 const dialog=document.querySelector('#lightbox');if(!dialog||dialog.dataset.bound)return;dialog.dataset.bound='1';
 dialog.querySelector('#lightbox-prev').addEventListener('click',()=>{if(photoGallery.length)openPhoto((photoIndex+photoGallery.length-1)%photoGallery.length)});
 dialog.querySelector('#lightbox-next').addEventListener('click',()=>{if(photoGallery.length)openPhoto((photoIndex+1)%photoGallery.length)});
}
bindLightbox();
render();
