import type {ClassSession} from '@/app/_model/types';
import {readSectionRun,sectionSource} from './local-sections';
import {getAccessToken} from '@/app/_infrastructure/supabase/client';
const pending=new Map<string,Promise<string>>();let queue:Promise<unknown>=Promise.resolve();
export function summarizeScope(session:ClassSession,material:ClassSession,name:string,owner:string){
 const run=readSectionRun(material.id);const valid=run?.source===sectionSource(material)?run:null;
 const key=JSON.stringify([owner,name,session.slides.map(s=>[s.id,s.imageChecksum,s.imageUrl]),session.questions,valid?.elements,valid?.nativePages]);
 const existing=pending.get(key);if(existing)return existing;
 const task=queue.catch(()=>{}).then(async()=>{
 const pages=[];
 for(const slide of session.slides){
  let elements=valid?.elements?.[slide.id]??valid?.nativePages?.find(p=>p.pageIndex===slide.pageIndex)?.elements;
  if(!elements?.some(e=>e.text.trim())){
   if(!slide.imageUrl)throw Error(`${slide.pageIndex+1}페이지 자료를 읽을 수 없습니다.`);
   const url=new URL(slide.imageUrl,location.origin);if(!['data:','blob:'].includes(url.protocol)&&url.origin!==location.origin&&url.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??location.origin).origin)throw Error('자료 텍스트가 없습니다. 페이지 의미 영역 분석을 먼저 실행해 주세요.');
   const image=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!image.ok)throw Error('자료 이미지 읽기 실패');const blob=await image.blob();if(blob.size>8*1024*1024)throw Error('자료 이미지 용량 초과');
   const response=await fetch('http://127.0.0.1:8769/layout',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob,signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('자료 내용 추출 실패 · 로컬 분석 서버를 확인해 주세요.');elements=(await response.json()).elements;
  }
  const text=elements?.map(e=>e.text).filter(Boolean).join('\n');if(!text?.trim())throw Error(`${slide.pageIndex+1}페이지의 내용을 추출하지 못했습니다.`);
  pages.push({page:slide.pageIndex+1,text});
 }
 const token=await getAccessToken();const response=await fetch('/api/dev/scope-summary',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({name,pages,questions:session.questions.map(q=>({page:session.slides[q.slideIndex].pageIndex+1,text:q.text,status:q.status}))}),signal:AbortSignal.timeout(570000)});
 const data=await response.json();if(!response.ok)throw Error(data?.error?.code==='MODEL_BUSY'?'다른 AI 분석이 실행 중입니다. 잠시 후 다시 시도해 주세요.':'AI 요약 생성에 실패했습니다. 로컬 모델과 자료 내용을 확인하고 다시 시도해 주세요.');return data.paragraph as string;
 });pending.set(key,task);queue=task;void task.catch(()=>pending.delete(key));return task;
}
