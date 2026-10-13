import type {ClassSession} from '@/app/_model/types';
import type {ReviewSection} from '@/app/_model/lecture-analysis';
import {analysisSource,readReview,writeReview} from './lecture-analysis-service';
import {readSectionRun} from './local-sections';

export type NameProposal={id:string;name:string|null;evidence:string;original:ReviewSection;pageId:string;source:string};
export async function suggestSectionNames(session:ClassSession,pageId:string,sections:ReviewSection[]):Promise<NameProposal[]>{
 if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('이름 제안은 로컬 분석 서버(8769)가 필요합니다.');
 const source=analysisSource(session),run=readSectionRun(session.id),slide=session.slides.find(s=>s.id===pageId);
 if(!slide||readReview(session.id)?.source!==source)throw Error('자료가 변경되었습니다. 분석 결과를 확인해 주세요.');
 const request=async(path:string,body:BodyInit,json=false)=>{const r=await fetch(`http://127.0.0.1:8769/${path}`,{method:'POST',headers:{'Content-Type':json?'application/json':'application/octet-stream'},body,signal:AbortSignal.timeout(600000)});if(!r.ok)throw Error(r.status===409?'다른 분석이 실행 중입니다. 잠시 후 다시 시도해 주세요.':`이름 제안 실패 (${r.status}). 기존 이름은 유지됩니다.`);return r.json();};
 let elements=run?.source===source?run.elements?.[pageId]:undefined;
 if(!elements?.length){
  if(!slide.imageUrl)throw Error('슬라이드 이미지가 없습니다.');
  const url=new URL(slide.imageUrl,location.origin);
  if(url.protocol!=='data:'&&url.origin!==location.origin)throw Error('외부 이미지는 전송하지 않습니다.');
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('이미지를 읽을 수 없습니다.');
  const blob=await response.blob();if(blob.size>8*1024*1024)throw Error('이미지 용량 한도 초과');
  elements=(await request('layout',blob)).elements;
 }
 const data=await request('section-names',JSON.stringify({elements,sections:sections.map(({id,x,y,w,h})=>({id,x,y,w,h}))}),true);
 const seen=new Set<string>();
 if(!Array.isArray(data.suggestions)||data.suggestions.length!==sections.length)throw Error('이름 제안 결과가 불완전합니다.');
 return data.suggestions.map((s:{id:string;name:string|null;evidence:string})=>{
  const original=sections.find(v=>v.id===s.id);
  if(!original||seen.has(s.id)||!(s.name===null||typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=40)||typeof s.evidence!=='string')throw Error('이름 제안 형식 오류');
  seen.add(s.id);return {...s,original,pageId,source};
 });
}
export function applySectionName(sessionId:string,proposal:NameProposal){
 const current=readReview(sessionId),items=current?.sections[proposal.pageId]??[],section=items.find(s=>s.id===proposal.id);
 if(!current||current.source!==proposal.source||JSON.stringify(section)!==JSON.stringify(proposal.original))throw Error('제안 후 영역이 변경되었습니다. 이름을 다시 제안해 주세요.');
 if(!proposal.name)throw Error('읽을 수 있는 텍스트가 부족합니다. 직접 이름을 입력해 주세요.');
 writeReview({...current,sections:{...current.sections,[proposal.pageId]:items.map(s=>s.id===proposal.id?{...s,name:proposal.name!,concepts:[proposal.name!],modifiedByInstructor:true}:s)},reviewedPages:current.reviewedPages.filter(p=>p!==proposal.pageId)});
}
