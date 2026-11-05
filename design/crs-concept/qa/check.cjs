const {chromium}=require('../../../web/node_modules/@playwright/test');
const fs=require('fs'), path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage({reducedMotion:"reduce"}); const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://localhost:58515/';
 const check=(name,pass,detail='')=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name} ${detail}`)};
 async function route(r){await page.goto(base+'#'+r);await page.waitForTimeout(250)}
 await route('app/form');await page.evaluate(()=>localStorage.clear());await page.reload();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});for(const screen of ['web/overview','web/object','web/report','app/today','app/form','app/preview']){await route(screen);const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));check(`layout ${width} ${screen}`,size.scroll<=size.client,JSON.stringify(size));await page.screenshot({path:path.join(__dirname,'screenshots',`${width}-${screen.replace('/','-')}.png`),fullPage:true});}}
 await page.setViewportSize({width:390,height:900});await route('app/form');await page.locator('[name="work"]').fill('QA сохранённая работа');await page.reload();check('input survives reload',await page.locator('[name="work"]').inputValue()==='QA сохранённая работа');
 await page.locator('[name="kind"][value="no_work"]').check();await page.locator('[name="reason"]').fill('');await page.getByRole('button',{name:'Проверить отчёт'}).click();check('no_work reason required',page.url().endsWith('app/form'));await page.locator('[name="reason"]').fill('Ожидаем поставку');await page.locator('[name="crewConfirmed"]').check();await page.getByRole('button',{name:'Проверить отчёт'}).click();await page.waitForTimeout(250);check('no_work valid preview',page.url().endsWith('app/preview'));
 await page.locator('#offline').check();await page.locator('#send').click();await page.waitForTimeout(250);await route('web/report');check('queued hidden from customer',(await page.locator('h1').innerText()).includes('не доставлен'));
 await route('app/today');await page.locator('#sync').click();await route('web/report');check('sync submits',await page.locator('#accept').count()===1);
 await page.locator('summary').click();await page.locator('[name="feedback"]').fill('Уточните причину');await page.getByRole('button',{name:'Вернуть с причиной'}).click();await route('app/form');await page.locator('[name="reason"]').fill('НОВОЕ НЕОТПРАВЛЕННОЕ УТОЧНЕНИЕ');await route('web/report');check('customer retains submitted payload before resubmit',!(await page.locator('.report-paper').innerText()).includes('НОВОЕ НЕОТПРАВЛЕННОЕ УТОЧНЕНИЕ'));
 await route('app/form');await page.getByRole('button',{name:'Проверить отчёт'}).click();await page.waitForTimeout(250);await page.locator('#send').click();await route('web/report');check('revision increment',(await page.locator('.page-head').innerText()).includes('версия 2'));await page.locator('#accept').click();await route('app/form');check('accepted immutable',await page.locator('#shift-form').count()===0);
 check('no page errors',errors.length===0,errors.join(';'));fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(results,null,2));await browser.close();process.exitCode=results.some(x=>!x.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});

