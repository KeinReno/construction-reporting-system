import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
let foreman:string,second:string,manager:string;
const caps={'X-Report-Capabilities':'report-extras-v2'};
async function signIn(request:APIRequestContext,name:string){const r=await request.post('/api/v1/auth/login',{data:{login:name,password:'SyntheticPassword123'}});expect(r.ok()).toBeTruthy();return (await r.json()).access_token as string;}
test.beforeAll(async({request})=>{foreman=await signIn(request,'foreman');second=await signIn(request,'foreman2');manager=await signIn(request,'manager');});
async function enter(page:Page,token=foreman){await page.addInitScript(t=>sessionStorage.setItem('crs-employee-token',t),token);await page.goto('/?mode=employee');await expect(page.getByRole('heading',{name:'Отчёт за смену',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Объект',exact:true})).not.toHaveValue('');}
async function fillWork(page:Page,text:string){await page.getByRole('combobox',{name:'Вид работы',exact:true}).selectOption('Монтаж');await page.getByRole('textbox',{name:'Что сделано',exact:true}).fill(text);}
async function rows(request:APIRequestContext,token=foreman){const r=await request.get('/api/v1/reports?page_size=200',{headers:{Authorization:`Bearer ${token}`}});expect(r.ok()).toBeTruthy();return r.json() as Promise<Array<{id:string;client_report_id:string;revision:number;status:string;receipt_id:string;data:Record<string,any>}>>;}

test('short form saves partial input and photo, then sends a real report without invented quantity',async({page,request})=>{
  await enter(page);const text='Synthetic staff shift '+crypto.randomUUID();await fillWork(page,text);
  await expect(page.getByLabel('Объём',{exact:true})).not.toBeVisible();
  const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d')!.fillRect(0,0,4,4);return Array.from(atob(c.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));});
  await page.getByLabel('Добавить фото',{exact:true}).setInputFiles({name:'synthetic-photo.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await expect(page.getByRole('img',{name:'synthetic-photo.png'})).toBeVisible();await expect(page.getByText('Черновик сохранён',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('textbox',{name:'Что сделано',exact:true})).toHaveValue(text);await expect(page.getByRole('img',{name:'synthetic-photo.png'})).toBeVisible();
  await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();
  await expect.poll(async()=>{const r=await rows(request);return r.find(r=>r.data.work_entries.some((w:any)=>w.description===text))?.status;},{timeout:25000}).toBe('submitted');
  const item=(await rows(request)).find(r=>r.data.work_entries.some((w:any)=>w.description===text))!;
  expect(item.receipt_id).toBeTruthy();expect(item.data.work_entries[0].quantity).toBeNull();expect(item.data.required_photo_ids).toHaveLength(1);
  await expect(page.locator(`[data-report-id="${item.client_report_id}"]`)).toContainText('Доставлен');
});

test('offline queue resumes after login and does not duplicate a lost submit response',async({page,context,request})=>{
  await enter(page);const text='Synthetic offline '+crypto.randomUUID();await fillWork(page,text);await context.setOffline(true);
  await page.getByRole('button',{name:'Сохранить в очередь',exact:true}).click();await expect(page.getByText('В очереди',{exact:true})).toBeVisible();
  let once=true;await page.route('**/api/v1/reports/*/submit',async route=>{if(once){once=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  await context.setOffline(false);await expect.poll(async()=>(await rows(request)).filter(r=>r.data.work_entries.some((w:any)=>w.description===text)).length,{timeout:25000}).toBe(1);
  await page.reload();await page.getByRole('button',{name:'Мои отчёты',exact:true}).click();
  await expect.poll(async()=>{const r=await rows(request);return r.find(r=>r.data.work_entries.some((w:any)=>w.description===text))?.status;},{timeout:25000}).toBe('submitted');
  expect((await rows(request)).filter(r=>r.data.work_entries.some((w:any)=>w.description===text))).toHaveLength(1);
});

test('expired session preserves UUID and queue until same employee signs in again',async({page,request})=>{
  await enter(page);const text='Synthetic expiry '+crypto.randomUUID();await fillWork(page,text);
  await page.route('**/api/v1/reports/by-client/*',route=>route.fulfill({status:401,contentType:'application/json',body:'{"detail":"Expired token"}'}));
  await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();await expect(page.getByLabel('Пароль',{exact:true})).toBeVisible();
  await page.unroute('**/api/v1/reports/by-client/*');await page.getByLabel('Логин',{exact:true}).fill('foreman');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect.poll(async()=>(await rows(request)).filter(r=>r.data.work_entries.some((w:any)=>w.description===text)&&r.receipt_id).length,{timeout:25000}).toBe(1);
});

test('returned report displays reason and preserves untouched multiline entries through revision',async({page,request})=>{
  const text='Synthetic revision '+crypto.randomUUID();const site=(await (await request.get('/api/v1/sites',{headers:{Authorization:`Bearer ${foreman}`}})).json())[0].id;
  const id=crypto.randomUUID();const body={client_report_id:id,site_id:site,work_date:'2026-11-03',kind:'work',work_entries:[{type:'Монтаж',description:text}],required_photo_ids:[],incidents:[{description:'Synthetic first line\nSynthetic second line'}],next_shift_plans:['Synthetic plan\nwith another line']};
  const headers={Authorization:`Bearer ${foreman}`,...caps};let r=await (await request.post('/api/v1/reports',{headers,data:body})).json();
  expect((await request.post(`/api/v1/reports/${r.id}/submit`,{headers,data:{expected_revision:1}})).ok()).toBeTruthy();
  expect((await request.post(`/api/v1/reports/${r.id}/review`,{headers:{Authorization:`Bearer ${manager}`},data:{expected_revision:1,decision:'needs_revision',reason:'Уточните результат монтажа'}})).ok()).toBeTruthy();
  await enter(page);await page.getByRole('button',{name:'Мои отчёты',exact:true}).click();await page.locator(`[data-report-id="${id}"]`).getByRole('button',{name:'Посмотреть замечание и исправить'}).click();
  await expect(page.getByText('Уточните результат монтажа',{exact:true})).toBeVisible();await page.getByRole('textbox',{name:'Что сделано',exact:true}).fill(text+' corrected');await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();
  await expect.poll(async()=>{r=(await rows(request)).find(x=>x.client_report_id===id);return r?.status;},{timeout:25000}).toBe('submitted');
  expect(r.revision).toBe(2);expect(r.data.incidents).toEqual(body.incidents);expect(r.data.next_shift_plans).toEqual(body.next_shift_plans);
});

test('two tabs cannot overwrite or enqueue a newer draft silently',async({page,context})=>{
  await enter(page);await fillWork(page,'Synthetic current draft');await expect(page.getByText('Черновик сохранён',{exact:true})).toBeVisible();
  const other=await context.newPage();await enter(other);await expect(other.getByRole('textbox',{name:'Что сделано',exact:true})).toHaveValue('Synthetic current draft');
  await page.getByRole('textbox',{name:'Что сделано',exact:true}).fill('Synthetic newer draft');await expect(page.getByText('Черновик сохранён',{exact:true})).toBeVisible();
  await other.getByRole('textbox',{name:'Что сделано',exact:true}).fill('Synthetic stale tab');await expect(other.getByRole('alert')).toContainText('другой вкладке');await expect(other.getByRole('button',{name:'Отправить отчёт',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByRole('textbox',{name:'Что сделано',exact:true})).toHaveValue('Synthetic newer draft');await other.close();
});

test('another employee never receives the first employee draft or queue',async({page,context})=>{
  await enter(page);await fillWork(page,'Synthetic private draft');await expect(page.getByText('Черновик сохранён',{exact:true})).toBeVisible();
  const other=await context.newPage();await enter(other,second);await expect(other.getByRole('textbox',{name:'Что сделано',exact:true})).toHaveValue('');await other.getByRole('button',{name:'Мои отчёты',exact:true}).click();await expect(other.getByText('Synthetic private draft')).toHaveCount(0);await other.close();
});


test('slow local transaction cannot let pending autosave invalidate the next form',async({page,context})=>{
  await enter(page);await context.setOffline(true);await fillWork(page,'Synthetic slow queue');
  await page.evaluate(()=>new Promise<void>(resolve=>{const r=indexedDB.open('crs-employee',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('forms','readwrite'),store=tx.objectStore('forms'),until=performance.now()+1200;function hold(){const q=store.get('__hold__');q.onsuccess=()=>{if(performance.now()<until)hold();};}hold();resolve();};}));
  await page.getByRole('button',{name:'Сохранить в очередь',exact:true}).click();await expect(page.getByRole('heading',{name:'Мои отчёты',exact:true})).toBeVisible();await page.getByRole('button',{name:'Отчёт',exact:true}).click();
  await expect(page.getByRole('button',{name:'Сохранить в очередь',exact:true})).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('equipment requires an explicit owner and decimal money is sent as integer kopecks',async({page,request})=>{
  await enter(page);const text='Synthetic equipment '+crypto.randomUUID();await fillWork(page,text);
  await page.getByText('Добавить сведения: условия смены, материалы, деньги, техника',{exact:true}).click();await page.getByText('Техника',{exact:true}).click();await page.getByRole('button',{name:'Добавить технику',exact:true}).click();
  await page.getByRole('textbox',{name:'Вид техники',exact:true}).fill('Synthetic crane');await page.getByRole('textbox',{name:'Отработано часов',exact:true}).fill('02.50');
  await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Укажите принадлежность техники');
  await page.getByRole('combobox',{name:'Принадлежность',exact:true}).selectOption('hired');
  await page.getByRole('button',{name:'Добавить денежную запись',exact:true}).click();await page.getByRole('textbox',{name:'На что / назначение',exact:true}).fill('Synthetic fuel');await page.getByRole('textbox',{name:'Сумма, ₽',exact:true}).fill('01,50');
  await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();
  await expect.poll(async()=>(await rows(request)).find(r=>r.data.work_entries.some((w:any)=>w.description===text))?.status,{timeout:25000}).toBe('submitted');
  const report=(await rows(request)).find(r=>r.data.work_entries.some((w:any)=>w.description===text))!;expect(report.data.equipment[0]).toEqual({type:'Synthetic crane',hours:'2.50',hired:true});expect(report.data.financial_entries[0].amount_kopecks).toBe(150);
});


test('shift conditions survive local reload and reach the server',async({page,request})=>{
 await enter(page);const text='Synthetic conditions '+crypto.randomUUID();await fillWork(page,text);
 await page.getByText('Добавить сведения: условия смены, материалы, деньги, техника',{exact:true}).click();
 await page.getByRole('combobox',{name:'Трансформатор',exact:true}).selectOption('Т1/Т2');await page.getByRole('combobox',{name:'Погода',exact:true}).selectOption('Облачно');await expect(page.getByText('Черновик сохранён',{exact:true})).toBeVisible();await page.reload();
 await page.getByText('Добавить сведения: условия смены, материалы, деньги, техника',{exact:true}).click();await expect(page.getByRole('combobox',{name:'Трансформатор',exact:true})).toHaveValue('Т1/Т2');await expect(page.getByRole('combobox',{name:'Погода',exact:true})).toHaveValue('Облачно');
 await page.getByRole('button',{name:'Отправить отчёт',exact:true}).click();await expect.poll(async()=>{const reports=await rows(request);const r=reports.find(r=>r.data.work_entries.some((w:any)=>w.description===text));return r&&[r.status,r.data.work_area,r.data.weather];},{timeout:25000}).toEqual(['submitted','Т1/Т2','Облачно']);
});
