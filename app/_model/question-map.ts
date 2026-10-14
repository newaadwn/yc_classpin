import type { Question } from './types.ts';
export type Sector = {id:string;name:string;x:number;y:number;w:number;h:number};
export type MapMode = 'original'|'status'|'type'|'content';
export const typeNames:Record<string,string>={confusing:'이해 어려움',why:'근거·이유',example:'예시·적용',concept:'개념',other:'기타',mixed:'혼합',none:'질문 없음'};
export function confusionSource(q:Question){
 if(q.category==='confusing')return '선택 유형';
 return /^(모르겠어요|잘 모르겠어요|이해가?\s*안\s*(돼요|됩니다))[.!?\s]*$/u.test(q.text.trim())?'문구 일치':null;
}
export function mapType(q:Question){return confusionSource(q)?'confusing':['why','example','concept'].includes(q.category)?q.category:'other';}
export function hasPoint(q:Question){return (!q.anchorKind||q.anchorKind==='point')&&q.x!==null&&q.y!==null&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1;}
export function validSector(s:Sector){return typeof s.id==='string'&&typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=40&&[s.x,s.y,s.w,s.h].every(Number.isFinite)&&s.x>=0&&s.y>=0&&s.w>=.02&&s.h>=.02&&s.x+s.w<=1.000001&&s.y+s.h<=1.000001;}
export function sectorFor(q:Question,sectors:Sector[]){
 if(!hasPoint(q))return null;
 const hits=sectors.filter(s=>q.x!>=s.x&&q.x!<=s.x+s.w&&q.y!>=s.y&&q.y!<=s.y+s.h);
 return hits.length===1?hits[0].id:null; // overlaps stay unassigned, never double count
}
export function sectorSummaries(questions:Question[],sectors:Sector[],filter:string){
 return [...sectors.map(s=>({id:s.id,name:s.name})),{id:'unassigned',name:'영역 미지정'}].map(s=>{
  const members=questions.filter(q=>(sectorFor(q,sectors)??'unassigned')===s.id);
  const matching=members.filter(q=>filter==='all'||mapType(q)===filter);
  return {...s,questions:matching,pending:matching.filter(q=>q.status==='unanswered').length,totalPending:members.filter(q=>q.status==='unanswered').length};
 });
}
export function pageBucket(qs:Question[],mode:MapMode){
 if(mode==='original')return '페이지 순서';
 if(!qs.length)return '질문 없음';
 const pending=qs.filter(q=>q.status==='unanswered');
 if(mode==='status')return !pending.length?'모두 처리':pending.length===qs.length?'미처리':'일부 처리';
 const counts=new Map<string,number>();for(const q of pending.length?pending:qs)counts.set(mapType(q),(counts.get(mapType(q))??0)+1);
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
 return ranked.length>1&&ranked[0][1]===ranked[1][1]?'혼합':typeNames[ranked[0][0]];
}
