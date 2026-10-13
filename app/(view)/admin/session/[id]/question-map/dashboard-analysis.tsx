import {TypeComposition,AnswerDonut} from '@/app/component/analysis-charts';
import {useRef,useState} from 'react';
import type {ClassSession,Question} from '@/app/_model/types';
import type {CondensedGroup} from '@/app/_model/question-condense';
import {mapType,sectorFor,typeNames,type Sector} from '@/app/_model/question-map';
import s from './analysis-board.module.css';
import {reexplainTopics} from '@/app/_model/reexplain-topics';
import {ReexplainReview} from '@/app/component/reexplain-review';

export function DashboardAnalysis({session,groups,sectors,status,onPage,sections=[0,1,2,3,4,5,6,7],reviewScope='studio'}:{reviewScope?:'studio'|'report';sections?:number[];session:ClassSession;groups:CondensedGroup[];sectors:Record<string,Sector[]>;status:string;onPage:(id:string)=>void}){
 const [detail,setDetail]=useState<number|null>(null);
 const [scope,setScope]=useState<{label:string;rows:Question[]}|null>(null);
 const tiles=useRef<Array<HTMLButtonElement|null>>([]);
 const questions=session.questions,total=questions.length;
 const pending=questions.filter(q=>q.status==='unanswered');
 const pages=session.slides.map((slide,index)=>({slide,index,rows:questions.filter(q=>q.slideIndex===index)})).sort((a,b)=>b.rows.length-a.rows.length||a.index-b.index);
 const regions=new Map<string,{label:string;rows:Question[]}>();
 for(const q of questions){
  const slide=session.slides[q.slideIndex];
  const region=(sectors[slide?.id]??[]).find(r=>r.id===sectorFor(q,sectors[slide?.id]??[]));
  const key=region?`${slide.id}:${region.id}`:'unassigned';
  const item=regions.get(key)??{label:region?`${(session.slides[q.slideIndex]?.pageIndex??q.slideIndex)+1}p · ${region.name}`:'영역 미분류',rows:[]};
  item.rows.push(q);regions.set(key,item);
 }
 const rankedRegions=[...regions.values()].sort((a,b)=>b.rows.length-a.rows.length);
 const types=Object.entries(typeNames).filter(([key])=>!['none','mixed'].includes(key)).map(([key,label])=>({label,rows:questions.filter(q=>mapType(q)===key)}));
 const states=[{label:'미답변',rows:pending},{label:'답변됨',rows:questions.filter(q=>q.status==='answered')},{label:'해결됨',rows:questions.filter(q=>q.status==='resolved')}];
 const unassigned=regions.get('unassigned')?.rows??[];
 const popular=[...pending].sort((a,b)=>b.reactionCount-a.reactionCount||a.createdAt.localeCompare(b.createdAt));
 const repeated=[...groups].filter(g=>g.questions.length>1).sort((a,b)=>b.questions.length-a.questions.length);
 const pageRows=pages.map(p=>({label:`${p.slide.pageIndex+1}페이지`,rows:p.rows}));
 const topTopics=reexplainTopics(session,groups,sectors);
 const answered=total-pending.length;
 const leadingType=[...types].sort((a,b)=>b.rows.length-a.rows.length)[0];
 const focusRegion=rankedRegions.find(r=>r.label!=='영역 미분류');
 const focusRows=focusRegion?.rows??pages[0]?.rows??[];
 const focusLabel=focusRegion?.label??(focusRows.length?`${pages[0].slide.pageIndex+1}페이지`:'질문 수집 대기');
 const suggestions:Record<string,[string,string]>={
  '근거·이유':['근거와 판단 과정','주장 옆에 근거와 출처를 붙이고, 판단 과정을 예시로 설명해 보세요.'],
  '개념':['용어의 정의와 차이','핵심 용어를 짧게 정의하고, 유사 개념과 비교하는 예시를 추가해 보세요.'],
  '예시·적용':['실제 적용 방법','하나의 사례를 단계별로 풀어 보여주는 설명을 추가해 보세요.'],
  '이해 어려움':['설명 단계 사이의 연결','전제 개념을 짚고 설명을 작은 단계로 나눠 보세요.']
 };
 const suggestion=suggestions[leadingType?.label]??['질문의 구체적인 맥락','질문 원문을 확인한 뒤 추가 설명이 필요한 내용을 선택해 보세요.'];
 function inspect(index:number,label:string,rows:Question[]){setDetail(index);setScope(rows.length?{label,rows}:null);}
 function sourceLabel(rows:Question[]){const numbers=[...new Set(rows.map(q=>(session.slides[q.slideIndex]?.pageIndex??q.slideIndex)+1))].sort((a,b)=>a-b);return rows.length?`관련 질문 ${rows.length}건 · ${numbers.slice(0,4).join('·')}페이지${numbers.length>4?' 외':''}`:'분석할 질문이 아직 없습니다.';}
 const titles=['다시 설명할 내용 TOP 3','무엇을 궁금해했나','강의자료 질문 지도','답변 현황','반복 질문 주제','공감 많은 미답변 질문','분석 상태 · 검토할 항목','영역 미분류'];

 function back(){const previous=detail;setDetail(null);setScope(null);requestAnimationFrame(()=>{if(previous!==null)tiles.current[previous]?.focus();});}
 function bars(rows:Array<{label:string;rows:Question[]}>,percent=false){
  const max=Math.max(1,...rows.map(r=>r.rows.length));
  return rows.map(row=><button key={row.label} className={s.row} disabled={!row.rows.length} onClick={()=>setScope(row)}><span>{row.label}</span><i aria-hidden="true"><em style={{width:`${row.rows.length/(percent?Math.max(1,total):max)*100}%`}}/></i><b>{row.rows.length}</b>{percent&&<small>{total?Math.round(row.rows.length/total*100):0}%</small>}</button>);
 }
 return <div className={detail===null?s.overview:s.detailView}>
  {detail===null?<>
   <div className={s.dashboardHeading}><div><small>LECTURE INSIGHTS</small><strong>이번 강의, 한눈에 보기</strong></div><span>질문 {total}건 · 원문 기준</span></div>
   <div className={s.findings}>
    <button onClick={()=>inspect(2,focusLabel,focusRows)}><small>01 · 질문이 집중된 내용</small><strong>{focusLabel}</strong><p>{focusRows.length?'관련 질문이 가장 많이 모인 내용입니다.':'질문이 모이면 관심이 집중된 내용을 보여드립니다.'}</p><span>{sourceLabel(focusRows)} →</span></button>
    <button onClick={()=>inspect(1,leadingType.label,leadingType.rows)}><small>02 · 더 필요했던 설명</small><strong>{total?suggestion[0]:'질문 수집 대기'}</strong><p>{total?`‘${leadingType.label}’ 질문이 ${leadingType.rows.length}건으로 가장 많았습니다. 추가 설명이 필요한지 근거를 확인하세요.`:'질문 유형에서 추가 설명의 방향을 찾아드립니다.'}</p><span>{sourceLabel(leadingType.rows)} →</span></button>
    <button onClick={()=>inspect(0,leadingType.label,leadingType.rows)}><small>03 · 다음 강의 보완 제안</small><strong>{total?suggestion[0]+' 보완':'질문을 받은 뒤 제안'}</strong><p>{total?suggestion[1]:'자료와 질문을 함께 검토할 수 있도록 질문을 먼저 수집해 주세요.'}</p><span>{total?'질문 유형 기반 제안 · 근거 확인 후 후속 조치 선택':'아직 보완 방향을 판단하지 않습니다.'} →</span></button>
   </div>
   <div className={s.compactGrid}>
    {sections.includes(1)&&<button ref={node=>{tiles.current[1]=node;}} className={s.compactCard} onClick={()=>{setDetail(1);setScope(null);}}>
     <strong>무엇을 궁금해했나</strong>
     <p className={s.takeaway}>{total?<>가장 많은 질문은 <b>{leadingType.label}</b><small>{leadingType.rows.length}건 · 전체의 {Math.round(leadingType.rows.length/total*100)}%</small></>:'아직 질문이 없습니다.'}</p>
     <TypeComposition items={types.map(t=>({label:t.label,count:t.rows.length}))}/>
     {rankedRegions.find(r=>r.label!=='영역 미분류')&&<p className={s.topicHint}>질문이 모인 내용 · {rankedRegions.find(r=>r.label!=='영역 미분류')!.label}</p>}
     <small>질문 원문 확인 →</small>
    </button>}
    {sections.includes(0)&&<button ref={node=>{tiles.current[0]=node;}} className={s.compactCard} onClick={()=>{setDetail(0);setScope(null);}}>
     <strong>다시 설명할 내용 TOP 3</strong>
     <div className={s.priorityList}>{topTopics.map((topic,i)=><div key={topic.id}><em>{i+1}</em><div><b>{topic.label}</b><small>{(session.slides[topic.page]?.pageIndex??topic.page)+1}페이지 · 미답변 {topic.pending}건 · 반복 {topic.repeated}건 · 공감 {topic.questions.reduce((sum,q)=>sum+q.reactionCount,0)}개</small><span>{topic.pending?'남은 질문의 근거를 확인하고 설명·사례 보완':'반복된 질문을 묶어 설명과 자료 보완'}</span></div></div>)}{!topTopics.length&&<p>현재 보완 검토 후보가 없습니다.</p>}</div>
     <small>근거 확인 · 후속 조치 선택 →</small>
    </button>}
   </div>
   <section className={s.lectureSummary} aria-label="강의 총평"><strong>강의 총평 <small>질문 집계 기반</small></strong><p>{total?<>전체 {total}개 질문 중 {answered}개에 답변했거나 해결했고, {pending.length}개가 남았습니다. {sections.includes(1)&&<>‘{leadingType.label}’ 질문이 가장 큰 비중을 차지했습니다. </>}{sections.includes(0)&&topTopics.length?<>다음 설명에서는 ‘{topTopics[0].label}’의 질문 근거를 먼저 확인하고, 필요한 설명이나 사례를 보완해 보세요.</>:pending.length?'남은 질문을 확인하고 추가 답변이 필요한 내용을 정리해 보세요.':'추가 질문이 있는지 확인해 보세요.'}</>:'수집된 질문이 없어 아직 강의 총평을 만들 수 없습니다. 질문이 없다는 사실만으로 이해도를 판단하지 않습니다.'}</p></section>
   <details className={s.extraDetails}><summary>세부 분석 더 보기</summary><div>{titles.map((title,index)=>sections.includes(index)&&<button key={title} onClick={()=>{setDetail(index);setScope(null);}}>{title} →</button>)}</div></details>
  </>:<>
   <header className={s.detailHeader}><button onClick={back}>← 전체 요약</button><h3>{titles[detail]}</h3></header>
   <section className={s.detailContent} aria-label={titles[detail]}>
    {detail===0&&<ReexplainReview session={session} topics={topTopics} scope={reviewScope}/>}
    {detail===0&&<h3>내용 영역별 전체 질문</h3>}
    {detail===3&&<AnswerDonut items={states.map(t=>({label:t.label,count:t.rows.length}))}/>}
    {detail===1&&<TypeComposition items={types.map(t=>({label:t.label,count:t.rows.length}))}/>}
    {detail<4?bars(detail===0?rankedRegions:detail===1?types:detail===2?pageRows:states,detail===1||detail===3):null}
    {detail===3&&<p>묶음 전후: 원본 {total}건 → 제안 {groups.length}개 · 개별 질문 {groups.filter(g=>g.kind==='single').length}개. 묶음은 원문을 삭제하지 않습니다.</p>}
    {detail===4&&(repeated.length?repeated.map(g=><button className={s.topic} key={g.id} onClick={()=>setScope({label:g.representative.text,rows:g.questions})}><small>{(session.slides[g.page]?.pageIndex??g.page)+1}페이지 · {g.questions.length}건</small><strong>{g.representative.text}</strong></button>):<p>현재 반복 질문 묶음이 없습니다.</p>)}
    {detail===5&&(popular.length?popular.map(q=><button key={q.id} className={s.topic} onClick={()=>setScope({label:'미답변 질문',rows:[q]})}><small>{(session.slides[q.slideIndex]?.pageIndex??q.slideIndex)+1}페이지 · 공감 {q.reactionCount}</small><strong>{q.text}</strong></button>):<p>미답변 질문이 없습니다.</p>)}
    {detail===6&&<><p>{status||'분석 대기'}</p><p>영역 레이블이 있는 자료: {Object.values(sectors).filter(rows=>rows.length).length}페이지 · 영역 미분류: {unassigned.length}건</p><p>수동 레이블과 분석 결과가 함께 포함됩니다. 레이블 수는 자동 분석 완료를 의미하지 않습니다. 질문 수만으로 이해도나 참여율을 판단하지 않습니다.</p></>}
    {detail===7&&(unassigned.length?bars([{label:'영역 미분류',rows:unassigned}]):<p>영역 미분류 질문이 없습니다.</p>)}
   </section>
   {scope&&<section className={s.evidence} aria-label="선택한 분석의 원문 근거"><header><h3>{scope.label} · {scope.rows.length}건</h3><button onClick={()=>setScope(null)}>근거 닫기</button></header>{scope.rows.map(q=><article key={q.id}><small>{(session.slides[q.slideIndex]?.pageIndex??q.slideIndex)+1}페이지 · {q.status==='unanswered'?'미답변':q.status==='answered'?'답변됨':'해결됨'} · 공감 {q.reactionCount}</small><p>{q.text}</p><button disabled={!session.slides[q.slideIndex]} onClick={()=>onPage(session.slides[q.slideIndex].id)}>해당 슬라이드·핀 보기 →</button></article>)}</section>}
  </>}
 </div>;
}
