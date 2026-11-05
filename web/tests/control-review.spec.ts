import {test,expect} from '@playwright/test';

async function signIn(page:import('@playwright/test').Page){
 await page.goto('/');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('SyntheticPassword123');await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.locator('.topbar-right')).toContainText('manager');
}
test('analytics includes measured categories and opens visible source list',async({page})=>{
 await signIn(page);await page.locator('.sidebar').getByRole('button',{name:'Аналитика',exact:true}).click();
 const overview=page.locator('.crs-control-overview');await expect(overview.getByRole('heading',{name:'Где нужно внимание'})).toBeVisible();
 const category=overview.locator('.control-categories button').filter({hasText:'Synthetic weld'});await expect(category).toHaveCount(1);await category.click();
 const sources=page.locator('.control-source-disclosure');await expect(sources).toBeInViewport();await expect(sources).toBeFocused();await sources.getByRole('button',{name:/Открыть отчёт/}).first().click();await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toBeVisible();
});
test('cards keep icon gap and separate work and delivery dates at narrow widths',async({page})=>{
 await signIn(page);await page.locator('.sidebar').getByRole('button',{name:'Отчёты',exact:true}).click();await page.getByRole('button',{name:'Карточки',exact:true}).click();const card=page.locator('.report-card').first();await expect(card).toBeVisible();
 await expect(card).toContainText('Что выполнено');await expect(card).toContainText('Отправлен:');await expect(card).toContainText('приёмка работ отдельно не подтверждена');
 const gap=await card.locator('.control-site-title').evaluate(el=>parseFloat(getComputedStyle(el).columnGap));expect(gap).toBeGreaterThanOrEqual(8);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
 await card.click();await expect(page.getByRole('region',{name:'Просмотр отчёта'})).toContainText('Дата работ');
});
