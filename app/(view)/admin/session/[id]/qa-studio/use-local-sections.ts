'use client';
import {useEffect,useState} from 'react';
import type {ClassSession} from '@/app/_model/types';
import {readSectionRun,sectionSource,type SectionRun} from '@/app/_service/local-sections';
import {useRouter} from 'next/navigation';
import {readReview} from '@/app/_service/lecture-analysis-service';
import type {Sector} from '@/app/_model/question-map';
export function useLocalSections(session:ClassSession){
 const router=useRouter();
 const [run,setRun]=useState<SectionRun|null>(null);
 const [confirmed,setConfirmed]=useState<Record<string,Sector[]>|null>(null);
 useEffect(()=>{
  const update=()=>{const data=readSectionRun(session.id);setRun(data?.source===sectionSource(session)?data:null);const review=readReview(session.id),snapshot=review?.confirmed;setConfirmed(!review?null:snapshot?.source!==sectionSource(session)?{}:Object.fromEntries(session.slides.filter(s=>!snapshot.config.excludedPages.includes(s.pageIndex+1)).map(s=>[s.id,(snapshot.sections[s.id]??[]).filter(r=>r.enabled)])));};
  const timer=setTimeout(update,0);window.addEventListener('classpin-sections',update);window.addEventListener('storage',update);window.addEventListener('classpin-analysis-review',update);
  return()=>{clearTimeout(timer);window.removeEventListener('classpin-sections',update);window.removeEventListener('storage',update);window.removeEventListener('classpin-analysis-review',update);};
 },[session]);
 return {run,confirmed,start:()=>router.push(`/admin/session/${session.id}/analysis`)};
}
