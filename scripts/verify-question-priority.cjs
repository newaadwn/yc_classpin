const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/praisy/AppData/Local/Programs/Python/Python312/Lib/site-packages/playwright/driver/package');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1800,height:1100}});page.setDefaultTimeout(15000);
 await page.route('**/api/dev/question-similarity',route=>route.fulfill({json:{edges:[],pending:0,embedding:'unavailable',embeddedIds:[]}}));
 await page.goto('http://127.0.0.1:3000/demo/soi?view=live');await page.waitForURL('**/admin/session/soi-demo');
 const list=page.getByRole('region',{name:'묶음 질문 우선순위'});await list.waitFor();
 assert.ok(await list.locator('li').count()>0);
 await list.locator('li button').first().click();await page.getByRole('region',{name:'선택 원문 상세'}).waitFor();
 await page.getByLabel('묶음 질문 정렬').selectOption('reactions');
 await page.getByLabel('우선순위 목록 범위').selectOption('all');
 const secondPage=list.locator('li button').filter({has:page.getByText(/^2페이지 ·/)}).first();await secondPage.waitFor();await secondPage.click();
 await page.getByRole('button',{name:'페이지 2',exact:true}).waitFor();await page.getByRole('region',{name:'선택 원문 상세'}).waitFor();
 await page.setViewportSize({width:900,height:1000});
 assert.ok(await list.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 console.log('PASS priority list, sorting, cross-page selection, responsive layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
