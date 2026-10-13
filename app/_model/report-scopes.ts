import type {ClassSession} from './types.ts';
import type {CondensedGroup} from './question-condense.ts';
import {mapType,sectorFor,typeNames,type MapMode,type Sector} from './question-map.ts';
export type AnalysisScope={name:string;session:ClassSession;groups:CondensedGroup[]};
export function reportScopes(session:ClassSession,groups:CondensedGroup[],sectors:Record<string,Sector[]>,mode:MapMode):AnalysisScope[]{
 if(mode==='original')return [];
 const buckets=new Map<string,{pages:Set<number>;ids:Set<string>}>();
 const add=(name:string,page:number,ids:string[])=>{const b=buckets.get(name)??{pages:new Set<number>(),ids:new Set<string>()};b.pages.add(page);ids.forEach(id=>b.ids.add(id));buckets.set(name,b);};
 session.slides.forEach((slide,page)=>{
  const qs=session.questions.filter(q=>q.slideIndex===page);
  if(mode==='content'){
   const regions=sectors[slide.id]??[];
   regions.forEach(r=>add(r.name.trim(),page,qs.filter(q=>sectorFor(q,regions)===r.id).map(q=>q.id)));
   const other=qs.filter(q=>!sectorFor(q,regions));if(!regions.length||other.length)add('내용 미분류',page,other.map(q=>q.id));
  }else{
   const key=(q:typeof qs[number])=>mode==='type'?typeNames[mapType(q)]:q.status==='unanswered'?'미답변':q.status==='answered'?'답변됨':'해결됨';
   for(const q of qs)add(key(q),page,[q.id]);if(!qs.length)add('질문 없음',page,[]);
  }
 });
 return [...buckets].map(([name,b])=>{
  const pages=[...b.pages].sort((a,b)=>a-b);const reindex=(q:ClassSession['questions'][number])=>({...q,slideIndex:pages.indexOf(q.slideIndex)});
  const questions=session.questions.filter(q=>b.ids.has(q.id)).map(reindex);
  return {name,session:{...session,slides:pages.map(i=>session.slides[i]),questions},groups:groups.flatMap(g=>{const rows=g.questions.filter(q=>b.ids.has(q.id)).map(reindex);return rows.length?[{...g,page:pages.indexOf(g.page),questions:rows,representative:rows.find(q=>q.id===g.representative.id)??rows[0]}]:[]})};
 });
}
