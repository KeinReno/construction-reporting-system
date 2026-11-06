import {test,expect} from '@playwright/test';

test('labor totals follow dates, preserve identity and drill into the same snapshot',async({page,request})=>{
  const base='http://127.0.0.1:8000/api/v1';
  const token=(await (await request.post(base+'/auth/login',{data:{login:'manager',password:'SyntheticPassword123'}})).json()).access_token;
  const headers={Authorization:'Bearer '+token};
  const sites=await (await request.get(base+'/sites',{headers})).json();
  const tag=crypto.randomUUID();
  const names=['Synthetic summary A '+tag,'Synthetic summary B '+tag];
  const workers=[];
  for(const name of names){const r=await request.post(base+'/owner/workers',{headers,data:{name}});expect(r.ok()).toBeTruthy();workers.push((await r.json()).id);}
  for(const data of [
    {worker_id:workers[0],work_date:'2026-03-01',allowance_kopecks:1000,reason:'Synthetic bonus'},
    {worker_id:workers[0],work_date:'2026-03-02',worked:false,business_trip:true,allowance_kopecks:300,reason:'Synthetic trip'},
    {worker_id:workers[1],work_date:'2026-03-01',fine_kopecks:200,reason:'Synthetic fine'},
  ]){
    const id=crypto.randomUUID();const r=await request.put(base+'/owner/labor-days/'+id,{headers,data:{id,site_id:sites[0].id,...data}});expect(r.ok()).toBeTruthy();
  }
  await page.goto('/');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Табель',exact:true}).click();
  await page.getByRole('button',{name:'Фильтры',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Автор',exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'С',exact:true}).fill('01/03/2026');

  let release!:()=>void;let settled!:()=>void;let captured=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const oldSettled=new Promise<void>(resolve=>{settled=resolve;});
  await page.route('**/api/v1/owner/labor-summary*',async route=>{
    if(new URL(route.request().url()).searchParams.get('to_date')==='2026-03-02'){
      captured=true;
      try{const response=await route.fetch();await gate;await route.fulfill({response});}finally{settled();}
    }else await route.continue();
  });
  try{
    await page.getByRole('textbox',{name:'По',exact:true}).fill('02/03/2026');
    await expect.poll(()=>captured).toBeTruthy();
    await page.getByRole('textbox',{name:'По',exact:true}).fill('01/03/2026');
    const summary=page.getByRole('region',{name:'Итоги табеля',exact:true});
    const people=summary.getByRole('table',{name:'Итоги по людям',exact:true});
    await expect(people.locator('tbody tr')).toHaveCount(2);
    const value=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format((2*500000+1000-200)/100);
    await expect(summary.locator('.labor-summary-stats').getByText(value,{exact:true})).toBeVisible();
    release();await oldSettled;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
    await expect(summary.locator('.labor-summary-stats').getByText(value,{exact:true})).toBeVisible();
    await people.getByRole('button',{name:names[0],exact:true}).click();
    const ledger=page.getByRole('table',{name:'Дни табеля',exact:true});
    await expect(ledger.locator('tbody tr')).toHaveCount(1);
    await expect(ledger.locator('tbody')).toContainText(names[0]);
    await page.getByRole('button',{name:'Показать все дни периода'}).click();
    await expect(ledger.locator('tbody tr')).toHaveCount(2);
    const objectRow=summary.getByRole('table',{name:'Итоги по объектам',exact:true}).locator('tbody tr');
    await expect(objectRow.locator('td').nth(0)).toHaveText('2');
    await expect(objectRow.locator('td').nth(1)).toHaveText('1');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
    await page.getByRole('textbox',{name:'С',exact:true}).fill('bad date');
    await expect(summary).toContainText('Итоги табеля не загружены.');
    await expect(summary.locator('.labor-summary-stats')).toHaveCount(0);
  }finally{release();}
});
