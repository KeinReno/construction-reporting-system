const {chromium}=require('../../../web/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:58515/';
 const fail=[];
 const check=(name,pass,detail='')=>{console.log(`${pass?'PASS':'FAIL'} ${name} ${detail}`);if(!pass)fail.push(name+' '+detail)};
 await page.goto(base+'#web/overview');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 const routes=['web/overview','web/objects','web/object','web/reports','web/money','web/analytics','web/source?metric=expense&from=2026-10-01&to=2026-10-29&preset=month'];
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  for(const route of routes){
   await page.goto(base+'#'+route);
   await page.waitForTimeout(200);
   const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
   check(`layout ${width} ${route.split('?')[0]}`,size.scroll<=size.client,JSON.stringify(size));
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'#web/analytics');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 check('today has no expense total',await page.locator('[data-kopeks="2240000"]').count()===0);
 check('today names empty selection',(await page.locator('body').innerText()).includes('Нет записей'));
 await page.getByRole('button',{name:'Октябрь'}).click();
 await page.waitForTimeout(200);
 check('october expenses',await page.locator('[data-kopeks="2240000"]').count()>=1);
 check('october income separate',await page.locator('[data-kopeks="5000000"]').count()>=1);
 check('october advances separate',await page.locator('[data-kopeks="1500000"]').count()>=1);
 await page.locator('select[name="workType"]').selectOption({label:'Установка окон'});
 await page.waitForTimeout(200);
 check('confirmed zero',(await page.locator('[data-confirmed-zero="true"]').count())===1&&(await page.locator('body').innerText()).includes('Подтверждённый ноль'));
 await page.locator('select[name="workType"]').selectOption({label:'Монтаж металлоконструкций'});
 await page.waitForTimeout(200);
 check('montage volume',(await page.locator('h2:text-is("Работы") + p').innerText()).includes('33 шт'));
 await page.locator('select[name="workType"]').selectOption({label:'Кладка перегородок'});
 await page.waitForTimeout(200);
 const masonry=await page.locator('h2:text-is("Работы") + p').innerText();
 check('masonry stays in square meters',masonry.includes('60 м²')&&!masonry.includes('33'));
 await page.getByRole('link',{name:'Показать записи'}).first().click();
 await page.waitForTimeout(200);
 const source=await page.locator('body').innerText();
 check('expense source',source.includes('Топливо')&&source.includes('15/10/2026')&&source.includes('21/10/2026'));
 check('cumulative sum excluded',!source.includes('80 000')&&!source.includes('80 000'));
 await page.goto(base+'#web/analytics');
 await page.getByRole('button',{name:'Октябрь'}).click();
 await page.waitForTimeout(200);
 const materials=await page.locator('body').innerText();
 check('unknown material separate',materials.includes('Песок, м³')&&materials.includes('Не указано'));
 check('sand not guessed into inflow',materials.includes('Песок, м³'));
 check('no page errors',errors.length===0,errors.join(';'));
 await page.screenshot({path:require('path').join(__dirname,'screenshots','1440-web-analytics.png'),fullPage:true});
 await page.setViewportSize({width:390,height:900});
 await page.goto(base+'#web/money');
 await page.getByRole('button',{name:'Октябрь'}).click();
 await page.waitForTimeout(200);
 await page.screenshot({path:require('path').join(__dirname,'screenshots','390-web-money.png'),fullPage:true});
 await browser.close();
 if(fail.length){console.error(fail.join('\n'));process.exitCode=1}
})().catch(e=>{console.error(e);process.exitCode=1});
