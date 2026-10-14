import type {ClassSession,Question} from './types.ts';
import type {CondensedGroup} from './question-condense.ts';
import type {Sector} from './question-map.ts';
export type ReviewTopic={id:string;page:number;label:string;questions:Question[];pending:number;repeated:number};
/** Counts are evidence for review, not a learner understanding score. */
export function reexplainTopics(session:ClassSession,groups:CondensedGroup[],sectors:Record<string,Sector[]>):ReviewTopic[]{
 const buckets=new Map<string,ReviewTopic>();
 const source=new Map(session.questions.map(q=>[q.id,q]));
 const seen=new Set<string>();
 for(const group of groups){
  const slide=session.slides[group.page];
  const region=(sectors[slide?.id]??[]).find(r=>r.id===group.region);
  const rows=group.questions.flatMap(q=>{const original=source.get(q.id);if(!original||seen.has(q.id)||original.slideIndex!==group.page)return [];seen.add(q.id);return [original];});
  if(!rows.length)continue;
  // Unlabelled questions stay separate; do not invent a shared subject for a whole page.
  const id=JSON.stringify([slide?.id??group.page,region?.id??rows.map(q=>q.id).sort()]);
  const topic=buckets.get(id)??{id,page:group.page,label:region?.name??group.representative.text,questions:[],pending:0,repeated:0};
  topic.questions.push(...rows);topic.pending+=rows.filter(q=>q.status==='unanswered').length;topic.repeated+=Math.max(0,rows.length-1);buckets.set(id,topic);
 }
 return [...buckets.values()].filter(t=>t.pending>0||t.repeated>0).sort((a,b)=>b.pending-a.pending||b.repeated-a.repeated||b.questions.length-a.questions.length||a.page-b.page||a.id.localeCompare(b.id)).slice(0,3);
}
