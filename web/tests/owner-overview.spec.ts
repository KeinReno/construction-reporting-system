import {test,expect, type Page} from '@playwright/test';

async function signIn(page:Page) {
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Объекты и отчёты',exact:true})).toBeVisible();
}

test('monthly chart opens the actual received reports and preserves its selection',async({page})=>{
  await signIn(page);
  const chart=page.getByRole('region',{name:'Отчёты по месяцам'});
  await expect(chart).toContainText('Последние 6 месяцев');
  const month=chart.getByRole('button',{name:/полученных отчётов 2/});
  await month.click();
  await expect(month).toHaveAttribute('aria-pressed','true');
  const sources=chart.getByLabel('Отчёты выбранного месяца');
  await expect(sources.getByRole('button').filter({hasText:'Synthetic site A'})).toHaveCount(2);
  await sources.getByRole('button').filter({hasText:'25/10/2026'}).click();
  const detail=page.getByRole('region',{name:'Просмотр отчёта'});
  await expect(detail).toContainText('Synthetic work description');
  await detail.getByRole('button',{name:'← Назад'}).click();
  await expect(month).toHaveAttribute('aria-pressed','true');
  await expect(sources).toBeVisible();
});

test('six month labels remain readable without overflowing the page',async({page})=>{
  await page.route('**/api/v1/reports?**',async route=>{
    const response=await route.fetch();
    const reports=await response.json();
    const received=reports.find((report:{receipt_id:string|null})=>report.receipt_id);
    expect(received).toBeTruthy();
    const months=[1,2,3,4,5,6].map((month,index)=>({...received,id:`synthetic-month-${index}`,data:{...received.data,work_date:`2026-${String(month).padStart(2,'0')}-15`}}));
    await route.fulfill({response,json:months});
  });
  await page.setViewportSize({width:320,height:850});
  await signIn(page);
  const labels=page.getByRole('region',{name:'Отчёты по месяцам'}).locator('.owner-activity-label');
  await expect(labels).toHaveCount(6);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:850});
    const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    const boxes=await labels.evaluateAll(nodes=>nodes.map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right})));
    expect(boxes.every((box,index)=>index===0 || box.left>=boxes[index-1].right)).toBeTruthy();
  }
});

test('one cabinet keeps imported and Android reports with no source-specific mode',async({page})=>{
  const oldRequests:string[]=[];
  page.on('request',request=>{if(/owner-demo|owner-demo-info|\/archive/.test(request.url()))oldRequests.push(request.url());});
  await signIn(page);
  const home=page.getByRole('region',{name:'Объекты и отчёты'});
  await expect(home).toContainText('Ожидают проверки: 1');
  await expect(home).toContainText('25/10/2026');
  await page.locator('.sidebar').getByRole('button',{name:'Отчёты',exact:true}).click();
  const journal=page.getByRole('region',{name:'Журнал отчётов'});
  await expect(journal.locator('.report-row')).toHaveCount(2);
  const imported=journal.locator('.report-row').filter({hasText:'24/10/2026'});
  await expect(imported).toContainText('Сохранён');
  await imported.click();
  const detail=page.getByRole('region',{name:'Просмотр отчёта'});
  await expect(detail.getByRole('heading',{name:'Проверка',exact:true})).toHaveCount(0);
  await detail.getByText('Текст отчёта',{exact:true}).click();
  await expect(detail.getByText('Synthetic historical source',{exact:true})).toBeVisible();
  await expect(detail.getByText(/Автор: Synthetic author/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/MAX|Сводка архива|Анализ архива|Архив MAX/);
  expect(oldRequests).toEqual([]);
});

test('object overview and date filters keep the common history reachable',async({page})=>{
  await signIn(page);
  const home=page.getByRole('region',{name:'Объекты и отчёты'});
  await expect(home).toContainText('25/10/2026');
  await home.getByRole('button',{name:/^Synthetic site A Последний отчёт:/}).click();
  await page.getByRole('button',{name:'Фильтры',exact:true}).click();
  await page.getByLabel('С',{exact:true}).fill('26/10/2026');
  await expect(page.getByRole('article',{name:'Карточка объекта Synthetic site A'})).toContainText('Нет отчётов за выбранный период.');
  const authorOptions=page.getByRole('combobox',{name:'Автор',exact:true}).locator('option');
  await expect(authorOptions).toHaveCount(2);
  await expect(authorOptions.filter({hasText:'foreman'})).toHaveCount(0);
  await page.getByLabel('С',{exact:true}).fill('');
  const site=page.getByRole('article',{name:'Карточка объекта Synthetic site A'});
  await site.getByRole('button',{name:'Работы и отчёты',exact:true}).click();
  await expect(site.locator('.object-timeline-item')).toHaveCount(2);
  await site.getByRole('button',{name:'Открыть отчёт',exact:true}).first().click();
  await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Synthetic weld');
});

test('object overview connects dated events and separate money totals to the source report',async({page})=>{
  await signIn(page);
  await page.getByRole('region',{name:'Объекты и отчёты'}).getByRole('button',{name:/^Synthetic site A Последний отчёт:/}).click();
  const site=page.getByRole('article',{name:'Карточка объекта Synthetic site A'});
  const reports=site.getByRole('region',{name:'Последние отчёты объекта'});
  await expect(reports).toContainText('Synthetic work description');
  const money=site.getByRole('region',{name:'Деньги в обзоре объекта'});
  await expect(money).toContainText('125,50');
  await expect(money).toContainText('Поступление');
  await expect(money).toContainText('Не указано');
  await expect(money).not.toContainText('Остаток');
  const events=site.getByRole('region',{name:'События из отчётов'});
  const event=events.getByRole('button',{name:/Synthetic incident/});
  await expect(event).toContainText('25/10/2026');
  await event.click();
  const detail=page.getByRole('region',{name:'Просмотр отчёта'});
  await expect(detail.getByText('Synthetic incident',{exact:true})).toBeVisible();
  await detail.getByRole('button',{name:'← Назад'}).click();
  await expect(events).toBeVisible();
  await money.getByRole('button',{name:'Подробнее'}).click();
  await expect(site.getByRole('region',{name:'Деньги объекта'})).toContainText('20/10/2026');
});
