'use client';
import {useEffect,useState} from 'react';
import {useSessions} from '@/app/_controller/session-store';
import {useAuth} from '@/app/_controller/auth-context';
import {useQuestionGroups} from '../question-groups-controller';
import type {ClassSession} from '@/app/_model/types';
import {pageBucket,validSector,type MapMode,type Sector} from '@/app/_model/question-map';

export function useQuestionMap(session:ClassSession){
 const {setActiveSession}=useSessions();const {user}=useAuth();const actions=useQuestionGroups(session);
 const [mode,setMode]=useState<MapMode>('original');const [sort,setSort]=useState('page');
 const [layout,setLayout]=useState(()=>session.slides.map(s=>({id:s.id,bucket:'페이지 순서'})));
 const [seen,setSeen]=useState(()=>session.questions.map(q=>q.id));
 const [selected,setSelected]=useState<string|null>(null);const [filter,setFilter]=useState('all');const [hide,setHide]=useState(false);
 const [sectors,setSectors]=useState<Record<string,Sector[]>>({});const [sector,setSector]=useState<string|null>(null);
 const [settingsReady,setSettingsReady]=useState(false);const [error,setError]=useState('');
 const key=`question-map-sectors-v1:${user?.id??'demo'}:${session.id}`;
 useEffect(()=>{setActiveSession(session.id);return()=>setActiveSession(null);},[session.id,setActiveSession]);
 useEffect(()=>{const value:Record<string,Sector[]>={};try{const raw=JSON.parse(localStorage.getItem(key)??'{}');if(raw&&typeof raw==='object')for(const s of session.slides){if(Array.isArray(raw[s.id]))value[s.id]=raw[s.id].filter((x:Sector)=>x&&validSector(x)).slice(0,30);}}catch{} queueMicrotask(()=>{setSectors(value);setSettingsReady(true);});},[key,session.slides]);
 function saveSectors(next:Record<string,Sector[]>){try{localStorage.setItem(key,JSON.stringify(next));setSectors(next);setError('');}catch{setError('섹션 설정을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');}}
 function arrange(nextMode=mode,nextSort=sort){
  const rows=session.slides.map((s,i)=>{const qs=session.questions.filter(q=>q.slideIndex===i);return {id:s.id,bucket:pageBucket(qs,nextMode),index:i,count:qs.filter(q=>q.status==='unanswered').length,oldest:qs.filter(q=>q.status==='unanswered').map(q=>q.createdAt).sort()[0]??'9999'};});
  rows.sort((a,b)=>nextSort==='count'?b.count-a.count||a.index-b.index:nextSort==='oldest'?a.oldest.localeCompare(b.oldest)||a.index-b.index:a.index-b.index);
  setMode(nextMode);setSort(nextSort);setLayout(rows);setSeen(session.questions.map(q=>q.id));
 }
 return {actions,mode,sort,arrange,layout,selected,select:(id:string|null)=>{setSelected(id);setSector(null);},filter,setFilter,hide,setHide,sectors,sector,setSector,settingsReady,error,
  save:(id:string,items:Sector[])=>saveSectors({...sectors,[id]:items}),newCount:session.questions.filter(q=>!seen.includes(q.id)).length};
}
