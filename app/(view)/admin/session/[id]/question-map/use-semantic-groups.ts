'use client';
import {useRef,useState} from 'react';
import type {ClassSession,Question} from '@/app/_model/types';
import type {Sector} from '@/app/_model/question-map';
export function useSemanticGroups(session:ClassSession,sectors:Record<string,Sector[]>){
 const [results,setResults]=useState<Record<number,{key:string;ids:string[][]}>>({});
 const [status,setStatus]=useState('의미·맥락 묶음 미분석');
 const [busy,setBusy]=useState(false);const lock=useRef(false);
 const context=(q:Question)=>{const regions=sectors[session.slides[q.slideIndex]?.id]??[];return regions.filter(r=>q.x!=null&&q.y!=null&&q.x>=r.x&&q.x<=r.x+r.w&&q.y>=r.y&&q.y<=r.y+r.h).map(r=>`${r.name}: ${(r as Sector&{meaning?:string}).meaning??''}`).join(' / ');};
 const key=(rows:Question[])=>JSON.stringify(rows.map(q=>[q.id,q.text,context(q)]));
 const groups=(rows:Question[])=>{
  if(!rows.length)return [];
  const all=session.questions.filter(q=>q.slideIndex===rows[0].slideIndex),result=results[rows[0].slideIndex];
  if(!result||result.key!==key(all))return rows.map(q=>[q]);
  const lookup=new Map(rows.map(q=>[q.id,q]));
  return result.ids.map(ids=>ids.flatMap(id=>lookup.has(id)?[lookup.get(id)!]:[])).filter(g=>g.length);
 };
 const ready=(page:number)=>{const rows=session.questions.filter(q=>q.slideIndex===page);return !!results[page]&&results[page].key===key(rows);};
 async function start(){
  if(lock.current)return;lock.current=true;setBusy(true);let failures=0;
  try{
   for(let page=0;page<session.slides.length;page++){
    const rows=session.questions.filter(q=>q.slideIndex===page);if(!rows.length||ready(page))continue;
    setStatus(`${page+1}/${session.slides.length}페이지 의미 분석 중…`);
    try{
     const response=await fetch('http://127.0.0.1:8769/question-groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questions:rows.map(q=>({text:q.text,context:context(q)}))}),signal:AbortSignal.timeout(600000)});
     if(!response.ok)throw Error('분석 실패');
     const data=await response.json();const groups:unknown=data.groups;
     if(!Array.isArray(groups)||groups.some(g=>!Array.isArray(g)||!g.length))throw Error('형식 오류');
     const indices=groups.flat();if(indices.length!==rows.length||new Set(indices).size!==rows.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=rows.length))throw Error('잘못된 묶음');
     const result={key:key(rows),ids:(groups as number[][]).map(g=>g.map(i=>rows[i].id))};setResults(old=>({...old,[page]:result}));
    }catch{failures++;}
   }
   setStatus(failures?`${failures}페이지 실패 · 개별 핀 유지 · 재시도 가능`:'의미 묶음 완료 · AI 제안, 강사 검토 필요');
  }finally{lock.current=false;setBusy(false);}
 }
 return {groups,ready,start,busy,status};
}
