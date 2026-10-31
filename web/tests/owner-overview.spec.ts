import {test,expect, type Page} from '@playwright/test';

async function signIn(page:Page) {
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Главная',exact:true})).toBeVisible();
}

test('one cabinet keeps imported and Android reports with no source-specific mode',async({page})=>{
  const oldRequests:string[]=[];
  page.on('request',request=>{if(/owner-demo|owner-demo-info|\/archive/.test(request.url()))oldRequests.push(request.url());});
  await signIn(page);
  await expect(page.locator('.metric').filter({hasText:'Ожидают проверки'}).locator('strong')).toHaveText('1');
  await expect(page.locator('.attention-queue-item')).toHaveCount(1);
  await expect(page.locator('.attention-queue-item')).toContainText('25/10/2026');
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
  const board=page.getByRole('region',{name:'Ситуация на объектах'});
  await expect(board.locator('.situation-site')).toContainText('25/10/2026');
  await page.getByLabel('С',{exact:true}).fill('26/10/2026');
  await expect(board.locator('.situation-site')).toContainText('В выбранном периоде сведений нет');
  await expect(page.getByRole('combobox',{name:'Автор',exact:true}).locator('option').filter({hasText:'Оператор переноса'})).toHaveCount(1);
  await page.getByLabel('С',{exact:true}).fill('');
  await expect(board.locator('.situation-site')).toContainText('25/10/2026');
  await board.locator('.situation-site').click();
  const site=page.getByRole('article',{name:'Карточка объекта Synthetic site A'});
  await expect(site.locator('.object-timeline-item')).toHaveCount(2);
  await site.getByRole('button',{name:'Открыть отчёт',exact:true}).first().click();
  await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Synthetic weld');
});
