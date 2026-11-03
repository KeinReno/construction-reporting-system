import {test, expect, type Page} from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.locator('.topbar-right')).toContainText('manager');
}

test('desktop simplified home presents objects and reports with accessible actions',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await login(page);
  const home=page.getByRole('region',{name:'Объекты и отчёты'});
  await expect(home.getByRole('heading',{name:'Объекты',exact:true})).toBeVisible();
  await expect(home.getByRole('heading',{name:'Последние отчёты',exact:true})).toBeVisible();
  await expect(home.getByRole('button',{name:/^Synthetic site A Последний отчёт:/})).toBeVisible();
  await expect(home.getByRole('button',{name:/Открыть отчёт за/}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('mobile simplified home remains readable and navigation usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);
  await expect(page.locator('.crs-sidebar')).toBeHidden();
  await expect(page.getByRole('heading',{name:'Объекты и отчёты'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Последние отчёты'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Дополнительные разделы'}).click();
  await expect(page.getByRole('menu',{name:'Дополнительные разделы'})).toBeVisible();
});

test('site, reports, finance and analytics remain usable in the new shell',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await login(page);
  const sidebar=page.locator('.crs-sidebar');
  await sidebar.getByRole('button',{name:'Объекты',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Объекты',exact:true})).toBeVisible();
  await expect(page.locator('.site-list-card').first()).toBeVisible();
  await page.screenshot({path:'test-results/workbench-v4-objects.png',fullPage:true});
  await sidebar.getByRole('button',{name:'Отчёты',exact:true}).click();
  await expect(page.getByRole('region',{name:'Журнал отчётов'})).toBeVisible();
  await page.screenshot({path:'test-results/workbench-v4-reports.png',fullPage:true});
  await sidebar.getByRole('button',{name:'Деньги',exact:true}).click();
  await expect(page.locator('.crs-money-kpis')).toBeVisible();
  await page.screenshot({path:'test-results/workbench-v4-money.png',fullPage:true});
  await sidebar.getByRole('button',{name:'Аналитика',exact:true}).click();
  await expect(page.locator('.crs-report-chart-bars li').first()).toBeVisible();
  await page.screenshot({path:'test-results/workbench-v4-analytics.png',fullPage:true});
});
