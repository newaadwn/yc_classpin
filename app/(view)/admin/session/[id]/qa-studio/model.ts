import type {ClassSession,Question} from '@/app/_model/types';
import {audienceSimulation} from '../../../../../_model/question-map-simulation.ts';
export type DemoQuestion=Question&{person:number;topic:string};
export type TopicState='waiting'|'held'|'done';
export const labels:Record<string,string>={confusing:'내용과 연결 흐름 다시 설명',why:'주장의 근거 확인',example:'구체적인 사례 요청',concept:'핵심 개념 다시 짚기',important:'중요 질문',error:'오류·문제 확인'};
export function makeFixtures(session:ClassSession):DemoQuestion[]{
 return audienceSimulation(session).map((q,i)=>({...q,status:'unanswered',person:i%50+1,topic:`${q.slideIndex}:${q.category}`}));
}
export function makeSessionFixtures(session:ClassSession):DemoQuestion[]{
 return session.questions.map((q,i)=>({...q,person:i%50+1,topic:`${q.slideIndex}:${q.category}`}));
}
export function summarize(questions:DemoQuestion[],done:string[],held:string[]){
 const groups=new Map<string,DemoQuestion[]>();
 for(const q of questions)groups.set(q.topic,[...(groups.get(q.topic)??[]),q]);
 return [...groups].map(([id,items])=>{
  const pending=items.filter(q=>q.status==='unanswered'&&!done.includes(q.id));
  return {
   id,items,title:labels[items[0].category]??'기타 질문',page:items[0].slideIndex,
   people:new Set(items.map(q=>q.person)).size,pending:pending.length,
   state:(pending.length===0?'done':held.includes(id)?'held':'waiting') as TopicState,
  };
 }).sort((a,b)=>b.pending-a.pending||a.page-b.page||a.id.localeCompare(b.id));
}
