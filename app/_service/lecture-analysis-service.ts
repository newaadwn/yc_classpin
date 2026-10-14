import { configError, defaultAnalysisConfig, type AnalysisConfig, type AnalysisReview, type ReviewSection } from '@/app/_model/lecture-analysis';
import type {ClassSession} from '@/app/_model/types';
import {validSector} from '@/app/_model/question-map';
const prefix='classpin-analysis-review-v1:';
export const analysisSource=(s:ClassSession)=>JSON.stringify(s.slides.map(p=>[p.id,p.imageChecksum??p.imageUrl]));
export function readReview(id:string):AnalysisReview|null {try{return JSON.parse(localStorage.getItem(prefix+id)??'null');}catch{return null;}}
export function writeReview(review:AnalysisReview){localStorage.setItem(prefix+review.lectureId,JSON.stringify({...review,updatedAt:new Date().toISOString()}));window.dispatchEvent(new Event('classpin-analysis-review'));}
export function prepareReview(session:ClassSession,config=defaultAnalysisConfig()) {
  const error=configError(config);if(error)throw Error(error);
  if(config.excludedPages.some(n=>n>session.slides.length))throw Error('제외 페이지가 자료의 페이지 수를 초과합니다.');
  const old=readReview(session.id),now=new Date().toISOString();
  const next:AnalysisReview={version:1,lectureId:session.id,source:analysisSource(session),config,sections:old?.source===analysisSource(session)?old.sections:{},reviewedPages:[],createdAt:old?.createdAt??now,updatedAt:now,confirmed:old?.confirmed};
  writeReview(next);return next;
}
export function applyAnalysisPage(sessionId:string,pageId:string,sections:ReviewSection[],preserveManual=true){
  const review=readReview(sessionId);if(!review)return;
  const old=review.sections[pageId]??[];
  // Preserve the whole edited page: a renamed/disabled/merged box must not reappear beside new AI output.
  if(preserveManual&&old.some(s=>s.modifiedByInstructor))return;
  writeReview({...review,sections:{...review.sections,[pageId]:sections},reviewedPages:review.reviewedPages.filter(id=>id!==pageId)});
}
export function confirmReview(session:ClassSession){
  const review=readReview(session.id);if(!review||review.source!==analysisSource(session))throw Error('자료가 변경되었습니다. 다시 검수해 주세요.');
  const error=configError(review.config);if(error)throw Error(error);
  if(review.config.excludedPages.some(n=>n>session.slides.length))throw Error('제외 페이지를 확인해 주세요.');
  for(const p of session.slides){
    if(review.config.excludedPages.includes(p.pageIndex+1))continue;
    if(!review.reviewedPages.includes(p.id))throw Error(`${p.pageIndex+1}페이지를 검수해 주세요.`);
    if(!(review.sections[p.id]??[]).some(s=>s.enabled))throw Error(`${p.pageIndex+1}페이지에 영역을 추가하거나 분석 제외로 설정해 주세요.`);
    if((review.sections[p.id]??[]).some(s=>s.enabled&&!validSector(s)))throw Error('영역 좌표 또는 이름을 확인해 주세요.');
  }
  const confirmed={source:review.source,config:structuredClone(review.config),sections:structuredClone(review.sections),confirmedAt:new Date().toISOString()};
  writeReview({...review,confirmed});return confirmed;
}
export type CourseOption={id:string;title:string};
export function courseOptions(sessions:ClassSession[]):CourseOption[]{
  const courses=new Map<string,CourseOption>();
  for(const s of sessions){const c=readReview(s.id)?.config;const id=c?.courseId??s.courseId;if(id)courses.set(id,{id,title:c?.courseTitle||s.title});}
  return [...courses.values()];
}
export function previousLectureContext(session:ClassSession,sessions:ClassSession[],config:AnalysisConfig){
  if(config.lectureType!=='series'||!config.connectPreviousLectures||!config.courseId)return [];
  return sessions.filter(s=>s.id!==session.id).flatMap(s=>{
    const r=readReview(s.id)?.confirmed;if(!r||r.source!==analysisSource(s)||r.config.courseId!==config.courseId||!r.config.sequenceNumber||r.config.sequenceNumber>=(config.sequenceNumber??0))return [];
    const pages=s.slides.filter(p=>!r.config.excludedPages.includes(p.pageIndex+1));
    return [{lectureId:s.id,title:s.title,sequenceNumber:r.config.sequenceNumber,concepts:[...new Set(pages.flatMap(p=>r.sections[p.id]??[]).filter(s=>s.enabled).flatMap(s=>s.concepts.length?s.concepts:[s.name]))].slice(0,40)}];
  }).sort((a,b)=>a.sequenceNumber-b.sequenceNumber).slice(-5);
}
