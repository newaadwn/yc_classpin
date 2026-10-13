/* eslint-disable @typescript-eslint/no-require-imports -- isolated browser test */
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/praisy/AppData/Local/Programs/Python/Python312/Lib/site-packages/playwright/driver/package');
function pdf(){
 const text='BT /F1 28 Tf 50 400 Td (Convolution and Pooling) Tj 0 -60 Td (Explanation and diagram) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
 let data='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(data.length);data+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=data.length;data+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(data);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Deterministic worker responses exercise UI only. /api/convert is NOT mocked.
  const sections=[{id:'a',name:'Convolution 설명',x:.05,y:.2,w:.4,h:.5,text:'설명'},{id:'b',name:'Convolution 그림',x:.55,y:.2,w:.4,h:.5,text:'그림'}];
  let fail=false;
  await page.route('http://127.0.0.1:8769/**',async route=>{
   const endpoint=route.request().url().split('/').pop();
   if(endpoint==='native-sections'){calls.push(JSON.parse(route.request().postData()));if(fail)return route.fulfill({status:422,contentType:'application/json',body:'{}'});}
   const data=endpoint==='layout'?{elements:sections.map((s,id)=>({id,kind:id?'image':'text',text:s.text,box:[s.x,s.y,s.x+s.w,s.y+s.h]}))}:endpoint==='layout-candidates'?{candidates:sections}:{status:'complete',sections};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:3000/admin/dashboard');
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'업로드',exact:true}).click({timeout:120000});
  const chooser=await chooserPromise;await chooser.setFiles({name:'analysis-workflow-fixture.pdf',mimeType:'application/pdf',buffer:pdf()});
  const dialog=page.getByRole('dialog');await dialog.waitFor();await page.getByRole('button',{name:'직접 설정하고 분석'}).click();
  assert.equal(calls.length,0,'selecting file must not start analysis');
  const toStep=async(name)=>{for(let i=0;i<9;i++){if(await page.getByRole('heading',{name,exact:true}).isVisible())return;await page.getByRole('button',{name:'다음',exact:true}).click();}throw Error('Missing wizard step: '+name);};
  await page.screenshot({path:'output/analysis-wizard.png',animations:'disabled'});
  await toStep('어떤 분야를 다루나요?');
  await dialog.getByRole('checkbox',{name:'공학·IT',exact:true}).uncheck();
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'강의 분야를 하나 이상'}).waitFor();
  await dialog.getByRole('checkbox',{name:'공학·IT',exact:true}).check();
  await dialog.getByRole('checkbox',{name:'경영·경제',exact:true}).check();
  await page.getByRole('button',{name:'이전',exact:true}).click();
  await page.getByRole('button',{name:'다음',exact:true}).click();
  assert.equal(await dialog.getByRole('checkbox',{name:'경영·경제',exact:true}).isChecked(),true);
  await toStep('질문 영역을 얼마나 나눌까요?');await dialog.getByRole('radio',{name:/세밀하게/}).check();
  await page.getByRole('button',{name:'이전',exact:true}).click();await page.getByRole('button',{name:'다음',exact:true}).click();assert.equal(await dialog.getByRole('radio',{name:/세밀하게/}).isChecked(),true);
  await toStep('이렇게 분석할게요');await dialog.getByRole('button',{name:'이 설정으로 업로드 · 분석 시작'}).click();
  await page.waitForURL('**/analysis',{timeout:120000});
  await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor({timeout:120000});
  assert.equal(calls[0].config.granularity,'fine');assert.deepEqual(calls[0].config.focusElements,['concept','image']);
  const url=page.url(),id=url.split('/').at(-2);
  assert.deepEqual(calls[0].config.field,['engineering_it','business']);
  const read=()=>page.evaluate(id=>JSON.parse(localStorage.getItem('classpin-analysis-review-v1:'+id)),id);
  assert.equal((await read()).confirmed,undefined);
  await page.getByRole('button',{name:'분석 확정 · 질문 기능 시작'}).click();await page.getByRole('alert').filter({hasText:'검수'}).waitFor();
  await page.getByLabel('영역 표시 방식',{exact:true}).selectOption('layout');assert.equal(await page.getByRole('button',{name:/영역 선택$/}).count(),2);
  await page.getByLabel('영역 표시 방식',{exact:true}).selectOption('sections');
  await page.getByRole('button',{name:'Convolution 설명 영역 선택',exact:true}).click();await page.getByRole('button',{name:'Convolution 그림 영역 선택',exact:true}).click();
  await page.getByRole('button',{name:'선택 영역 합치기'}).click();
  let r=await read(),p=Object.keys(r.sections)[0],merged=r.sections[p][0];assert.equal(r.sections[p].length,1);
  await page.getByLabel(`${merged.id} 영역 이름`,{exact:true}).fill('Convolution 핵심 개념');
  await page.getByRole('button',{name:'Convolution 핵심 개념 영역 선택'}).click();await page.getByRole('button',{name:'좌우로 나누기'}).click();
  r=await read();assert.equal(r.sections[p].length,2);
  await page.getByLabel('질문 영역으로 사용',{exact:true}).nth(1).uncheck();
  await page.getByRole('button',{name:'이 페이지 검수 완료'}).click();
  await page.screenshot({path:'output/analysis-review-browser.png',fullPage:true});
  await page.getByRole('button',{name:'분석 확정 · 질문 기능 시작'}).click();await page.waitForURL(`**/admin/session/${id}`);
  assert.equal((await read()).confirmed.sections[p].filter(s=>s.enabled).length,1);
  await page.goto(url);await page.getByRole('button',{name:'분석 설정',exact:true}).click();await page.getByRole('button',{name:'직접 설정하고 분석'}).click();
  await toStep('질문 영역을 얼마나 나눌까요?');await page.getByRole('radio',{name:/크게 나누기/}).check();await toStep('이렇게 분석할게요');await page.getByRole('button',{name:'설정 저장 · 분석 시작'}).click();
  await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor();assert.equal(calls.length,1,'edited page should not be overwritten or reanalyzed');
  r=await read();assert.equal(r.config.granularity,'coarse');assert.equal(r.sections[p][0].name,'Convolution 핵심 개념 1');
  await page.getByLabel('재분석 보존 정책').selectOption('replace');page.on('dialog',d=>d.accept());
  fail=true;await page.getByRole('button',{name:'이 페이지 다시 분석'}).click();await page.getByText('이 페이지 분석 실패:',{exact:false}).waitFor();
  fail=false;await page.getByRole('button',{name:'이 페이지 다시 분석'}).click();await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor();
  r=await read();assert.equal(r.sections[p][0].id,'a');assert.equal(r.confirmed.sections[p][0].name,'Convolution 핵심 개념 1','old snapshot preserved');
  await page.reload();await page.getByRole('heading',{name:'질문 영역 검수'}).waitFor();assert.equal((await read()).config.granularity,'coarse');
  await page.getByRole('button',{name:'분석 설정',exact:true}).click();await page.getByRole('button',{name:'직접 설정하고 분석'}).click();await page.getByRole('radio',{name:/연속 강의/}).check();await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByLabel('강의/과목 이름',{exact:true}).fill('AI융합입문');await page.getByLabel('현재 차시',{exact:true}).fill('3');await toStep('이렇게 분석할게요');await page.getByRole('button',{name:'설정 저장 · 분석 시작'}).click();
  await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor();r=await read();assert.equal(r.config.sequenceNumber,3);assert.ok(r.config.courseId);assert.equal(r.config.connectPreviousLectures,true);
  const courseId=r.config.courseId;
  await page.getByRole('button',{name:'이 페이지 검수 완료'}).click();await page.getByRole('button',{name:'분석 확정 · 질문 기능 시작'}).click();await page.waitForURL(`**/admin/session/${id}`);
  await page.goto('http://127.0.0.1:3000/admin/dashboard');const secondChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'업로드',exact:true}).click();await (await secondChooser).setFiles({name:'lecture-4.pdf',mimeType:'application/pdf',buffer:pdf()});await page.getByRole('button',{name:'직접 설정하고 분석'}).click();await dialog.getByRole('radio',{name:/연속 강의/}).check();await page.getByRole('button',{name:'다음',exact:true}).click();
  await dialog.getByRole('combobox').first().selectOption(courseId);await dialog.getByLabel('현재 차시',{exact:true}).fill('4');
  await toStep('이렇게 분석할게요');await dialog.getByRole('button',{name:'이 설정으로 업로드 · 분석 시작'}).click();
  await page.waitForURL('**/analysis');await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor();
  assert.equal(calls.at(-1).config.courseId,courseId);assert.equal(calls.at(-1).previous[0].sequenceNumber,3);assert.ok(calls.at(-1).previous[0].concepts.length);
  await page.goto('http://127.0.0.1:3000/admin/dashboard');
  const autoChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'업로드',exact:true}).click();
  await (await autoChooser).setFiles({name:'automatic.pdf',mimeType:'application/pdf',buffer:pdf()});
  await page.getByRole('button',{name:'AI가 알아서 분석 · 바로 시작'}).click();
  await page.waitForURL('**/analysis');await page.getByText('질문 영역 초안 준비 완료',{exact:false}).waitFor();
  assert.equal(calls.at(-1).config.mode,'auto');assert.deepEqual(calls.at(-1).previous,[]);
  await page.reload();await page.getByRole('heading',{name:'질문 영역 검수'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: real PDF conversion/upload; mocked worker UI/config/progress/candidates/merge/rename/split/disable/confirm/preserve/overwrite/failure/retry/reload/series; no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
