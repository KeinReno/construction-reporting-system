import {test,expect, type Page} from '@playwright/test';

async function signIn(page:Page) {
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Объекты и отчёты',exact:true})).toBeVisible();
}

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
  await detail.getByText('Первичная запись',{exact:true}).click();
  await expect(detail.getByText('Synthetic historical source',{exact:true})).toBeVisible();
  await expect(detail.getByText(/Указанный автор: Synthetic author/)).toBeVisible();
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
  await expect(page.getByRole('article',{name:'Карточка объекта Synthetic site A'})).toContainText('За выбранные условия отчётов нет');
  await expect(page.getByRole('combobox',{name:'Автор',exact:true}).locator('option').filter({hasText:'Оператор переноса'})).toHaveCount(1);
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
  await expect(money).toContainText('Остаток не рассчитан');
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
