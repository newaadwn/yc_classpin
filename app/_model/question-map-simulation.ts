import type {ClassSession,Question} from './types.ts';

// Synthetic UI fixtures only: never pass these IDs to persistence APIs.
export const SIM_PIN_PREFIX='simulation-audience-';
export function audienceSimulation(session:ClassSession):Question[]{
 if(!session.slides.length)return [];
 const categories=['confusing','why','example','concept','confusing'] as const;
 const texts=['이 부분이 잘 이해되지 않아요.','이 주장의 근거를 더 설명해 주세요.','구체적인 예시를 들어 주실 수 있나요?','이 개념을 한 번 더 설명해 주세요.','앞의 내용과 어떻게 연결되는지 모르겠어요.'];
 return Array.from({length:150},(_,i)=>{
  const person=i%50,round=Math.floor(i/50),type=(person+round)%5;
  const slideIndex=round===0?Math.min(1,session.slides.length-1):(person*7+round*3)%session.slides.length;
  return {id:`${SIM_PIN_PREFIX}${i}`,sessionId:session.id,slideIndex,
   x:.12+(person%10)*.078+(round%2)*.013,y:.25+Math.floor(person/10)*.115+round*.016,
   anchorKind:'point',category:categories[type],marker:'question',
   text:`[가상 청중 ${person+1} · ${round+1}번째 질문] ${texts[type]}`,
   status:i%9===0?'resolved':'unanswered',isMine:false,reactionCount:person%6,reactedByMe:false,
   createdAt:session.createdAt} as Question;
 });
}
