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
  await page.getByRole('button',{name:'Дополнительные разделы'}).click();
  await expect(page.getByRole('menu',{name:'Дополнительные разделы'})).toBeVisible();
  await page.screenshot({path:'test-results/workbench-v4-mobile.png',fullPage:true});
});
