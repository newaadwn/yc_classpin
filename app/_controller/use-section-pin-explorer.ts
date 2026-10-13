'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {ClassSession,Question} from '@/app/_model/types';
import type {TeachingSection} from '@/app/_model/section-questions';
import {filterPinClusters,summarizeSections,type PinFilter} from '@/app/_model/section-pin-explorer';
import {analyzePageQuestions,groupPageQuestions,sectionsForPage} from '@/app/_service/section-question-service';
import {useSessions} from './session-store';
import {useQuestionTriage} from './use-question-triage';

export function useSectionPinExplorer(session:ClassSession,pageId:string,questions:Question[]) {
  const triage=useQuestionTriage(questions.map(q=>q.id));
  const [sections,setSections]=useState<TeachingSection[]>([]);
  const [filter,setFilter]=useState<PinFilter>({status:'all',type:'all'});
  const [selection,setSelection]=useState<{sectionId:string|null;clusterId:string|null;questionId:string|null}>({sectionId:null,clusterId:null,questionId:null});
  const [analysis,setAnalysis]=useState<{key:string;edges:[string,string,number][];message:string}>({key:'',edges:[],message:''});
  const [retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [undo,setUndo]=useState<{id:string;count:number}|null>(null);
  const lock=useRef(false);
  const {completeGroup,undoGroup}=useSessions();
  const source=JSON.stringify(session.slides.map(s=>[s.id,s.imageChecksum??s.imageUrl]));
  useEffect(()=>{
    const sync=()=>setSections(sectionsForPage(session,pageId));sync();
    window.addEventListener('classpin-analysis-review',sync);window.addEventListener('storage',sync);
    return()=>{window.removeEventListener('classpin-analysis-review',sync);window.removeEventListener('storage',sync);};
    // Page/source is the lookup identity. Unrelated session changes must not reset the UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session.id,pageId,source]);
  const requestKey=JSON.stringify([pageId,sections,questions.map(q=>[q.id,q.text,q.x,q.y])]);
  useEffect(()=>{
    if(!sections.length||!questions.length)return;
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const run=async(attempt:number)=>{
      try{
        const result=await analyzePageQuestions(questions,pageId,sections,abort.signal);
        if(abort.signal.aborted)return;
        setAnalysis({key:requestKey,edges:result.edges,message:result.pending?'의미 분석 중 · 동일 문구를 먼저 표시합니다.':result.embedding==='unavailable'?'의미 분석 연결 없음 · 동일 문구만 묶었습니다.':'의미 유사도 + 질문 유형 규칙 · 대표 문장은 원문입니다.'});
        if(result.pending&&attempt<8)timer=setTimeout(()=>void run(attempt+1),1500);
      }catch(reason){if(!abort.signal.aborted)setAnalysis({key:requestKey,edges:[],message:reason instanceof Error?`${reason.message} · 동일 문구만 표시합니다.`:'의미 분석 실패 · 동일 문구만 표시합니다.'});}
    };
    timer=setTimeout(()=>void run(0),350);
    return()=>{abort.abort();clearTimeout(timer);};
    // Content-keyed request; status/filter changes reuse similarities, never stale memberships.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[requestKey,retry]);
  const allClusters=useMemo(()=>groupPageQuestions(questions,pageId,sections,analysis.key===requestKey?analysis.edges:[],triage.rows),[questions,pageId,sections,analysis,requestKey,triage.rows]);
  const clusters=useMemo(()=>filterPinClusters(allClusters,filter),[allClusters,filter]);
  const rows=useMemo(()=>summarizeSections(sections,clusters),[sections,clusters]);
  const section=rows.find(s=>s.id===selection.sectionId);
  const cluster=section?.clusters.find(c=>c.id===selection.clusterId);
  const raw=cluster?.questions.find(q=>q.original.id===selection.questionId)?.original;
  const selectSection=(id:string|null)=>setSelection({sectionId:id,clusterId:null,questionId:null});
  const selectCluster=(id:string)=>setSelection(s=>({...s,clusterId:id,questionId:null}));
  const selectRaw=(id:string)=>{for(const row of rows){const group=row.clusters.find(c=>c.questions.some(q=>q.original.id===id));if(group){setSelection({sectionId:row.id,clusterId:group.id,questionId:id});return;}}};
  const back=()=>cluster?setSelection(s=>({...s,clusterId:null,questionId:null})):selectSection(null);
  const complete=async()=>{
    if(lock.current||!cluster)return;
    const targets=cluster.questions.map(q=>q.original).filter(q=>q.status==='unanswered');if(!targets.length)return;
    lock.current=true;setBusy(true);setError('');
    try{const id=crypto.randomUUID();await completeGroup(session.id,targets,id);setUndo({id,count:targets.length});}
    catch(reason){setError(reason instanceof Error?reason.message:'처리하지 못했습니다. 다시 시도해 주세요.');}
    finally{lock.current=false;setBusy(false);}
  };
  const restore=async()=>{
    if(lock.current||!undo)return;lock.current=true;setBusy(true);setError('');
    try{await undoGroup(session.id,undo.id);setUndo(null);}catch(reason){setError(reason instanceof Error?reason.message:'되돌리기 실패');}finally{lock.current=false;setBusy(false);}
  };
  return {sections,filter,setFilter,rows,section,cluster,raw,selectSection,selectCluster,selectRaw,back,complete,restore,busy,error:error||triage.error,undo,
    count:clusters.reduce((sum,c)=>sum+c.questionCount,0),total:questions.length,
    message:!sections.length?'확정된 섹션이 없습니다. 분석 결과를 검수·확정해 주세요.':!questions.length?'이 페이지에 질문이 없습니다.':analysis.key===requestKey?analysis.message:'의미 분석 중 · 동일 문구를 먼저 표시합니다.',retry:()=>setRetry(n=>n+1)};
}
