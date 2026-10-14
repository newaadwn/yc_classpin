"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {useAuth} from "@/app/_controller/auth-context";
import {pinFingerprint,topLivePins,sortedLivePins,type PinDraftState,type PinSort} from "@/app/_model/live-pin";
import type {ClassSession,Question} from "@/app/_model/types";
import {suggestPin} from "@/app/_service/live-pin-service";

export function useLivePin(session:ClassSession|undefined,selected:Question|undefined) {
  const {user}=useAuth();
  const scope=`${user?.id??"demo"}:${session?.id??"none"}`;
  const notifications = session?.showQuestionPins ?? true;
  const [questionTime,setQuestionTime]=useState(false);
  const [category,setCategory]=useState("all");
  const [sort,setSort]=useState<PinSort>("popular");
  const [notice,setNotice]=useState("");
  const [drafts,setDrafts]=useState<Record<string,PinDraftState>>({});
  const seen=useRef<{scope:string;keys:Map<string,string>}>({scope:"",keys:new Map()});
  const jobs=useRef(new Map<string,PinDraftState>());
  const queue=useRef<Question[]>([]);
  const active=useRef(false);
  const alive=useRef(true);
  const generation=useRef(0);
  const abort=useRef<AbortController|null>(null);
  const publish=()=>setDrafts(Object.fromEntries(jobs.current));
  async function drain() {
    if(active.current||!alive.current)return;
    active.current=true;
    const epoch=generation.current;
    try {
      while(queue.current.length&&alive.current&&epoch===generation.current){
        const q=queue.current.shift()!;const fingerprint=pinFingerprint(q);
        jobs.current.set(q.id,{status:"running",fingerprint});publish();
        const controller=new AbortController();abort.current=controller;
        const timer=setTimeout(()=>controller.abort(),150000);
        try {
          const result=await suggestPin(q.id,controller.signal);
          if(alive.current&&epoch===generation.current){jobs.current.set(q.id,{status:"complete",fingerprint,result});publish();}
        } catch(e) {
          if(alive.current&&epoch===generation.current){jobs.current.set(q.id,{status:"failed",fingerprint,error:controller.signal.aborted?"분석 시간이 초과되었습니다. 다시 시도해 주세요.":(e as Error).message});publish();}
        } finally {clearTimeout(timer);}
      }
    } finally {active.current=false; if(queue.current.length&&alive.current)void drain();}
  }
  const enqueue=(q:Question,retry=false)=>{
    if(q.status!=="unanswered")return;
    const previous=jobs.current.get(q.id);const fingerprint=pinFingerprint(q);
    if(!retry&&previous?.fingerprint===fingerprint)return;
    if((previous?.status==="running"||previous?.status==="queued")&&previous.fingerprint===fingerprint)return;
    queue.current=queue.current.filter(item=>item.id!==q.id);
    if(queue.current.length>=50){jobs.current.set(q.id,{status:"failed",fingerprint,error:"대기 질문이 많습니다. 잠시 후 다시 시도해 주세요."});publish();return;}
    jobs.current.set(q.id,{status:"queued",fingerprint});queue.current.push(q);publish();void drain();
  };
  const enqueueRef=useRef(enqueue);
  useEffect(()=>{enqueueRef.current=enqueue;});
  useEffect(()=>{
    alive.current=true;
    return()=>{alive.current=false;queue.current=[];abort.current?.abort();};
  },[]);
  useEffect(()=>{
    generation.current++;queue.current=[];jobs.current.clear();abort.current?.abort();
    const timer=setTimeout(()=>{setDrafts({});setNotice("");setQuestionTime(false);setCategory("all");},0);
    return()=>clearTimeout(timer);
  },[scope]);
  useEffect(()=>{
    if(!session)return;
    const timer=setTimeout(()=>{
      if(seen.current.scope!==scope){seen.current={scope,keys:new Map(session.questions.map(q=>[q.id,pinFingerprint(q)]))};return;}
      const incoming=session.questions.filter(q=>!seen.current.keys.has(q.id));
      seen.current.keys=new Map(session.questions.map(q=>[q.id,pinFingerprint(q)]));
      if(incoming.length&&notifications)setNotice(`새 PIN 질문 ${incoming.length}개가 도착했습니다.`);
      // Intake never triggers the expensive answer model. Generate on teacher selection.
    },0);
    return()=>clearTimeout(timer);
  },[session,scope,notifications]);
  // Older questions are generated on explicit selection, not in a bulk backlog.
  const selectedKey=selected?pinFingerprint(selected):"";
  useEffect(()=>{
    if(!selected||!user)return;
    const timer=setTimeout(()=>enqueueRef.current(selected),0);
    return()=>clearTimeout(timer);
  },[selectedKey,selected,scope,user]);
  const top=useMemo(()=>topLivePins(session?.questions??[],session?.currentSlide??0,category,sort),[session,category,sort]);
  const all=useMemo(()=>sortedLivePins(session?.questions??[],session?.currentSlide??0,category,sort),[session,category,sort]);
  const draft=selected?drafts[selected.id]:undefined;
  return {notifications,questionTime,toggleQuestionTime:()=>setQuestionTime(v=>!v),category,setCategory,sort,setSort,notice:notifications?notice:"",dismissNotice:()=>setNotice(""),top,all,draft:draft?.fingerprint===selectedKey?draft:undefined,retry:()=>selected&&enqueue(selected,true)};
}
