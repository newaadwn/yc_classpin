import type {Question} from '../../../../../_model/types.ts';
export type LiveEvent={id:string;at:number;kind:'page';page:number}|{id:string;at:number;kind:'question';question:Question}|{id:string;at:number;kind:'done';questionId:string};
export function validLiveEvent(value:unknown,sessionId:string,pages:number):value is LiveEvent{
 if(!value||typeof value!=='object')return false;
 const e=value as LiveEvent;
 if(typeof e.id!=='string'||!Number.isFinite(e.at))return false;
 if(e.kind==='page')return Number.isInteger(e.page)&&e.page>=0&&e.page<pages;
 if(e.kind==='done')return typeof e.questionId==='string';
 if(e.kind!=='question')return false;
 const q=e.question;
 return !!q&&typeof q.id==='string'&&q.sessionId===sessionId&&Number.isInteger(q.slideIndex)&&q.slideIndex>=0&&q.slideIndex<pages&&typeof q.text==='string'&&q.text.trim().length>0&&q.text.length<=500&&typeof q.category==='string'&&q.anchorKind==='point'&&typeof q.x==='number'&&typeof q.y==='number'&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1;
}
export function liveSnapshot(events:LiveEvent[],initialQuestions:Question[]=[],initialPage=0){
 let page=initialPage;const questions=new Map<string,Question>(initialQuestions.map(q=>[q.id,q])),done=new Set<string>();
 for(const e of [...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){
  if(e.kind==='page')page=e.page;
  if(e.kind==='question')questions.set(e.question.id,{...e.question,status:'unanswered'});
  if(e.kind==='done')done.add(e.questionId);
 }
 return {page,questions:[...questions.values()].map(q=>({...q,status:done.has(q.id)?'resolved' as const:'unanswered' as const}))};
}
