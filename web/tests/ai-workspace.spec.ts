import {test,expect} from '@playwright/test';

async function login(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
}

test('analytics workspace reports truthful model status and keeps source navigation',async({page})=>{
  await login(page);
  await page.getByRole('button',{name:'Готовые сводки',exact:true}).first().click();
  const workspace=page.getByRole('region',{name:'Аналитический центр CRS'});
  await expect(workspace).toContainText('GPT пока не подключён');
  await expect(workspace.getByRole('button',{name:/Диалог с GPT/})).toBeDisabled();
  await workspace.getByLabel('Вид анализа').selectOption('incidents');
  await workspace.getByRole('button',{name:'Сформировать анализ'}).click();
  await expect(workspace.getByRole('heading',{name:/Указано событий: 1/})).toBeVisible();
  await expect(workspace.getByRole('button',{name:/Synthetic incident/})).toBeVisible();
  await workspace.getByRole('button',{name:'Отчёт 1',exact:true}).click();
  await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Synthetic incident');
});

test('analytics workspace stays within 390px viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await page.getByRole('button',{name:'Дополнительные разделы'}).click();
  await page.getByRole('menuitem',{name:'Готовые сводки'}).click();
  await expect(page.getByRole('region',{name:'Аналитический центр CRS'})).toBeVisible();
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport+1);
});
