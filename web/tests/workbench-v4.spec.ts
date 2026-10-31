import {test, expect, type Page} from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.locator('.topbar-right')).toContainText('manager');
}

test('new desktop command center has a distinct light hero and editorial content modules',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});
  await login(page);
  const hero=page.locator('.wb-command-hero');
  await expect(hero).toBeVisible();
  await expect(hero.getByText('Полученных отчётов')).toBeVisible();
  await expect(page.locator('.wb-command-brief')).toBeVisible();
  await expect(page.locator('.wb-situation-main')).toBeVisible();
  await expect(page.locator('.wb-review')).toBeVisible();
  await expect(page.locator('.wb-section-rule').first()).toBeVisible();
  // Guard against the original visual bugs: oversized site row and vertical status badge.
  const siteBox=await page.locator('.wb-situation-row').first().boundingBox();
  expect(siteBox?.height).toBeLessThan(170);
  const statusBox=await page.locator('.wb-review-item .report-status').first().boundingBox();
  expect(statusBox?.width).toBeGreaterThan(65);
  expect(statusBox?.height).toBeLessThan(45);
  const rgb=await hero.evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(rgb).toBe('rgb(240, 234, 221)');
  const layout=await page.locator('.wb-command').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  expect(layout.split(' ').length).toBe(2);
  await page.screenshot({path:'test-results/workbench-v4-desktop.png',fullPage:true});
});

test('new mobile command center stacks correctly and keeps navigation usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await expect(page.locator('.crs-sidebar')).toBeHidden();
  await expect(page.locator('.wb-command-hero')).toBeVisible();
  await expect(page.locator('.wb-command-brief')).toBeVisible();
  const grid=await page.locator('.wb-command').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  expect(grid.split(' ').length).toBe(1);
  const overviewOverflow=await page.locator('.wb-command-brief').evaluate(el=>el.scrollWidth > el.clientWidth + 2);
  expect(overviewOverflow).toBe(false);
  await page.screenshot({path:'test-results/workbench-v4-mobile.png',fullPage:true});
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
