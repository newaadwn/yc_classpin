/* eslint-disable @typescript-eslint/no-require-imports -- isolated browser fixture */
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/praisy/AppData/Local/Programs/Python/Python312/Lib/site-packages/playwright/driver/package');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/dev/question-similarity',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({edges:[],pending:0,embedding:'unavailable',embeddedIds:[]})}));
 await page.goto('http://127.0.0.1:3000/demo/soi?view=live');await page.waitForURL('**/admin/session/soi-demo',{timeout:120000});
 await page.evaluate(()=>{
  const sessions=JSON.parse(localStorage.getItem('pin-class-sessions-v1'));const s=structuredClone(sessions.find(s=>s.id==='soi-demo'));s.id='explorer-e2e';s.currentSlide=0;s.showQuestionPins=true;
  const template=s.questions[0];const sections=Array.from({length:4},(_,i)=>({id:'s'+i,name:['시장 배경','핵심 기술','사용 예시','사업 모델'][i],x:.02+i%2*.5,y:.08+Math.floor(i/2)*.46,w:.45,h:.4,enabled:true,source:'manual',modifiedByInstructor:true,concepts:[]}));
  s.questions=[2,8,0,20].flatMap((n,i)=>Array.from({length:n},(_,j)=>({...template,id:`e-${i}-${j}`,sessionId:s.id,slideIndex:0,text:i===1?(j<4?'이 기술은 무엇인가요?':j<7?'이 기술을 왜 사용하나요?':'두 방식의 차이는 무엇인가요?'):'이 개념은 무엇인가요?',x:sections[i].x+.2,y:sections[i].y+.2,status:'unanswered',anchorKind:'point',createdAt:new Date(2026,9,6,0,i,j).toISOString()})));
  sessions.push(s);localStorage.setItem('pin-class-sessions-v1',JSON.stringify(sessions));const source=JSON.stringify(s.slides.map(p=>[p.id,p.imageChecksum??p.imageUrl]));const map={[s.slides[0].id]:sections};localStorage.setItem('classpin-analysis-review-v1:'+s.id,JSON.stringify({version:1,lectureId:s.id,source,config:{excludedPages:[]},sections:map,reviewedPages:[],confirmed:{source,sections:map,config:{excludedPages:[]}}}));
 });

 await page.goto('http://127.0.0.1:3000/admin/session/explorer-e2e/analysis');
 const add=page.getByRole('button',{name:'직접 영역 추가',exact:true});await add.waitFor();
 const count=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('classpin-analysis-review-v1:explorer-e2e')).sections);
 const before=await count();const id=Object.keys(before)[0];await add.click();
 const layer=page.getByRole('group',{name:'슬라이드에서 드래그하여 영역 추가. Esc로 취소'});await layer.scrollIntoViewIfNeeded();const r=await layer.boundingBox();
 await page.mouse.move(r.x+r.width*.6,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.2,r.y+r.height*.2,{steps:5});await page.mouse.up();
 const after=await count();assert.equal(after[id].length,before[id].length+1);
 const box=after[id].at(-1);assert.ok(Math.abs(box.x-.2)<.01&&Math.abs(box.w-.4)<.01);assert.equal(box.modifiedByInstructor,true);
 await add.click();await page.keyboard.press('Escape');assert.equal(await layer.count(),0);
 assert.equal((await count())[id].length,after[id].length);
 await page.reload();await add.waitFor();assert.equal((await count())[id].length,after[id].length);
 const region=page.getByRole('button',{name:'직접 지정한 영역 영역 선택',exact:true});await region.click();
 const nameInput=page.getByRole('textbox',{name:box.id+' 영역 이름',exact:true});await nameInput.focus();await page.keyboard.press('End');await page.keyboard.press('Backspace');
 assert.equal((await count())[id].length,after[id].length);
 await page.locator('button[aria-pressed="true"]').first().focus();await page.keyboard.press('Backspace');assert.equal((await count())[id].length,after[id].length-1);
 await page.getByRole('button',{name:'영역 삭제 되돌리기',exact:true}).click();assert.equal((await count())[id].length,after[id].length);
 await page.route('**/127.0.0.1:8769/layout',route=>route.fulfill({json:{elements:[{id:0,kind:'text',text:'프라이빗 SNS',box:[0,0,1,1]}]}}));
 await page.route('**/127.0.0.1:8769/section-names',route=>route.fulfill({json:{suggestions:route.request().postDataJSON().sections.map(s=>({id:s.id,name:'AI 테스트 제목',evidence:'프라이빗 SNS'}))}}));
 const beforeNames=(await count())[id];
 await page.getByRole('button',{name:'AI로 수동 영역 이름 제안'}).click();
 await page.getByRole('button',{name:'이 이름 적용'}).first().waitFor();
 assert.deepEqual((await count())[id],beforeNames);
 await page.getByRole('button',{name:'이 이름 적용'}).first().click();
 const named=(await count())[id][0];assert.equal(named.name,'AI 테스트 제목');
 for(const key of ['x','y','w','h'])assert.equal(named[key],beforeNames[0][key]);
 await page.getByRole('textbox',{name:beforeNames[1].id+' 영역 이름',exact:true}).fill('강사가 바꾼 이름');
 await page.getByRole('button',{name:'이 이름 적용'}).first().click();
 await page.getByRole('alert').filter({hasText:'제안 후 영역이 변경'}).waitFor();
 assert.equal((await count())[id][1].name,'강사가 바꾼 이름');
 await page.reload();await add.waitFor();assert.equal((await count())[id][0].name,'AI 테스트 제목');
 assert.deepEqual(errors,[]);console.log('PASS draw/delete, AI proposal review, unchanged geometry, saved names (mock inference)');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
