'use client';
/* eslint-disable @next/next/no-img-element -- preserve exact image aspect ratio for normalized PIN coordinates */
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useRef,useState,type PointerEvent} from 'react';
import {useSessions} from '@/app/_controller/session-store';
import type {ClassSession,Question,Slide} from '@/app/_model/types';
import {confusionSource,hasPoint,mapType,sectorFor,typeNames,validSector,type Sector} from '@/app/_model/question-map';
import {useQuestionMap} from './controller';
import {SpatialCanvas} from './spatial-canvas';
import styles from './page.module.css';

export default function QuestionMapPage(){
 const {id}=useParams<{id:string}>();const {sessions,ready}=useSessions();const session=sessions.find(s=>s.id===id);
 if(!ready)return <main className={styles.root}>질문 지도를 불러오는 중…</main>;
 if(!session)return <main className={styles.root}><h1>자료를 찾을 수 없습니다.</h1><Link href="/admin/dashboard">대시보드로</Link></main>;
 return <MapWorkspace key={session.id} session={session}/>;
}
function MapWorkspace({session}:{session:ClassSession}){
 const c=useQuestionMap(session);const [mobile,setMobile]=useState(false);const [queueScope,setQueueScope]=useState('unplaced');const [currentQuestion,setCurrentQuestion]=useState<string|null>(null);
 const excluded=new Set(c.actions.deferred?c.actions.groups.flatMap(g=>g.questions.map(q=>q.id)):[]);
 const selectedIndex=session.slides.findIndex(s=>s.id===c.selected);const slide=session.slides[selectedIndex];
 const sections=slide?c.sectors[slide.id]??[]:[];
 const matches=(q:Question)=>c.filter==='all'||mapType(q)===c.filter;
 const pageQuestions=session.questions.filter(q=>q.slideIndex===selectedIndex);
 const actionable=c.actions.groups.flatMap(g=>g.questions);
 const queue=actionable.filter(q=>queueScope==='all'||!hasPoint(q)||!session.slides[q.slideIndex]);
 const active=queue.find(q=>q.id===currentQuestion)??queue[0];
 function selectQuestion(q:Question){setCurrentQuestion(q.id);}
 return <main className={styles.root}>
  <header className={styles.header}><Link href={session.folderId?`/admin/folders/${session.folderId}`:'/admin/dashboard'} aria-label="자료로 돌아가기">←</Link><div><strong>{session.title}</strong><small>CLASS PIN / PLAYGROUND</small></div><Link href={`/admin/session/${session.id}/qa-studio`}>Q&A Studio 실험 ↗</Link><div className={styles.segment}><button aria-pressed={!mobile} onClick={()=>setMobile(false)}>캔버스</button><button aria-pressed={mobile} onClick={()=>setMobile(true)}>질문 처리</button></div></header>
  {(c.error||c.actions.error)&&<p role="alert" className={styles.error}>{c.error||c.actions.error}</p>}
  {c.actions.notice&&<p role="status">{c.actions.notice}</p>}
  {!mobile?<>
  <SpatialCanvas sectors={c.sectors} onComplete={q=>void c.actions.complete([q])} busy={c.actions.busy} error={c.actions.error} session={session} layout={c.layout} mode={c.mode} sort={c.sort} newCount={c.newCount} arrange={c.arrange} onOpen={c.select}/>
  {!session.slides.length&&<p>등록된 슬라이드가 없습니다.</p>}
  {slide&&<section id="map-page-detail" className={styles.detail}><div className={styles.toolbar}><div><p className={styles.eyebrow}>PAGE {selectedIndex+1} / DETAIL</p><h2>슬라이드 영역 편집</h2></div><Link href={`/admin/session/${session.id}?slide=${selectedIndex}`}>발표 화면에서 열기 ↗</Link><button onClick={()=>c.select(null)}>영역 편집 닫기</button></div>
   <div className={styles.toolbar}><label>질문 유형 <select value={c.filter} onChange={e=>c.setFilter(e.target.value)}><option value="all">전체 유형</option>{Object.entries(typeNames).filter(([k])=>!['none','mixed'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label><input type="checkbox" checked={c.hide} onChange={e=>c.setHide(e.target.checked)}/> 나머지 핀 숨기기</label><small>이해 어려움: 선택 유형 + 정확한 문구 일치 (AI 추정 아님)</small></div>
   <SectorStage key={slide.id} slide={slide} questions={pageQuestions} sections={sections} selected={c.sector} select={c.setSector} matches={matches} hide={c.hide} save={items=>c.save(slide.id,items)} ready={c.settingsReady} onPin={selectQuestion}/>
   <div className={styles.toolbar}><button aria-pressed={c.sector===null} onClick={()=>c.setSector(null)}>전체 {pageQuestions.length}</button>{sections.map(s=><button key={s.id} aria-pressed={c.sector===s.id} onClick={()=>c.setSector(s.id)}>{s.name} · {pageQuestions.filter(q=>sectorFor(q,sections)===s.id&&matches(q)).length}</button>)}<button aria-pressed={c.sector==='unassigned'} onClick={()=>c.setSector('unassigned')}>영역 미지정 · {pageQuestions.filter(q=>sectorFor(q,sections)===null).length}</button></div>
  </section>}
  </>:<section className={styles.mobile}><div className={styles.toolbar}><h2>한 장씩, 차분하게.</h2><select aria-label="질문 범위" value={queueScope} onChange={e=>setQueueScope(e.target.value)}><option value="unplaced">위치 미지정·점 위치 확인 필요</option><option value="all">전체 미답변</option></select><button aria-pressed={c.actions.deferred} onClick={()=>c.actions.setDeferred(!c.actions.deferred)}>{c.actions.deferred?'대기 목록으로':'제외함 열기'}</button></div><p>왼쪽: 제외함(보류) · 오른쪽: 처리 완료 · 원문은 삭제하지 않습니다.</p>
   {active?<SwipeCard key={active.id} q={active} busy={c.actions.busy} onLeft={()=>void c.actions.change([active.id],{deferred:!excluded.has(active.id)})} onRight={()=>void c.actions.complete([active])} onAnswer={()=>c.actions.openReply([active])} onPage={()=>{if(session.slides[active.slideIndex]){c.select(session.slides[active.slideIndex].id);setMobile(false);}}} excluded={c.actions.deferred}/>:<div className={styles.empty}>이 목록의 질문을 모두 확인했습니다.</div>}
   <p>{queue.length}건 남음 · {c.actions.deferred?'제외함':'대기 목록'}</p></section>}
  {(mobile||c.actions.lastAction)&&<div className={styles.undoBar}><button disabled={c.actions.busy||!c.actions.lastAction} onClick={()=>void c.actions.undo()}>마지막 완료 되돌리기</button><small>제외함에서 질문을 다시 복귀할 수 있습니다.</small></div>}
  {c.actions.reply&&<section className={styles.composer} aria-label="공통 답변 작성"><h2>{c.actions.reply.targets.length}개 질문에 답변</h2><ul>{c.actions.reply.targets.map(t=><li key={t.id}>{t.text}</li>)}</ul><label>강사 답변<textarea value={c.actions.reply.body} maxLength={2000} readOnly={c.actions.reply.submitted} disabled={c.actions.busy} onChange={e=>c.actions.editReply({body:e.target.value})}/></label><label><input type="checkbox" checked={c.actions.reply.confirmed} disabled={c.actions.busy||c.actions.reply.submitted} onChange={e=>c.actions.editReply({confirmed:e.target.checked})}/> 원문을 확인했고 이 답변을 모두에게 전달하겠습니다.</label><div className={styles.toolbar}><button disabled={c.actions.busy||!c.actions.reply.confirmed||!c.actions.reply.body.trim()} onClick={()=>void c.actions.sendReply()}>답변 전송{c.actions.reply.submitted?' 재시도':''}</button><button disabled={c.actions.busy} onClick={c.actions.closeReply}>작성창 닫기</button></div><small>작성 중 새 질문은 자동으로 포함하지 않습니다.</small></section>}
 </main>;
}
function QuestionText({q}:{q:Question}){return <><small>{q.slideIndex>=0?`${q.slideIndex+1}페이지`:'페이지 미지정'} · {typeNames[mapType(q)]} · {q.status==='unanswered'?'미답변':q.status==='answered'?'답변 완료':'처리 완료'}{confusionSource(q)&&` · ${confusionSource(q)}`}</small><p>{q.text}</p>{q.answer&&<blockquote>{q.answer}</blockquote>}</>;}
function SwipeCard({q,busy,onLeft,onRight,onAnswer,onPage,excluded}:{q:Question;busy:boolean;onLeft:()=>void;onRight:()=>void;onAnswer:()=>void;onPage:()=>void;excluded:boolean}){
 const start=useRef<{x:number;y:number}|null>(null);const [dx,setDx]=useState(0);
 return <div className={styles.swipeWrap}><article className={styles.swipe} style={{transform:`translateX(${dx}px) rotate(${dx/24}deg)`}} onPointerDown={e=>{if(busy||(e.target as HTMLElement).closest('button'))return;start.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(start.current)setDx(Math.max(-90,Math.min(90,e.clientX-start.current.x)));}} onPointerCancel={()=>{start.current=null;setDx(0);}} onPointerUp={e=>{if(start.current&&!busy){const delta=e.clientX-start.current.x;if(Math.abs(delta)>70&&Math.abs(delta)>Math.abs(e.clientY-start.current.y)*1.5){if(delta<0)onLeft();else onRight();}}start.current=null;setDx(0);}}><QuestionText q={q}/><div className={styles.toolbar}><button onClick={onPage}>위치 확인</button><button disabled={busy} onClick={onAnswer}>답변 작성</button></div></article><div className={styles.toolbar}><button disabled={busy} onClick={onLeft}>← {excluded?'대기로 복귀':'제외함'}</button><button disabled={busy} onClick={onRight}>처리 완료 →</button></div></div>;
}
function SectorStage({slide,questions,sections,selected,select,matches,hide,save,ready,onPin}:{slide:Slide;questions:Question[];sections:Sector[];selected:string|null;select:(s:string|null)=>void;matches:(q:Question)=>boolean;hide:boolean;save:(s:Sector[])=>void;ready:boolean;onPin:(q:Question)=>void}){
 const [drawing,setDrawing]=useState(false);const [draft,setDraft]=useState<Sector|null>(null);const [name,setName]=useState('');const [loaded,setLoaded]=useState(false);const start=useRef<{x:number;y:number}|null>(null);
 function point(e:PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
 return <><div className={styles.toolbar}><button disabled={!ready||!loaded} aria-pressed={drawing} onClick={()=>{setDrawing(!drawing);setDraft(null);}}>사각형 섹션 그리기</button><button disabled={!ready} onClick={()=>{setDraft({id:'draft',name:'새 섹션',x:0,y:0,w:.5,h:.5});setDrawing(false);}}>좌표로 섹션 추가</button><small>직접 지정 · 이 브라우저에만 저장 · 중첩 핀은 영역 미지정</small></div><div className={`${styles.stage} ${drawing?styles.drawing:''}`} onPointerDown={e=>{if(!drawing)return;start.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drawing||!start.current)return;const p=point(e),a=start.current;setDraft({id:'draft',name:'새 섹션',x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)});}} onPointerUp={()=>{start.current=null;}} onPointerCancel={()=>{start.current=null;setDraft(null);}}>
 {slide.imageUrl?<img src={slide.imageUrl} alt={slide.title} onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>:<p>슬라이드 이미지가 없습니다.</p>}
 {sections.map((s,i)=><button className={styles.sector} aria-pressed={selected===s.id} key={s.id} disabled={drawing} style={{left:`${s.x*100}%`,top:`${s.y*100}%`,width:`${s.w*100}%`,height:`${s.h*100}%`}} onClick={()=>select(s.id)}><span>{String.fromCharCode(65+i)} · {s.name} · {questions.filter(q=>sectorFor(q,sections)===s.id&&matches(q)).length}</span></button>)}
 {questions.filter(q=>hasPoint(q)&&(!hide||matches(q))).map(q=><button key={q.id} disabled={drawing} className={`${styles.pin} ${!matches(q)?styles.dim:''}`} aria-label={q.text} title={q.text} style={{left:`${q.x!*100}%`,top:`${q.y!*100}%`}} onClick={()=>{select(sectorFor(q,sections)??'unassigned');onPin(q);}}>●</button>)}
 {draft&&<div className={styles.draft} style={{left:`${draft.x*100}%`,top:`${draft.y*100}%`,width:`${draft.w*100}%`,height:`${draft.h*100}%`}}/>}</div>
 {draft&&<div className={styles.toolbar}><label>섹션 이름 <input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="예: 계산식"/></label>{(['x','y','w','h'] as const).map(k=><label key={k}>{({x:'왼쪽',y:'위쪽',w:'너비',h:'높이'})[k]} %<input type="number" min={0} max={100} style={{width:80}} value={Math.round(draft[k]*100)} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)/100})}/></label>)}<button disabled={!name.trim()||!validSector({...draft,name})||sections.length>=30} onClick={()=>{save([...sections,{...draft,id:crypto.randomUUID(),name:name.trim()}]);setDraft(null);setName('');setDrawing(false);}}>섹션 저장</button><button onClick={()=>{setDraft(null);setDrawing(false);}}>취소</button></div>}
 {sections.map(s=><div className={styles.sectorEdit} key={s.id}><span>{s.name}</span><button onClick={()=>{save(sections.filter(x=>x.id!==s.id));select(null);}}>영역 해제 (핀 보존)</button></div>)}
 </>;
}
