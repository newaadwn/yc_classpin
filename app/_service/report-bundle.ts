import type {ClassSession} from '@/app/_model/types';
import {condenseQuestions,embeddingCandidates,expandEdges,type CondensedGroup} from '@/app/_model/question-condense';
import {sectorFor,type Sector} from '@/app/_model/question-map';
import type {GenerationOptions} from '@/app/component/generation-settings';
import {fetchQuestionSimilarity} from './question-condense-service';
import {fetchQuestionTriage} from './question-triage-service';
import {sectionsForPage} from './section-question-service';

export type ReportScope={kind:'all'|'category';pageIds:string[];categoryId?:string;label:string};
export type ReportBundle={version:1;id:string;createdAt:string;session:ClassSession;scope:ReportScope;options:GenerationOptions;groups:CondensedGroup[];sectors:Record<string,Sector[]>;status:string};

/** Owner-scoped browser draft; never a server-confirmed report. */
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('ohpin-report-bundles',1);request.onupgradeneeded=()=>request.result.createObjectStore('bundles');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readBundle(owner:string,sessionId:string):Promise<ReportBundle|null>{const db=await database();try{return await new Promise((resolve,reject)=>{const request=db.transaction('bundles').objectStore('bundles').get(`${owner}:${sessionId}`);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function saveBundle(owner:string,bundle:ReportBundle){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('bundles','readwrite');tx.objectStore('bundles').put(bundle,`${owner}:${bundle.session.id}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('초안 저장이 중단됐습니다.'));});}finally{db.close();}}

export async function generateBundle(source:ClassSession,options:GenerationOptions,signal:AbortSignal,progress:(message:string)=>void,scope:ReportScope={kind:'all',pageIds:source.slides.map(s=>s.id),label:'전체 자료'}):Promise<ReportBundle>{
 const session=structuredClone(source);
 const pages=new Set(scope.pageIds);
 if(!pages.size||scope.pageIds.some(id=>!session.slides.some(s=>s.id===id)))throw Error('분석할 페이지를 확인해 주세요.');
 // Preserve original page indices and pin coordinates even for future category scopes.
 session.questions=session.questions.filter(q=>pages.has(session.slides[q.slideIndex]?.id));
 const sectors=Object.fromEntries(session.slides.map(slide=>[slide.id,sectionsForPage(session,slide.id).map(s=>({id:s.id,name:s.title,x:s.x,y:s.y,w:s.width,h:s.height}))]));
 progress('질문 원문과 강사의 분리 설정을 확인하고 있습니다.');
 const triage=await fetchQuestionTriage(session.questions.map(q=>q.id));signal.throwIfAborted();
 const candidates=embeddingCandidates(session.questions);let edges:Parameters<typeof expandEdges>[1]=[];
 if(candidates.length){
  const deadline=Date.now()+90000;
  while(true){
   progress('질문의 의미 유사도를 분석하고 있습니다.');
   const result=await fetchQuestionSimilarity(candidates,4000,signal);signal.throwIfAborted();
   if(result.embedding==='unavailable')throw Error('의미 분석 서버에 연결할 수 없습니다. 서버를 확인한 뒤 다시 시도해 주세요.');
   if(result.pending===0){edges=result.edges;break;}
   if(Date.now()>deadline)throw Error('의미 분석 시간이 초과됐습니다. 다시 시도해 주세요.');
   await new Promise(resolve=>setTimeout(resolve,500));signal.throwIfAborted();
  }
 }
 progress('QA Studio · 대시보드 · 요약리포트를 구성하고 있습니다.');
 const groups=condenseQuestions(session.questions,{edges:expandEdges(session.questions,edges),triage,regionOf:q=>sectorFor(q,sectors[session.slides[q.slideIndex]?.id]??[])});
 return {version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),session,scope,options,groups,sectors,status:candidates.length?'의미 유사도·영역·질문 분리 설정 분석 완료 · 강사 검토 필요':'질문 집계 완료 · 의미 분석 대상 문장 없음'};
}
