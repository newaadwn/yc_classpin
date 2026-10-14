'use client';
import {useState} from 'react';
import type {ClassSession} from '@/app/_model/types';
import type {ReviewSection} from '@/app/_model/lecture-analysis';
import {suggestSectionNames,applySectionName,type NameProposal} from '@/app/_service/section-names';

export function SectionNameAssistant({session,pageId,sections,disabled}:{session:ClassSession;pageId:string;sections:ReviewSection[];disabled:boolean}){
 const [busy,setBusy]=useState(false),[proposals,setProposals]=useState<NameProposal[]>([]),[error,setError]=useState('');
 const targets=sections.filter(s=>s.source==='manual');
 return <section aria-label="AI 섹션 이름 제안">
  <button className="btn secondary" disabled={disabled||busy||!targets.length} onClick={async()=>{setBusy(true);setError('');setProposals([]);try{setProposals(await suggestSectionNames(session,pageId,targets));}catch(e){setError(e instanceof Error?e.message:'로컬 분석 서버 연결을 확인해 주세요.');}finally{setBusy(false);}}}>{busy?'AI가 영역 내용을 읽는 중…':'AI로 수동 영역 이름 제안'}</button>
  <p>현재 페이지의 직접 지정한 영역만 분석합니다. 제안을 적용하기 전까지 기존 이름과 좌표는 유지됩니다.</p>
  {error&&<p role="alert">{error}</p>}
  <div aria-live="polite">{proposals.map(p=><article key={p.id}><p>{p.original.name} → <strong>{p.name??'텍스트 부족 · 직접 입력해 주세요'}</strong></p><small>{p.evidence.slice(0,180)}</small>{p.name&&<button className="btn secondary" disabled={disabled||busy} onClick={()=>{try{applySectionName(session.id,p);setProposals(items=>items.filter(item=>item.id!==p.id));setError('');}catch(e){setError(e instanceof Error?e.message:'저장 실패');}}}>이 이름 적용</button>}</article>)}</div>
 </section>;
}
