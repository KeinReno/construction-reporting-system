import {test,expect} from '@playwright/test';
async function signIn(page:import('@playwright/test').Page){
 await page.goto('/');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.locator('.topbar-right')).toContainText('manager');
}
test('production failure leaves the journal and summary available',async({page})=>{
 await page.route('**/api/v1/analytics/production*',route=>route.fulfill({status:503,json:{detail:'Synthetic failure'}}));
 await signIn(page);await page.locator('.sidebar').getByRole('button',{name:'Отчёты',exact:true}).click();await expect(page.locator('.report-row').first()).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'Аналитика',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Данные производства не загружены'})).toBeVisible();await expect(page.locator('.crs-control-overview')).toBeVisible();
});
test('production calendar, drilldown and mobile tables',async({page})=>{
 await signIn(page);await page.locator('.sidebar').getByRole('button',{name:'Аналитика',exact:true}).click();
 const production=page.locator('.production-analytics');await expect(production.getByRole('heading',{name:'Календарь смен'})).toBeVisible();
 const day=production.locator('.production-day.is-work').first();await day.click();await expect(production.locator('.production-day-detail')).toBeVisible();
 await production.locator('.production-day-reports').getByRole('button',{name:/Отчёт 1/}).click();await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toBeVisible();await page.goBack();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});
