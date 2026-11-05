import {test,expect} from '@playwright/test';

async function login(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
}

test('analytics workspace reports truthful model status and keeps source navigation',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await login(page);
  await page.locator('.sidebar').getByRole('button',{name:'Помощник',exact:true}).click();
  const workspace=page.getByRole('region',{name:'Аналитический центр CRS'});
  await expect(workspace.getByRole('status')).toContainText('Готовые сводки');
  await expect(workspace.getByRole('button',{name:/^Помощник/})).toBeDisabled();
  await workspace.getByLabel('Вид анализа').selectOption('incidents');
  await workspace.getByRole('button',{name:/Сформировать сводку/}).click();
  await expect(workspace.locator('.crs-ai-answer-text')).toContainText('Указано событий: 1');
  await expect(workspace.getByRole('button',{name:/Synthetic incident/})).toBeVisible();
  await page.screenshot({path:'test-results/crs-ai-latest-1440.png',fullPage:true});
  await workspace.getByRole('button',{name:'Отчёт 1',exact:true}).click();
  await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Synthetic incident');
});

test('analytics workspace stays within 390px viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await page.getByRole('button',{name:'Дополнительные разделы'}).click();
  await page.getByRole('menuitem',{name:'Помощник'}).click();
  await expect(page.getByRole('region',{name:'Аналитический центр CRS'})).toBeVisible();
  await page.screenshot({path:'test-results/crs-ai-latest-390.png',fullPage:true});
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport+1);
});
