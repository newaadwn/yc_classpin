'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {ClassSession,Question} from '@/app/_model/types';
import {sectorFor,type Sector} from '@/app/_model/question-map';
import type {Triage} from '@/app/_model/question-groups';
import {condenseQuestions,embeddingCandidates,expandEdges,type CondensedGroup,type SimilarityEdge} from '@/app/_model/question-condense';
import {fetchQuestionSimilarity} from '@/app/_service/question-condense-service';
import {sectionsForPage} from '@/app/_service/section-question-service';
import {enrichQuestion} from '@/app/_model/section-questions';
import {useQuestionTriage} from '@/app/_controller/use-question-triage';

const DEBOUNCE_MS=600,POLL_MS=2500,BUDGET_MS=4000;
type Similarity={signature:string;edges:SimilarityEdge[];embeddedIds:string[];pending:number;embedding:'used'|'unavailable'|'warming'|'none';error:string};
const EMPTY:Similarity={signature:'',edges:[],embeddedIds:[],pending:0,embedding:'none',error:''};

/**
 * 질문 축약: 규칙 접기는 브라우저에서 즉시, 의미 유사도는 로컬 임베딩 서버에서 증분으로 받는다.
 * 질문이 바뀌면 바뀐 문장만 새로 임베딩되고(서버 캐시), 기다리는 동안에도 규칙 묶음은 바로 보인다.
 */
export function useCondensedQuestions(session:ClassSession,options:{sectors?:Record<string,Sector[]>;triage?:readonly Triage[];enabled?:boolean}={}){
 const {sectors={},triage,enabled=true}=options;
 const storedTriage=useQuestionTriage(session.questions.map(q=>q.id),triage===undefined&&enabled);
 const [reviewRevision,setReviewRevision]=useState(0);
 useEffect(()=>{const update=()=>setReviewRevision(n=>n+1);window.addEventListener('classpin-analysis-review',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('classpin-analysis-review',update);window.removeEventListener('storage',update);};},[]);
 // The review event invalidates browser-local confirmed sections without changing the session DTO.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const confirmed=useMemo(()=>new Map(session.slides.map(s=>[s.id,sectionsForPage(session,s.id)])),[session,reviewRevision]);
 const [similarity,setSimilarity]=useState<Similarity>(EMPTY);
 const candidates=useMemo(()=>embeddingCandidates(session.questions),[session.questions]);
 const signature=candidates.map(row=>`${row.id}\u0001${row.page}\u0001${row.text}`).join('\u0002');
 const candidatesRef=useRef(candidates);candidatesRef.current=candidates;
 const hasCandidates=candidates.length>0;
 useEffect(()=>{
  if(!enabled||!hasCandidates){setSimilarity(EMPTY);return;}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let stopped=false;
  const load=async()=>{
   try{
    const rows=candidatesRef.current;
    const data=await fetchQuestionSimilarity(rows,BUDGET_MS,controller.signal);
    if(stopped)return;
    setSimilarity({signature,edges:data.edges,embeddedIds:data.embeddedIds,pending:data.pending,embedding:data.embedding,error:''});
    if(data.pending>0&&data.embedding!=='unavailable')timer=setTimeout(load,POLL_MS);
   }catch(error){
    if(stopped||controller.signal.aborted)return;
    setSimilarity(current=>({...current,signature,pending:0,error:(error as Error).message}));
   }
  };
  timer=setTimeout(load,DEBOUNCE_MS);
  return()=>{stopped=true;clearTimeout(timer);controller.abort();};
 },[signature,enabled,hasCandidates]);
 // 유사도는 문장 기준이라 같은 문장이 남아 있으면 이전 결과를 계속 쓴다 (질문이 하나 추가돼도 나머지 묶음이 흔들리지 않는다).
 const edges=useMemo(()=>expandEdges(session.questions,similarity.edges),[session.questions,similarity.edges]);
 const regionOf=useMemo(()=>(q:Question)=>{const id=session.slides[q.slideIndex]?.id;const sections=confirmed.get(id)??[];return sections.length?enrichQuestion(q,id,sections).sectionId:sectorFor(q,sectors[id]??[]);},[sectors,session.slides,confirmed]);
 const effectiveTriage=triage??storedTriage.rows;
 const groups=useMemo(()=>condenseQuestions(session.questions,{edges,regionOf,triage:effectiveTriage}),[session.questions,edges,regionOf,effectiveTriage]);
 const groupById=useMemo(()=>new Map(groups.flatMap(g=>g.questions.map(q=>[q.id,g] as const))),[groups]);
 const embedded=useMemo(()=>new Set(similarity.embeddedIds),[similarity.embeddedIds]);
 const waiting=candidates.filter(row=>!embedded.has(row.id));
 const status=!enabled?'':storedTriage.error?`분리 설정 조회 실패 · 개별 표시 · ${storedTriage.error}`:similarity.error?`문구·영역 규칙으로만 묶음 · ${similarity.error}`
  :similarity.embedding==='unavailable'?'문구·영역 규칙으로만 묶음 · 로컬 임베딩 서버 없음'
  :waiting.length&&candidates.length?`규칙 묶음 표시 중 · 의미 유사도 ${candidates.length-waiting.length}/${candidates.length} 문장 계산`
  :candidates.length?'문구·영역 규칙 + 의미 유사도 묶음 · AI 요약 아님, 강사 검토 필요':'문구·영역 규칙 묶음 · 내용 단어가 있는 질문 없음';
 return {
  groups,
  groupOf:(id:string):CondensedGroup|undefined=>groupById.get(id),
  /** 주어진 원문만 남긴 묶음 목록 (전체화면 슬라이드의 필터·파란 핀용). */
  groupsFor:(rows:Question[])=>{const allowed=new Set(rows.map(q=>q.id));return groups.map(g=>g.questions.filter(q=>allowed.has(q.id))).filter(g=>g.length);},
  /** 그 페이지의 내용 문장이 모두 임베딩됐는지. 규칙 묶음은 이것과 무관하게 항상 보인다. */
  ready:(page:number)=>!waiting.some(row=>row.page===page),
  pending:waiting.length,embedding:similarity.embedding,status,
 };
}
