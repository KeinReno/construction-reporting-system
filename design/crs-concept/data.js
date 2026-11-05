/* Синтетический октябрь 2026. Итоги считаются из этих записей. */
const SITES=[
 {id:'north',name:'Северный · корпус 2',lead:'Бригадир № 1'},
 {id:'east',name:'Восточный · склад',lead:'Бригадир № 2'},
 {id:'south',name:'Южный · благоустройство',lead:'Бригадир № 3'}
];
function blankReport(row){
 return Object.assign({revision:1,status:'reviewed',noWork:null,works:[],problems:[],materials:[],equipment:[],money:[],plan:[],comment:'',photos:[],history:[],crew:'',source:'shift'},row);
}
const REPORTS=[
 blankReport({id:'north-2026-10-01',siteId:'north',workDate:'2026-10-01',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Монтаж металлоконструкций',qty:8,unit:'шт',note:''}],
  photos:[{id:'ph-n01',src:'site.svg',alt:'Иллюстрация монтажа каркаса',basis:'same'}],
  money:[{kind:'expense',category:'Крепёж',kopeks:320000,opDate:'2026-10-01',note:'Крепёж для узла',receipt:false}],
  materials:[{name:'Болты',direction:'out',qty:40,unit:'шт'}],
  equipment:[{kind:'Кран',hours:4,hired:false}],
  plan:['Продолжить монтаж следующего яруса']}),
 blankReport({id:'north-2026-10-02',siteId:'north',workDate:'2026-10-02',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Прокладка кабеля',qty:25,unit:'м',note:''},{type:'Установка окон',qty:0,unit:'шт',note:'Явно указано: окна в эту смену не ставили'}]}),
 blankReport({id:'north-2026-10-03',siteId:'north',workDate:'2026-10-03',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  noWork:'Дождь, работы на площадке остановлены',
  problems:[{text:'Дождь остановил разгрузку',hours:null}]}),
 blankReport({id:'north-2026-10-06',siteId:'north',workDate:'2026-10-06',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Монтаж металлоконструкций',qty:10,unit:'шт',note:''}],
  materials:[{name:'Цемент',direction:'in',qty:20,unit:'мешок'},{name:'Песок',direction:'unknown',qty:5,unit:'м³'}],
  photos:[{id:'ph-n06',src:'detail.svg',alt:'Иллюстрация узла',basis:'same'},{id:'ph-n06-date',src:'site.svg',alt:'Снимок совпал только по дате',basis:'date'}],
  plan:['Закрыть участок после поставки песка']}),
 blankReport({id:'north-2026-10-13',siteId:'north',workDate:'2026-10-13',author:'Бригадир № 1',crew:'Бригада № 1 · 3 человека',
  works:[{type:'Кладка перегородок',qty:18,unit:'м²',note:''}],
  money:[{kind:'advance',category:'Аванс на инструмент',kopeks:1000000,opDate:'2026-10-13',note:'Выдан аванс на инструмент',receipt:false}],
  photos:[{id:'ph-n13',src:'site.svg',alt:'Иллюстрация кладки',basis:'same'}]}),
 blankReport({id:'north-2026-10-14',siteId:'north',workDate:'2026-10-14',author:'Бригадир № 1',crew:'Бригада № 1 · 3 человека',
  works:[{type:'Уборка территории',qty:null,unit:null,note:'Качественная работа без объёма'}],
  photos:[{id:'ph-n14',src:'site.svg',alt:'Иллюстрация площадки',basis:'manual'}]}),
 blankReport({id:'north-2026-10-20',siteId:'north',workDate:'2026-10-20',author:'Бригадир № 1',crew:'Бригада № 1 · 5 человек',revision:2,
  works:[{type:'Монтаж металлоконструкций',qty:6,unit:'шт',note:'Участок Б, после уточнения'}],
  photos:[{id:'ph-n20',src:'detail.svg',alt:'Иллюстрация участка Б',basis:'same'}],
  history:['Версия 1: возвращена на уточнение — укажите участок монтажа.','Версия 2: повторно отправлена и принята.']}),
 blankReport({id:'north-2026-10-21',siteId:'north',workDate:'2026-10-21',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Прокладка кабеля',qty:12,unit:'м',note:''}],
  money:[{kind:'expense',category:'Топливо',kopeks:270000,opDate:'2026-10-15',note:'Заправка 15/10 внесена отчётом 21/10',receipt:false}]}),
 blankReport({id:'north-2026-10-27',siteId:'north',workDate:'2026-10-27',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Монтаж металлоконструкций',qty:4,unit:'шт',note:''}],
  money:[{kind:'income',category:'Финансирование',kopeks:5000000,opDate:'2026-10-27',note:'Поступление на объект',receipt:false}],
  photos:[{id:'ph-n27',src:'site.svg',alt:'Иллюстрация каркаса',basis:'same'}]}),
 blankReport({id:'north-2026-10-28',siteId:'north',workDate:'2026-10-28',author:'Бригадир № 1',crew:'Бригада № 1 · 4 человека',
  works:[{type:'Подготовка участка',qty:null,unit:null,note:'Площадка готова к монтажу'}],
  photos:[{id:'ph-n28',src:'site.svg',alt:'Иллюстрация подготовленного участка',basis:'same'}],
  plan:['Монтаж после доставки креплений']}),
 blankReport({id:'east-2026-10-02',siteId:'east',workDate:'2026-10-02',author:'Бригадир № 2',crew:'Бригада № 2 · 5 человек',
  works:[{type:'Кладка перегородок',qty:30,unit:'м²',note:''}],
  money:[{kind:'expense',category:'Материалы',kopeks:800000,opDate:'2026-10-02',note:'Раствор и сетка',receipt:true}],
  equipment:[{kind:'Погрузчик',hours:3,hired:false}],
  photos:[{id:'ph-e02',src:'site.svg',alt:'Иллюстрация кладки склада',basis:'same'}]}),
 blankReport({id:'east-2026-10-08',siteId:'east',workDate:'2026-10-08',author:'Бригадир № 2',crew:'Бригада № 2 · 5 человек',
  works:[{type:'Прокладка кабеля',qty:40,unit:'м',note:''}],
  money:[{kind:'expense',category:'Материалы',kopeks:210000,opDate:'2026-10-08',note:'Кабель и крепёж лотков',receipt:false}]}),
 blankReport({id:'east-2026-10-15',siteId:'east',workDate:'2026-10-15',author:'Бригадир № 2',crew:'Бригада № 2 · 4 человека',
  noWork:'Поставка задержана, монтировать нечего'}),
 blankReport({id:'east-2026-10-22',siteId:'east',workDate:'2026-10-22',author:'Бригадир № 2',crew:'Бригада № 2 · 4 человека',
  works:[{type:'Монтаж металлоконструкций',qty:5,unit:'шт',note:''}],
  materials:[{name:'Арматура',direction:'out',qty:120,unit:'кг'}],
  photos:[{id:'ph-e22',src:'detail.svg',alt:'Иллюстрация каркаса склада',basis:'same'}]}),
 blankReport({id:'east-2026-10-28',siteId:'east',workDate:'2026-10-28',author:'Бригадир № 2',crew:'Бригада № 2 · 4 человека',status:'submitted',
  works:[{type:'Кладка перегородок',qty:12,unit:'м²',note:''}],
  problems:[{text:'Не доставлен комплект ворот',hours:null}],
  photos:[{id:'ph-e28',src:'site.svg',alt:'Иллюстрация проёма ворот',basis:'same'}]}),
 blankReport({id:'south-2026-10-06',siteId:'south',workDate:'2026-10-06',author:'Бригадир № 3',crew:'Бригада № 3 · 3 человека',
  works:[{type:'Устройство покрытия',qty:50,unit:'м²',note:''}],
  money:[{kind:'expense',category:'Благоустройство',kopeks:640000,opDate:'2026-10-06',note:'Плитка и бордюр',receipt:true}],
  photos:[{id:'ph-s06',src:'site.svg',alt:'Иллюстрация покрытия',basis:'same'}]}),
 blankReport({id:'south-2026-10-09',siteId:'south',workDate:'2026-10-09',author:'Бригадир № 3',crew:'Бригада № 3 · 3 человека',
  works:[{type:'Планировка грунта',qty:null,unit:null,note:'Без численного объёма'}],
  equipment:[{kind:'Экскаватор',hours:6,hired:true}]}),
 blankReport({id:'south-2026-10-16',siteId:'south',workDate:'2026-10-16',author:'Бригадир № 3',crew:'Бригада № 3 · 3 человека',
  works:[{type:'Устройство покрытия',qty:22,unit:'м²',note:''}],
  money:[{kind:'advance',category:'Аванс на материалы',kopeks:500000,opDate:'2026-10-16',note:'Аванс на плитку',receipt:false}],
  photos:[{id:'ph-s16',src:'site.svg',alt:'Иллюстрация укладки',basis:'same'}]}),
 blankReport({id:'south-2026-10-23',siteId:'south',workDate:'2026-10-23',author:'Бригадир № 3',crew:'Бригада № 3 · 2 человека',
  works:[{type:'Устройство покрытия',qty:10,unit:'м²',note:''}],
  problems:[{text:'Простой экскаватора',hours:3}],
  photos:[{id:'ph-s23',src:'detail.svg',alt:'Иллюстрация простоя у покрытия',basis:'same'}]})
];
const EXCLUDED_NOTES=[{id:'note-cumulative',siteId:'north',messageDate:'2026-10-10',kopeks:8000000,text:'В сообщении названа накопительная сумма около 80 000 ₽ с начала месяца. В итоги она не входит: это не отдельная операция.'}];
const DATA={generatedAt:'2026-10-29T09:40:00',sites:SITES,reports:REPORTS,excludedNotes:EXCLUDED_NOTES};
const BASIS={same:'в том же отчёте',manual:'связь подтверждена вручную',date:'только совпадение по дате'};
const MONEY_KIND={expense:'Расход',income:'Поступление',advance:'Аванс'};
const DIRECTION={in:'Поступило',out:'Израсходовано',unknown:'Направление не указано'};

function inRange(date,from,to){return !!date&&date>=from&&date<=to}
function siteById(id){return DATA.sites.find(s=>s.id===id)||{id:'',name:'Объект',lead:''}}
function ruDate(iso){if(!iso)return '—';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`}
function formatMoney(kopeks){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(kopeks/100)}
function parseKopeks(raw){const s=String(raw??'').trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s))return null;const [a,b='']=s.split('.');return Number(a)*100+Number((b+'00').slice(0,2))}
function flattenMoney(reports){const rows=[];for(const report of reports)for(const op of report.money)rows.push(Object.assign({},op,{reportId:report.id,siteId:report.siteId,author:report.author,workDate:report.workDate}));return rows}
function scopedReports(reports,filters){return reports.filter(r=>(!filters.site||r.siteId===filters.site)&&(!filters.author||r.author===filters.author))}
function periodReports(reports,filters){return scopedReports(reports,filters).filter(r=>inRange(r.workDate,filters.from,filters.to))}
function periodMoney(reports,filters){return flattenMoney(scopedReports(reports,filters)).filter(op=>inRange(op.opDate,filters.from,filters.to)&&(!filters.kind||op.kind===filters.kind)&&(!filters.category||op.category===filters.category))}
function sumKind(rows,kind){return rows.filter(r=>r.kind===kind).reduce((sum,row)=>sum+row.kopeks,0)}
function workRows(reports){const rows=[];for(const report of reports)for(const work of report.works)rows.push(Object.assign({},work,{reportId:report.id,siteId:report.siteId,author:report.author,workDate:report.workDate}));return rows}
function volumeGroups(reports){
 const measurable=new Map(),qualitative=[];
 for(const work of workRows(reports)){
  if(work.qty==null){qualitative.push(work);continue}
  const key=work.type+'\0'+(work.unit||'');
  if(!measurable.has(key))measurable.set(key,{type:work.type,unit:work.unit,qty:0,count:0,confirmedZero:true,reportIds:[]});
  const group=measurable.get(key);
  group.qty+=work.qty;group.count+=1;group.confirmedZero=group.confirmedZero&&work.qty===0;group.reportIds.push(work.reportId);
 }
 return {measurable:[...measurable.values()],qualitative};
}
function latestReport(reports,siteId){return reports.filter(r=>r.siteId===siteId).sort((a,b)=>b.workDate.localeCompare(a.workDate)||b.id.localeCompare(a.id))[0]||null}
function resultText(report){
 if(!report)return 'Сведений нет';
 if(report.noWork)return report.noWork;
 if(!report.works.length)return 'Работы не указаны';
 const first=report.works[0];
 return first.qty==null?first.type:`${first.type}${report.works.length>1?` и ещё ${report.works.length-1}`:''}`;
}
function auditDataset(){
 const errors=[];
 const money=flattenMoney(DATA.reports);
 const expect=(name,actual,wanted)=>{if(actual!==wanted)errors.push(`${name}: ${actual} ≠ ${wanted}`)};
 expect('расходы',sumKind(money,'expense'),2240000);
 expect('поступления',sumKind(money,'income'),5000000);
 expect('авансы',sumKind(money,'advance'),1500000);
 if(money.some(row=>row.kopeks===8000000))errors.push('накопительная сумма попала в операции');
 if(!DATA.excludedNotes.some(note=>note.kopeks===8000000&&note.includeInTotals!==true))errors.push('нет исключённой накопительной заметки');
 const volumes=volumeGroups(DATA.reports);
 const take=(type,unit)=>volumes.measurable.find(row=>row.type===type&&row.unit===unit);
 expect('монтаж шт',take('Монтаж металлоконструкций','шт')?.qty,33);
 expect('кладка м²',take('Кладка перегородок','м²')?.qty,60);
 expect('кабель м',take('Прокладка кабеля','м')?.qty,77);
 expect('покрытие м²',take('Устройство покрытия','м²')?.qty,82);
 const windows=take('Установка окон','шт');
 expect('окна шт',windows?.qty,0);
 if(!windows?.confirmedZero)errors.push('ноль по окнам не отмечен как подтверждённый');
 const types=new Map();
 for(const row of volumes.measurable){if(types.has(row.type)&&types.get(row.type)!==row.unit)errors.push('смешаны единицы: '+row.type);types.set(row.type,row.unit)}
 if(volumes.qualitative.length<3)errors.push('мало качественных работ');
 const sand=DATA.reports.flatMap(r=>r.materials).find(row=>row.name==='Песок');
 if(!sand||sand.direction!=='unknown')errors.push('песок должен остаться с неизвестным направлением');
 const late=money.find(row=>row.category==='Топливо');
 if(!late||late.opDate==='2026-10-21'||late.workDate!=='2026-10-21')errors.push('поздний расход не отделён от даты отчёта');
 if(!DATA.reports.some(r=>r.revision>1&&r.history.some(line=>line.includes('возвращ'))))errors.push('нет возвращённого и повторно отправленного отчёта');
 if(!DATA.reports.some(r=>r.photos.length===0&&r.works.length))errors.push('нет отчёта без фото');
 if(!DATA.reports.some(r=>r.noWork))errors.push('нет дня без работ');
 if(DATA.reports.some(r=>inRange(r.workDate,'2026-10-04','2026-10-05')))errors.push('4–5 октября должны быть без записей');
 if(DATA.reports.some(r=>r.siteId==='south'&&r.workDate>'2026-10-23'))errors.push('у южного объекта не должно быть записей после 23 октября');
 if(DATA.sites.length!==3)errors.push('нужны три объекта');
 const hours=DATA.reports.flatMap(r=>r.equipment);
 if(hours.some(row=>Object.prototype.hasOwnProperty.call(row,'cost')||Object.prototype.hasOwnProperty.call(row,'kopeks')))errors.push('у техники появилась стоимость');
 expect('часы крана',hours.filter(row=>row.kind==='Кран').reduce((s,r)=>s+r.hours,0),4);
 expect('события',DATA.reports.reduce((s,r)=>s+r.problems.length,0),3);
 expect('часы простоя',DATA.reports.flatMap(r=>r.problems).reduce((s,r)=>s+(r.hours||0),0),3);
 return errors;
}

if(typeof module!=='undefined'&&module.exports)module.exports={DATA,BASIS,MONEY_KIND,DIRECTION,inRange,siteById,ruDate,formatMoney,parseKopeks,flattenMoney,scopedReports,periodReports,periodMoney,sumKind,workRows,volumeGroups,latestReport,resultText,auditDataset};
