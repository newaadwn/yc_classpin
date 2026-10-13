/* eslint-disable @typescript-eslint/no-require-imports -- standalone browser verification */
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/praisy/AppData/Local/Programs/Python/Python312/Lib/site-packages/playwright/driver/package');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/demo/soi?view=live');
  await page.waitForURL('**/admin/session/soi-demo',{timeout:120000});
  await page.evaluate(()=>{
   const sessions=JSON.parse(localStorage.getItem('pin-class-sessions-v1'));
   const s=sessions.find(s=>s.id==='soi-demo');s.id='section-review-e2e';const template=s.questions[0];
   s.currentSlide=0;s.showQuestionPins=true;
   const texts=['Pooling을 왜 사용하나요?','Pooling을 왜 사용하나요?','Pooling이 무엇인가요?','Max와 Average Pooling 차이는 무엇인가요?','Pooling을 왜 사용하나요?'];
   s.questions=texts.map((text,i)=>({...template,id:`section-test-${i}`,sessionId:s.id,slideIndex:0,x:i===4?.8:.2,y:.4,text,status:'unanswered',createdAt:new Date(2026,9,6,0,0,i).toISOString()}));
   localStorage.setItem('pin-class-sessions-v1',JSON.stringify(sessions));
   const source=JSON.stringify(s.slides.map(s=>[s.id,s.imageChecksum??s.imageUrl]));
   const sections={[s.slides[0].id]:[{id:'left',name:'Pooling 설명',x:.05,y:.2,w:.4,h:.6},{id:'right',name:'별도 개념',x:.65,y:.2,w:.3,h:.6}].map(s=>({...s,enabled:true,source:'manual',modifiedByInstructor:true,concepts:[]}))};
   localStorage.setItem(`classpin-analysis-review-v1:${s.id}`,JSON.stringify({version:1,lectureId:s.id,source,config:{excludedPages:[]},sections,reviewedPages:[],confirmed:{source,sections,config:{excludedPages:[]},confirmedAt:new Date().toISOString()}}));
  });
  await page.goto('http://127.0.0.1:3000/admin/session/section-review-e2e');
  await page.getByRole('button',{name:'섹션별 질문',exact:true}).click({timeout:120000});
  const panel=page.getByRole('complementary',{name:'섹션별 질문 그룹'});
  await panel.waitFor();
  assert.match(await panel.innerText(),/섹션별 질문 5건/);
  assert.equal(await panel.locator('details').count(),4);
  await panel.getByRole('combobox').selectOption('right');
  assert.equal(await panel.locator('details').count(),1);
  await panel.getByRole('combobox').selectOption('left');
  assert.equal(await panel.locator('details').count(),3);
  await panel.locator('details').first().locator('summary').click();
  assert.equal(await panel.locator('details').first().getByRole('button').count(),2);
  await page.screenshot({path:'output/section-question-groups.png'});
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'섹션별 질문',exact:true}).click();
  await page.mouse.click(5,5);await panel.waitFor({state:'hidden'});
  await page.goto('http://127.0.0.1:3000/admin/session/section-review-e2e/present');
  await page.getByRole('button',{name:'섹션별 질문',exact:true}).click({timeout:120000});
  await panel.waitFor();assert.equal(await panel.locator('details').count(),4);
  assert.deepEqual(errors,[]);
  console.log('PASS: live/presentation section panel, strict fixture grouping, section filter, originals, Escape, outside click; no page errors. Fixture sections, not AI-quality validation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
