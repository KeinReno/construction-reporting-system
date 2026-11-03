import {test,expect} from '@playwright/test';

test('owner finds a report from the simplified home and returns to it',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Объекты и отчёты'})).toBeVisible();
  const home=page.getByRole('region',{name:'Объекты и отчёты'});
  await expect(home).toContainText('Ожидают проверки: 1');
  await expect(home).toContainText('Synthetic site A');
  await home.getByRole('button',{name:/Открыть отчёт за/}).first().click();
  await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Synthetic weld');
  await page.getByRole('button',{name:'← Назад'}).click();
  await expect(home).toBeVisible();
  await page.getByRole('button',{name:'Все отчёты',exact:true}).click();
  await page.getByText('Отчёты по авторам',{exact:true}).first().click();
  await expect(page.locator('.journal-author-bar').first()).toBeVisible();
});

test('money totals follow filters and invalid dates do not claim zero operations',async({page})=>{
  await page.goto('/');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Деньги',exact:true}).click();
  const journal=page.getByRole('region',{name:'Журнал денежных операций'});
  await expect(journal).toContainText('125,50');
  await page.getByLabel('Вид операции').selectOption('funding_received');
  await expect(journal.locator('.metric').filter({hasText:'Расход'})).toContainText('Нет');
  await page.getByLabel('С',{exact:true}).fill('25/10/2026');await page.getByLabel('По',{exact:true}).fill('20/10/2026');
  await expect(journal).toContainText('Проверьте период');
  await expect(journal.locator('.metric')).toHaveCount(0);
});
