import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Логин', {exact:true}).fill('manager');
  await page.getByLabel('Пароль', {exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.locator('.topbar-right')).toContainText('manager');
}

test('desktop navigation collapses without losing pages', async ({page}) => {
  await login(page);
  const sidebar=page.locator('.crs-sidebar');
  await expect(sidebar).toHaveAttribute('data-collapsed','false');
  await page.getByRole('button',{name:'Свернуть боковую панель'}).click();
  await expect(sidebar).toHaveAttribute('data-collapsed','true');
  await page.getByRole('button',{name:'Развернуть боковую панель'}).click();
  await expect(sidebar).toHaveAttribute('data-collapsed','false');
  await page.keyboard.press('Control+b');
  await expect(sidebar).toHaveAttribute('data-collapsed','true');
  await page.keyboard.press('Control+b');
  await expect(sidebar).toHaveAttribute('data-collapsed','false');
});

test('native filter selectors, calendar fields and observed KPI progress', async ({page}) => {
  await login(page);
  await expect(page.getByRole('combobox',{name:'Объект',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Автор',exact:true}).selectOption({label:'manager'});
  await expect(page.getByRole('progressbar',{name:'Доля отчётов с квитанцией'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'С',exact:true})).toBeVisible();
  await expect(page.getByLabel('Выбрать дату: С')).toHaveAttribute('type','date');
});

test('mobile navigation keeps advanced pages in More', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await expect(page.locator('.crs-sidebar')).toBeHidden();
  await page.getByRole('button',{name:'Дополнительные разделы'}).click();
  await expect(page.getByRole('menu',{name:'Дополнительные разделы'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Аналитика'}).click();
  await expect(page.getByRole('heading',{name:'Аналитика',exact:true})).toBeVisible();
});
