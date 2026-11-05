import {test,expect, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

type Credentials={manager_login:string;manager_password:string};
const credentialFile=process.env.CRS_OWNER_CREDENTIAL_FILE || process.env.OWNER_CREDENTIAL_FILE;
test.skip(!credentialFile || !(process.env.CRS_WEB_URL || process.env.OWNER_DEMO_URL),'Requires an explicitly selected local cabinet and credentials');
async function signIn(page:Page) {
  const credentials=JSON.parse(readFileSync(credentialFile!,'utf8')) as Credentials;
  await page.goto('/');
  await page.getByLabel('Логин',{exact:true}).fill(credentials.manager_login);
  await page.getByLabel('Пароль',{exact:true}).fill(credentials.manager_password);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Объекты и отчёты',exact:true})).toBeVisible();
  return credentials;
}

test('owner uses the same cabinet for all reports with no external history mode',async({page})=>{
  const legacyRequests:string[]=[];
  page.on('request',r=>{if(/owner-demo|\/archive/.test(r.url()))legacyRequests.push(r.url());});
  await signIn(page);
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.sidebar,.bottom-nav')).not.toContainText(/MAX|Архив/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
  await page.locator('.sidebar').getByRole('button',{name:'Отчёты',exact:true}).click({force:true});
  await expect(page.getByRole('region',{name:'Журнал отчётов'})).toBeVisible();
  expect(legacyRequests).toEqual([]);
});

test('imported evidence uses ordinary protected attachments',async({page,request})=>{
  const credentials=await signIn(page);
  const login=await request.post('/api/v1/auth/login',{data:{login:credentials.manager_login,password:credentials.manager_password}});
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`};
  const reports=await (await request.get('/api/v1/reports?page_size=200',{headers})).json();
  const imported=reports.find((r:any)=>r.origin==='imported' && r.evidence?.photos?.some((p:any)=>p.relation==='same_message'));
  test.skip(!imported,'The selected fixture has no directly linked imported photo');
  await page.evaluate(id=>{window.location.hash=`report/${id}`;},imported.id);
  const detail=page.getByRole('region',{name:'Просмотр отчёта'});
  await expect(detail).toContainText('Сохранён');
  await expect(detail.getByRole('heading',{name:'Проверка',exact:true})).toHaveCount(0);
  await expect(detail.locator('img').first()).toBeVisible();
  expect(await detail.locator('img').first().evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  const id=imported.evidence.photos.find((p:any)=>p.relation==='same_message').id;
  expect((await request.get(`/api/v1/attachments/${id}`)).status()).toBe(401);
  expect((await request.get(`/api/v1/attachments/${id}`,{headers})).ok()).toBeTruthy();
  await detail.getByText('Текст отчёта',{exact:true}).click();
  await expect(detail.locator('.owner-source-text')).toBeVisible();
});
