import type {SectionQuestionCluster} from './section-questions';
export type PrioritySort='priority'|'count'|'reactions'|'latest';
export function rankQuestionClusters(groups:SectionQuestionCluster[],sort:PrioritySort){
 return groups.flatMap(group=>{
  const open=group.questions.filter(q=>q.original.status==='unanswered');
  if(!open.length)return [];
  const times=open.map(q=>Date.parse(q.original.createdAt)||0);
  return [{group,count:open.length,reactions:open.reduce((n,q)=>n+Math.max(0,q.original.reactionCount||0),0),oldest:Math.min(...times),latest:Math.max(...times)}];
 }).sort((a,b)=>(sort==='reactions'?b.reactions-a.reactions||b.count-a.count:sort==='latest'?b.latest-a.latest:sort==='count'?b.count-a.count:b.count-a.count||b.reactions-a.reactions)||a.oldest-b.oldest||a.group.id.localeCompare(b.group.id));
}
