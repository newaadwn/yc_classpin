import type {ClassSession} from '@/app/_model/types';
import type {CondensedGroup} from '@/app/_model/question-condense';
import {mapType,sectorFor,typeNames,type Sector} from '@/app/_model/question-map';
import {reexplainTopics} from '@/app/_model/reexplain-topics';
import {REPORT_SECTIONS} from './generation-settings';

export function ReportSummary({session,groups,sectors,sections=REPORT_SECTIONS.map((_,i)=>i),status,onPage}:{session:ClassSession;groups:CondensedGroup[];sectors:Record<string,Sector[]>;sections?:number[];status:string;onPage:(id:string)=>void}){
 const pending=session.questions.filter(q=>q.status==='unanswered');
 const topics=reexplainTopics(session,groups,sectors);
 const pages=session.slides.map((slide,i)=>({slide,questions:session.questions.filter(q=>q.slideIndex===i)})).filter(p=>p.questions.length).sort((a,b)=>b.questions.length-a.questions.length);
 const types=Object.entries(typeNames).filter(([k])=>!['none','mixed'].includes(k)).map(([k,label])=>({label,count:session.questions.filter(q=>mapType(q)===k).length})).filter(t=>t.count).sort((a,b)=>b.count-a.count);
 const repeated=groups.filter(g=>g.questions.length>1).sort((a,b)=>b.questions.length-a.questions.length);
 const popular=[...pending].sort((a,b)=>b.reactionCount-a.reactionCount)[0];
 const unassigned=session.questions.filter(q=>!sectorFor(q,sectors[session.slides[q.slideIndex]?.id]??[]));
 const texts=[topics.length?topics.map((t,i)=>`${i+1}. ${(session.slides[t.page]?.pageIndex??t.page)+1}p · ${t.label} (미답변 ${t.pending}건)`).join('\n'):'현재 다시 설명할 후보가 없습니다.',types.length?types.map(t=>`${t.label} ${t.count}건`).join(' · '):'분류할 질문이 없습니다.',pages.length?pages.slice(0,3).map(p=>`${p.slide.pageIndex+1}페이지 ${p.questions.length}건`).join(' · '):'질문이 발생한 페이지가 없습니다.',`미답변 ${pending.length}건 · 답변 처리 ${session.questions.length-pending.length}건. 미답변 원문을 검토해 후속 설명 여부를 결정하세요.`,repeated.length?`${repeated.length}개 반복 주제 · 대표 원문: ${repeated[0].representative.text}`:'반복 질문 묶음이 없습니다.',popular?`공감 ${popular.reactionCount} · ${popular.text}`:'미답변 질문이 없습니다.',status||'분석 상태를 확인해 주세요.',`영역에 연결되지 않은 질문 ${unassigned.length}건. 레이블 검토가 필요합니다.`];
 return <section aria-label="요약리포트"><h3>강의 결과 요약</h3><p>자료 {session.slides.length}페이지 · 원본 질문 {session.questions.length}건 · 질문 묶음 {groups.length}개</p>{sections.map(index=><section key={index} style={{borderTop:'1px solid var(--color-border)',padding:'10px 0'}}><strong>{REPORT_SECTIONS[index]}</strong><p style={{whiteSpace:'pre-line',lineHeight:1.6,fontSize:13}}>{texts[index]}</p>{index===0&&topics.map(t=><button key={t.id} onClick={()=>onPage(session.slides[t.page].id)}>{(session.slides[t.page]?.pageIndex??t.page)+1}페이지 근거 보기</button>)}{index===2&&pages.slice(0,3).map(p=><button key={p.slide.id} onClick={()=>onPage(p.slide.id)}>{p.slide.pageIndex+1}페이지 근거 보기</button>)}</section>)}<small>원문과 집계를 바탕으로 구성한 요약 초안입니다. 질문 수로 이해도를 단정하지 않습니다.</small></section>;
}
