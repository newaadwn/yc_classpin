'use client';
import {useEffect,useState} from 'react';
import type {Triage} from '@/app/_model/question-groups';
import {fetchQuestionTriage} from '@/app/_service/question-triage-service';

/** Read the existing owner-scoped service; never treat a failed read as permission to merge. */
export function useQuestionTriage(ids:readonly string[],enabled=true){
 const key=[...ids].sort().join(',');
 const [state,setState]=useState<{key:string;rows:Triage[];error:string}>({key:'',rows:[],error:''});
 useEffect(()=>{if(!enabled)return;let alive=true,running=false;
  const load=async()=>{if(running)return;running=true;try{const rows=await fetchQuestionTriage(key?key.split(','):[]);if(alive)setState({key,rows,error:''});}catch(e){if(alive)setState({key,rows:[],error:(e as Error).message});}finally{running=false;}};
  void load();const timer=setInterval(()=>{if(!document.hidden)void load();},5000);
  window.addEventListener('classpin-triage-changed',load);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('classpin-triage-changed',load);};
 },[key,enabled]);
 const ready=!enabled||(state.key===key&&!state.error);
 return {rows:ready?state.rows:ids.map(question_id=>({question_id,separate:true,deferred:false})),error:state.error,ready};
}
