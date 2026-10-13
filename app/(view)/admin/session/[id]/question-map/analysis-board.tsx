import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {ClassSession} from '@/app/_model/types';
import type {CondensedGroup} from '@/app/_model/question-condense';
import type {Sector} from '@/app/_model/question-map';
import s from './analysis-board.module.css';
import {ReportSummary} from '@/app/component/report-summary';
import {DashboardAnalysis} from './dashboard-analysis';
export type BoardKind='dashboard'|'topics'|'report';
export const boardTitles={dashboard:'분석 대시보드',topics:'의미별 질문 주제',report:'강의 결과 요약'};
export function AnalysisBoardFullscreen({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{const previous=document.activeElement as HTMLElement|null;const el=ref.current!;el.showModal();return()=>{el.close();previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} className={s.fullscreen} aria-label={`${title} 전체화면`} onCancel={onClose}><header><h2>{title}</h2><button autoFocus onClick={onClose}>캔버스로 돌아가기 · Esc</button></header>{children}</dialog>,document.body);
}
export function AnalysisBoard({kind,session,groups,sectors,status,onPage,sections,reviewScope='studio'}:{reviewScope?:'studio'|'report';sections?:number[];kind:BoardKind;session:ClassSession;groups:CondensedGroup[];sectors:Record<string,Sector[]>;status:string;onPage:(id:string)=>void}){
 return <div className={s.body} data-controls onWheel={event=>event.stopPropagation()}>
  <p className={s.note}>{reviewScope==='report'?'생성 시점 실제 자료·질문 기준 · 검토용 초안':'현재 Studio 입력 기준 · 가상 질문이 포함될 수 있음 · 전달용 확정본 아님'}</p>
  {kind==='report'?<ReportSummary session={session} groups={groups} sectors={sectors} sections={sections} status={status} onPage={onPage}/>:kind==='dashboard'?<DashboardAnalysis reviewScope={reviewScope} key={sections?.join()} sections={sections} session={session} groups={groups} sectors={sectors} status={status} onPage={onPage}/>:<><h3>레이블 · 대표 질문 · 원문 수</h3>{groups.map(g=>{const slide=session.slides[g.page];const label=(sectors[slide?.id]??[]).find(r=>r.id===g.region)?.name??'영역 미분류';return <button className={s.topic} key={g.id} disabled={!slide} onClick={()=>slide&&onPage(slide.id)}><small>{g.page+1}페이지 · {label} · {g.questions.length}건</small><strong>{g.representative.text}</strong><span>{g.kind==='semantic'?'의미 유사도 제안':g.kind==='single'?'개별 질문':'문구·영역 규칙 묶음'}</span></button>;})}</>}
  {!session.questions.length&&<p>질문이 없습니다. 질문 패턴을 판단하지 않습니다.</p>}
  <p className={s.note}>{status||'분석 대기'} · 이 보드는 현재 분석을 보여주며 확정 저장되지 않습니다.</p>
 </div>;
}
