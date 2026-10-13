import type {ClassSession,Question} from '@/app/_model/types';
import type {Sector} from '@/app/_model/question-map';
export const contentTopics=['시장·사용자 문제','기존 서비스의 한계','해결방안·핵심 기술','사업화·검증','기타·분류 미확정'];
const pages=[2,0,0,1,1,2,2,3,3,3,2,3,3,3,2];
/** Explicit SOi demo taxonomy, not automatic AI classification. */
export function pageTopic(session:ClassSession,index:number){return (session.id==='f7767d0a-14a7-4b1c-bd3d-fc50a8691d68'||session.id==='soi-demo')&&session.slides.length===15?pages[index]??4:4;}
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
