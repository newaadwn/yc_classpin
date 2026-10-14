import type {ClassSession,Question} from '@/app/_model/types';
import type {Sector} from '@/app/_model/question-map';
import {contentTopics,pageTopic} from '@/app/_model/soi-page-topics';
export {contentTopics,pageTopic};
export function contentBuckets(session:ClassSession,questions:Question[],sectors:Record<string,Sector[]>){
 const buckets=contentTopics.map(name=>({name,questions:[] as Question[],details:new Map<string,Question[]>()}));
 for(const q of questions){
  const regions=sectors[session.slides[q.slideIndex]?.id]??[];
  const matches=regions.filter(r=>q.x!=null&&q.y!=null&&q.x>=r.x&&q.x<=r.x+r.w&&q.y>=r.y&&q.y<=r.y+r.h);
  const region=matches.length===1?matches[0]:undefined;
  let topic=pageTopic(session,q.slideIndex);
  if(region&&/해결|핵심 기술/.test(region.name))topic=2;
  if(!region)topic=4;
  const label=region?.name??'영역 미지정·분류 미확정';
  const bucket=buckets[topic];bucket.questions.push(q);
  bucket.details.set(label,[...(bucket.details.get(label)??[]),q]);
 }
 return buckets;
}
