'use client';
import {useEffect,useState} from 'react';
import type {ClassSession} from '@/app/_model/types';
import type {SectionQuestionCluster} from '@/app/_model/section-questions';
import {QUESTION_TYPE_LABELS} from '@/app/_model/section-questions';
import {rankQuestionClusters,type PrioritySort} from '@/app/_model/question-priority';
import {analyzePageQuestions,groupPageQuestions,sectionsForPage} from '@/app/_service/section-question-service';
import {useSessions} from '@/app/_controller/session-store';
import styles from './question-priority-list.module.css';

export function QuestionPriorityList({session,pageId,groups,onSelect}:{session:ClassSession;pageId:string;groups:SectionQuestionCluster[];onSelect:(id:string)=>void}){
 const [scope,setScope]=useState('page'),[sort,setSort]=useState<PrioritySort>('priority'),[collapsed,setCollapsed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [analyses,setAnalyses]=useState<Record<string,{key:string;edges:[string,string,number][];pending:boolean}>>({});
 const {setCurrentSlide}=useSessions();
 const key=JSON.stringify(session.questions.map(q=>[q.id,q.text,q.slideIndex]));
 useEffect(()=>{
  if(scope!=='all')return;const controller=new AbortController();
  void(async()=>{for(const slide of session.slides){if(slide.id===pageId)continue;const questions=session.questions.filter(q=>q.slideIndex===slide.pageIndex);if(!questions.length)continue;
   try{const result=await analyzePageQuestions(questions,slide.id,sectionsForPage(session,slide.id),controller.signal);if(controller.signal.aborted)return;setAnalyses(old=>({...old,[slide.id]:{key,edges:result.edges,pending:!!result.pending||result.embedding==='unavailable'}}));}
   catch{if(controller.signal.aborted)return;setAnalyses(old=>({...old,[slide.id]:{key,edges:[],pending:true}}));}
  }})();return()=>controller.abort();
  // Requests are keyed to question contents; status changes update rankings without inference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,key,pageId,session.id]);
 const others=scope==='all'?session.slides.filter(s=>s.id!==pageId).flatMap(s=>groupPageQuestions(session.questions.filter(q=>q.slideIndex===s.pageIndex),s.id,sectionsForPage(session,s.id),analyses[s.id]?.key===key?analyses[s.id].edges:[])):[];
 const ranked=rankQuestionClusters([...groups,...others],sort);
 const choose=async(group:SectionQuestionCluster)=>{
  const question=group.questions.find(q=>q.original.status==='unanswered')?.original;if(!question)return;
  setError('');if(group.pageId===pageId){onSelect(question.id);return;}
  setBusy(true);
  try{sessionStorage.setItem(`classpin-priority-target:${session.id}`,JSON.stringify({pageId:group.pageId,questionId:question.id}));await setCurrentSlide(session.id,question.slideIndex);}
  catch{sessionStorage.removeItem(`classpin-priority-target:${session.id}`);setError('페이지를 이동하지 못했습니다. 다시 선택해 주세요.');}
  finally{setBusy(false);}
 };
 return <section className={styles.root} data-priority-list aria-label="묶음 질문 우선순위">
  <header><strong>질문 우선순위 <small>{ranked.length}</small></strong><button onClick={()=>setCollapsed(v=>!v)} aria-expanded={!collapsed}>{collapsed?'펼치기':'접기'}</button></header>
  {!collapsed&&<><div className={styles.controls}><select aria-label="우선순위 목록 범위" value={scope} onChange={e=>setScope(e.target.value)}><option value="page">현재 페이지</option><option value="all">전체 강의</option></select><select aria-label="묶음 질문 정렬" value={sort} onChange={e=>setSort(e.target.value as PrioritySort)}><option value="priority">우선순위순</option><option value="count">질문 많은 순</option><option value="reactions">공감 많은 순</option><option value="latest">최신순</option></select></div>
  <p>미답변만 · {sort==='priority'?'질문 수 → 공감 → 접수순':'선택한 정렬 기준'}</p>
  {scope==='all'&&<p>다른 페이지의 분석 대기·연결 실패 시 동일 문구 기준으로 표시합니다.</p>}
  {error&&<p role="alert">{error}</p>}
  <ol>{ranked.map(({group,count,reactions},index)=>{const slide=session.slides.find(s=>s.id===group.pageId),section=sectionsForPage(session,group.pageId).find(s=>s.id===group.sectionId);return <li key={`${group.pageId}:${group.id}`}><button disabled={busy} onClick={()=>void choose(group)}><b>{index+1}</b><span><em data-type={group.questionType??'unknown'}>{group.questionType?QUESTION_TYPE_LABELS[group.questionType]:'의도 확인 필요'}</em><strong>{group.representativeQuestion}</strong><small>{(slide?.pageIndex??0)+1}페이지 · {section?.title??'섹션 미지정'}</small><small>미답변 {count}건 · 공감 {reactions}{group.pageId!==pageId&&(!analyses[group.pageId]||analyses[group.pageId].key!==key||analyses[group.pageId].pending)?' · 분석 대기':''}</small></span></button></li>;})}</ol>
  {!ranked.length&&<p>현재 범위에 미답변 질문이 없습니다.</p>}</>}
 </section>;
}
