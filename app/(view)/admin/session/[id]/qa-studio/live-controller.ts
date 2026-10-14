'use client';
import {useEffect,useState} from 'react';
import type {Question} from '../../../../../_model/types.ts';
import {liveSnapshot,validLiveEvent,type LiveEvent} from './live-model';
export function useDemoLive(sessionId:string,pages:number,initialQuestions:Question[]=[],initialPage=0){
 const prefix=`classpin-qa-live-v1:${sessionId}:`;
 const [events,setEvents]=useState<LiveEvent[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  function read(){try{const next:LiveEvent[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const e:unknown=JSON.parse(localStorage.getItem(key)??'null');if(validLiveEvent(e,sessionId,pages))next.push(e);}catch{}}setEvents(next);setError('');}catch{setError('브라우저 저장 공간을 사용할 수 없어 창 간 동기화가 불가능합니다.');}setReady(true);}
  const onStorage=(e:StorageEvent)=>{if(e.key===null||e.key.startsWith(prefix))read();};
  const onLocal=()=>read();read();window.addEventListener('storage',onStorage);window.addEventListener(prefix,onLocal);
  return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener(prefix,onLocal);};
 },[prefix,sessionId,pages]);
 function send(event:LiveEvent){if(!ready||!validLiveEvent(event,sessionId,pages))return false;try{localStorage.setItem(prefix+event.id,JSON.stringify(event));window.dispatchEvent(new Event(prefix));return true;}catch{setError('저장에 실패했습니다. 질문 내용을 유지한 채 다시 시도해 주세요.');return false;}}
 return {...liveSnapshot(events,initialQuestions,initialPage),ready,error,send};
}
