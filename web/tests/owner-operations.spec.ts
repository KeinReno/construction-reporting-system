import {test,expect} from '@playwright/test';
async function enter(page:import('@playwright/test').Page){await page.goto('/');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.locator('.topbar-right')).toContainText('manager');}
test('owner archives a work type preserving history',async({page})=>{
 await enter(page);await page.locator('.sidebar').getByRole('button',{name:'Виды работ',exact:true}).click();const section=page.getByRole('region',{name:'Виды работ',exact:true});
 const name='Synthetic catalog '+crypto.randomUUID();await section.getByLabel('Название',{exact:true}).fill(name);await section.getByRole('button',{name:'Сохранить вид работы'}).click();const row=section.locator('.ops-row').filter({hasText:name});await expect(row).toBeVisible();await row.getByRole('button',{name:'Убрать из выбора'}).click();await expect(row).toContainText('В архиве');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});
test('owner records a day, trip and explicit adjustments',async({page})=>{
 await enter(page);await page.locator('.sidebar').getByRole('button',{name:'Табель',exact:true}).click();const section=page.getByRole('region',{name:'Табель владельца'});const name='Synthetic worker '+crypto.randomUUID();await section.getByLabel('Имя работника').fill(name);await section.getByRole('button',{name:'Добавить человека',exact:true}).click();await expect(section.getByRole('button',{name:'Добавить день'})).toBeEnabled();await section.getByRole('button',{name:'Добавить день'}).click();await section.getByRole('combobox',{name:'Работник',exact:true}).selectOption({label:name});await section.getByLabel('Командировочный день').check();await section.getByLabel('Доплата, ₽').fill('100');await section.getByLabel('Штраф, ₽').fill('20');await section.getByLabel('Причина доплаты / штрафа').fill('Synthetic adjustment');await section.getByRole('button',{name:'Сохранить день'}).click();const row=section.getByRole('table',{name:'Дни табеля',exact:true}).getByRole('row').filter({hasText:name});await expect(row).toContainText('командировка');await expect(row).toContainText(/5\s080/);
 await row.getByRole('button',{name:'Изменить день'}).click();await section.getByLabel('Штраф, ₽').fill('30');await section.getByLabel('Причина доплаты / штрафа').fill('Synthetic corrected fine');
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/owner/labor-days/*',async route=>{if(route.request().method()==='PUT'){const response=await route.fetch();await gate;await route.fulfill({response});}else await route.continue();});
 try{await section.getByRole('button',{name:'Сохранить день'}).click();await expect(section.getByLabel('Штраф, ₽')).toBeDisabled();release();await expect(row).toContainText(/5\s070/);}finally{release();}
 await row.getByRole('button',{name:'История дня'}).click();const history=page.getByRole('region',{name:'История дня табеля',exact:true});await expect(history.locator('li')).toHaveCount(2);await expect(history).toContainText('Synthetic corrected fine');await expect(history).toContainText(/5\s080/);await expect(history).toContainText(/5\s070/);await expect(history).toContainText('Автор: manager');await history.getByRole('button',{name:'Закрыть историю'}).click();await expect(history).toHaveCount(0);await expect(row.getByRole('button',{name:'История дня'})).toBeFocused();

 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});
test('conversation dock shows saved source without page overflow',async({page})=>{
 await enter(page);await page.getByRole('button',{name:'Переписка / ИИ'}).click();const dock=page.getByRole('complementary',{name:'Переписка и помощник'});await expect(dock).toBeVisible();await dock.getByLabel('Отчёт и дата').selectOption({label:'2026-10-24 · Synthetic site A'});await expect(dock.locator('.conversation-message')).toContainText('Synthetic');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
 await dock.getByRole('button',{name:'Закрыть панель'}).click();await expect(dock).toHaveCount(0);
});


test('owner forms preserve submitted input on delayed failure',async({page})=>{
 await enter(page);
 for(const spec of [
   {nav:'Виды работ',path:'/owner/work-types',label:'Название',save:'Сохранить вид работы'},
   {nav:'Табель',path:'/owner/workers',label:'Имя работника',save:'Добавить человека'},
 ]){
   await page.locator('.sidebar').getByRole('button',{name:spec.nav,exact:true}).click();
   const input=page.getByLabel(spec.label,{exact:true});
   const name='Synthetic pending '+crypto.randomUUID();await input.fill(name);
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
   const pattern='**/api/v1'+spec.path;
   await page.route(pattern,async route=>{if(route.request().method()==='POST'){await gate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'Synthetic save failure'})});}else await route.continue();});
   try{
     await page.getByRole('button',{name:spec.save,exact:true}).click();
     await expect(input).toBeDisabled();release();
     await expect(input).toBeEnabled();await expect(input).toHaveValue(name);
     await expect(page.getByRole('alert')).toBeVisible();
   }finally{release();await page.unroute(pattern);}
 }
});
