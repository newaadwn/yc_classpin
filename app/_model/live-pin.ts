import type {Question} from "./types";
export const pinSorts = {importance:"중요도 순",category:"카테고리별 모아보기",popular:"공감 많은 순",oldest:"오래 기다린 순",newest:"최신순",current:"현재 슬라이드 우선"} as const;
export type PinSort = keyof typeof pinSorts;
export function sortedLivePins(questions: Question[], currentSlide:number, category:string, sort:PinSort) {
  const time=(q:Question)=>Date.parse(q.createdAt)||0;
  const compare=(a:Question,b:Question)=>{
    if(sort==="importance") return Number(b.category==="important")-Number(a.category==="important") || Number(b.status==="unanswered")-Number(a.status==="unanswered") || b.reactionCount-a.reactionCount || time(a)-time(b);
    if(sort==="category") return a.category.localeCompare(b.category) || time(b)-time(a);
    if(sort==="popular") return b.reactionCount-a.reactionCount || time(a)-time(b);
    if(sort==="newest") return time(b)-time(a);
    if(sort==="current") return Number(b.slideIndex===currentSlide)-Number(a.slideIndex===currentSlide) || time(a)-time(b);
    return time(a)-time(b);
  };
  return questions.filter(q=>category==="all"||q.category===category)
    .sort((a,b)=>compare(a,b)||a.id.localeCompare(b.id));
}
export function topLivePins(questions: Question[], currentSlide:number, category:string, sort:PinSort) {
  return sortedLivePins(questions.filter(q=>q.status==="unanswered"&&q.slideIndex<=currentSlide),currentSlide,category,sort).slice(0,5);
}
export type PinSuggestion = { analysis:string; draft:string; quote:string; model:string; elapsedMs:number; page:number };
export type PinDraftState = {status:"queued"|"running"|"complete"|"failed"; fingerprint:string; result?:PinSuggestion; error?:string};
export const pinFingerprint = (q:Question)=>JSON.stringify([q.id,q.text,q.x,q.y,q.slideIndex]);
