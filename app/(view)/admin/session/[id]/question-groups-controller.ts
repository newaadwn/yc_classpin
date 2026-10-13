"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fairGroupQueue, reconcileQuestionBatch, type Triage } from "@/app/_model/question-groups";
import { useCondensedQuestions } from "./question-map/use-condensed-questions";
import { useSessionSectors } from "./question-map/use-session-sectors";
import type { ClassSession, Question } from "@/app/_model/types";
import { useSessions } from "@/app/_controller/session-store";
import { fetchQuestionTriage, saveQuestionTriage, type GroupAnswerTarget } from "@/app/_service/question-triage-service";

export function useQuestionGroups(session: ClassSession) {
  const {completeGroup,undoGroup,answerGroup}=useSessions();
  const [reply,setReply]=useState<{targets:GroupAnswerTarget[];body:string;confirmed:boolean;submitted:boolean}|null>(null);
  const [notice,setNotice]=useState("");
  const [lastAction,setLastAction]=useState<string|null>(null);
  const [rows,setRows]=useState<Triage[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const revision=useRef(0);
  const [loaded,setLoaded]=useState(false);
  const [deferred,setDeferred]=useState(false);
  const [batch,setBatch]=useState<{ids:string[][];seen:string[]}|null>(null);
  const ids=session.questions.map(q=>q.id).sort().join(",");
  useEffect(()=>{
    let alive=true;
    async function refresh() {
      const epoch=revision.current;
      try { const next=await fetchQuestionTriage(ids ? ids.split(",") : []); if(alive&&!lock.current&&epoch===revision.current){setRows(next);setLoaded(true);} }
      catch(e) { if(alive)setError((e as Error).message); }
    }
    void refresh(); const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
    return()=>{alive=false;clearInterval(timer);};
  },[ids]);
  // 파란 핀(질문 지도)과 같은 축약 규칙을 쓴다: 문구·영역 규칙 + 로컬 임베딩 유사도. 보류(deferred)는 목록 분리에만 쓴다.
  const sectors=useSessionSectors(session);
  const condensed=useCondensedQuestions(session,{sectors,triage:rows});
  const groups=useMemo(()=>{
    const later=new Set(rows.filter(r=>r.deferred).map(r=>r.question_id));
    return condensed.groups.flatMap(group=>{
      const questions=group.questions.filter(q=>q.status==="unanswered" && later.has(q.id)===deferred);
      return questions.length?[{...group,id:questions[0].id,questions,reactions:questions.reduce((sum,q)=>sum+q.reactionCount,0)}]:[];
    });
  },[condensed.groups,rows,deferred]);
  const top=fairGroupQueue(groups);
  const fixed=batch ? reconcileQuestionBatch(batch.ids,groups) : null;
  const seen=new Set(batch?.seen);
  const newCount=batch ? session.questions.filter(q=>!seen.has(q.id)&&q.status==="unanswered").length : 0;
  function nextBatch() {
    setBatch({ids:top.map(group=>group.questions.map(q=>q.id)),seen:session.questions.map(q=>q.id)});
  }
  function changeDeferred(value:boolean) {setDeferred(value);setBatch(null);}
  function openReply(questions:Question[]) {
    if(lock.current||reply)return;
    if(questions.some(q=>!session.slides[q.slideIndex])){setError("슬라이드를 다시 확인해 주세요.");return;}
    setError("");setNotice("");
    setReply({targets:questions.map(q=>({id:q.id,answer_id:crypto.randomUUID(),text:q.text,slide_id:session.slides[q.slideIndex].id,x:q.x,y:q.y})),body:"",confirmed:false,submitted:false});
  }
  function editReply(patch:{body?:string;confirmed?:boolean}) {
    if(lock.current)return;
    setReply(current=>current&&!current.submitted?{...current,...patch}:current);
  }
  async function sendReply() {
    if(lock.current||!reply||!reply.confirmed||!reply.body.trim()||reply.body.trim().length>2000)return;
    lock.current=true;setBusy(true);setError("");setReply({...reply,submitted:true});
    try {
      await answerGroup(session.id,reply.targets,reply.body);
      setNotice(`${reply.targets.length}개 질문에 답변을 전송했습니다.`);setReply(null);
    } catch(e){setError(`전송을 확인하지 못했습니다. 같은 내용으로 재시도하거나 목록을 확인해 주세요. ${(e as Error).message}`);}
    finally{lock.current=false;setBusy(false);}
  }
  async function change(questionIds:string[],patch:Partial<Pick<Triage,"deferred"|"separate">>) {
    if(lock.current||!loaded)return;
    revision.current++;lock.current=true;setBusy(true);setError("");
    const changes=questionIds.map(id=>({...rows.find(r=>r.question_id===id),question_id:id,deferred:rows.find(r=>r.question_id===id)?.deferred??false,separate:rows.find(r=>r.question_id===id)?.separate??false,...patch}));
    try {await saveQuestionTriage(changes);setRows(current=>[...current.filter(r=>!questionIds.includes(r.question_id)),...changes]);window.dispatchEvent(new Event('classpin-triage-changed'));}
    catch(e){setError((e as Error).message);}
    finally{revision.current++;lock.current=false;setBusy(false);}
  }
  async function complete(questions:Question[]) {
    if(lock.current)return;
    const actionId=crypto.randomUUID();
    lock.current=true;setBusy(true);setError("");
    try {await completeGroup(session.id,questions,actionId);setLastAction(actionId);}
    catch(e){setError((e as Error).message);}
    finally{lock.current=false;setBusy(false);}
  }
  async function undo() {
    if(lock.current||!lastAction)return;
    lock.current=true;setBusy(true);setError("");
    try{await undoGroup(session.id,lastAction);setLastAction(null);}
    catch(e){setError((e as Error).message);}
    finally{lock.current=false;setBusy(false);}
  }
  return {groups,top,fixed,newCount,nextBatch,condenseStatus:condensed.status,releaseBatch:()=>setBatch(null),error,busy:busy||!loaded,deferred,setDeferred:changeDeferred,change,complete,undo,lastAction,
    reply,notice,openReply,editReply,sendReply,closeReply:()=>{if(!lock.current)setReply(null);}};
}
