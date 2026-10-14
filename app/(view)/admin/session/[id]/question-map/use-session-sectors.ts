'use client';
import {useEffect,useMemo,useState} from 'react';
import {useAuth} from '@/app/_controller/auth-context';
import type {ClassSession} from '@/app/_model/types';
import {validSector,type Sector} from '@/app/_model/question-map';
import {analyzedSectors} from '../qa-studio/analyzed-sectors';

/** 질문 지도에서 저장한 개인 영역 설정(브라우저)과 SOi 수동 의미 영역을 읽기 전용으로 합친다. 저장은 하지 않는다. */
export function useSessionSectors(session:ClassSession){
 const {user}=useAuth();
 const key=`question-map-sectors-v1:${user?.id??'demo'}:${session.id}`;
 const [stored,setStored]=useState<Record<string,Sector[]>>({});
 useEffect(()=>{
  const read=()=>{const value:Record<string,Sector[]>={};try{const raw=JSON.parse(localStorage.getItem(key)??'{}');if(raw&&typeof raw==='object')for(const slide of session.slides){if(Array.isArray(raw[slide.id]))value[slide.id]=raw[slide.id].filter((x:Sector)=>x&&validSector(x)).slice(0,30);}}catch{}setStored(value);};
  const timer=setTimeout(read,0);
  const onStorage=(event:StorageEvent)=>{if(event.key===null||event.key===key)read();};
  window.addEventListener('storage',onStorage);
  return()=>{clearTimeout(timer);window.removeEventListener('storage',onStorage);};
 },[key,session.slides]);
 return useMemo(()=>{
  const merged:Record<string,Sector[]>={...analyzedSectors(session)};
  for(const [id,items] of Object.entries(stored))if(items.length)merged[id]=items;
  return merged;
 },[session,stored]);
}
