'use client';
import Link from 'next/link';
import {GeneratedReportWorkspace} from '@/app/component/generated-report-workspace';
import {AnalysisShellHeader} from '@/app/component/analysis-shell-header';
import {StudioUnfold} from '@/app/component/studio-entry';
import {useParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {useSessions} from '@/app/_controller/session-store';
import type {ClassSession} from '@/app/_model/types';
import {createSoiDemoSession,type SoiDemoSource} from '@/app/_model/soi-demo';
import {SlideCanvas} from '@/app/component/slide-canvas';
import {PinComposer} from '@/app/component/pin-composer';
import {SpatialCanvas} from '../question-map/spatial-canvas';
import {pageBucket,type MapMode} from '@/app/_model/question-map';
import {analyzedSectors} from './analyzed-sectors';
import {useLocalSections} from './use-local-sections';
import {useStudio} from './controller';
import s from './page.module.css';
import {ContentDashboard} from './content-dashboard';

import {contentTopics,pageTopic} from './content-topics';

export default function Page(){
 const {id}=useParams<{id:string}>();const {sessions,ready}=useSessions();
 const [preview,setPreview]=useState<ClassSession|null>(null),[previewError,setPreviewError]=useState('');
 useEffect(()=>{
  if(id!=='soi-demo')return;
  const controller=new AbortController();
  void fetch('/demo/soi/demo-data.json',{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('SOI 자료를 불러오지 못했습니다.');
   const source=await response.json() as SoiDemoSource;
   if(!controller.signal.aborted)setPreview(createSoiDemoSession(source));
  }).catch(error=>{if(!controller.signal.aborted)setPreviewError((error as Error).message);});
  return()=>controller.abort();
 },[id]);
 const session=id==='soi-demo'?preview:sessions.find(x=>x.id===id);
 if(id==='soi-demo'&&!preview)return <main className={s.root}><p role={previewError?'alert':'status'}>{previewError||'SOI 15페이지 자료를 불러오는 중…'}</p>{previewError&&<button onClick={()=>window.location.reload()}>다시 시도</button>}</main>;
 if(!ready)return <main className={s.root}><StudioUnfold/>자료를 불러오는 중…</main>;
 if(!session)return <main className={s.root}>자료를 찾을 수 없습니다. <Link href="/admin/dashboard">대시보드</Link></main>;
 if(id!=='soi-demo')return <GeneratedReportWorkspace key={id} source={session} view="studio"/>;
 return <Studio key={id} session={session} sourceQuestions={id==='soi-demo'}/>;
}
function Studio({session,sourceQuestions}:{session:ClassSession;sourceQuestions:boolean}){
 const [contentOpen,setContentOpen]=useState(false);
 const [panelOpen,setPanelOpen]=useState(false);
 const floatingButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!panelOpen)return;
  const outside=(event:PointerEvent)=>{
   if(event.target instanceof Element&&!event.target.closest('[data-studio-panel], [data-studio-trigger], [role="dialog"]'))setPanelOpen(false);
  };
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){setPanelOpen(false);floatingButton.current?.focus();}};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);};
 },[panelOpen]);
 const analysis=useLocalSections(session);
 const c=useStudio(session,{sourceQuestions});const canvas=useRef<HTMLDivElement>(null);
 const [cursor,setCursor]=useState(0),[pin,setPin]=useState<string|null>(null),[review,setReview]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[person,setPerson]=useState(1),[audience,setAudience]=useState(false);
 const [mapMode,setMapMode]=useState<MapMode>('original'),[sort,setSort]=useState('page');
 const [layout,setLayout]=useState(()=>session.slides.map(slide=>({id:slide.id,bucket:'페이지 순서'})));
 const demoSession={...session,questions:c.current.map(q=>({...q,status:c.done.includes(q.id)?'resolved' as const:q.status}))};
 function arrange(nextMode=mapMode,nextSort=sort){setMapMode(nextMode);setSort(nextSort);const rows=session.slides.map((slide,i)=>{const qs=demoSession.questions.filter(q=>q.slideIndex===i);return {id:slide.id,bucket:nextMode==='content'?contentTopics[pageTopic(session,i)]:pageBucket(qs,nextMode),index:i,count:qs.filter(q=>q.status==='unanswered').length};});if(nextSort==='count')rows.sort((a,b)=>b.count-a.count||a.index-b.index);setLayout(rows);c.refresh();}
 const topic=c.topics.find(t=>t.id===c.active);
 const snapshotIds=new Set(c.fixtures.slice(0,c.snapshot).map(q=>q.id));
 const items=topic?.items.filter(q=>snapshotIds.has(q.id))??[];
 const question=items[Math.min(cursor,Math.max(0,items.length-1))];
 const pinQuestion=c.current.find(q=>q.id===pin);
 const pending=c.current.filter(q=>q.status==='unanswered'&&!c.done.includes(q.id));
 const hotspot=[...c.topics].sort((a,b)=>b.pending-a.pending)[0];
 const visible=c.frozen.filter(t=>t.state===c.tab);
 function open(id:string){setPanelOpen(true);c.setActive(id);setCursor(0);setPin(null);setReview(false);setSelected([]);c.setMode('questions');}
 function askComplete(){setSelected([]);setReview(true);}
 return <main className={s.root}>
  <AnalysisShellHeader sessionId={session.id} title={session.title} active="studio" back={session.folderId?`/admin/folders/${session.folderId}`:'/admin/dashboard'} actions={<><a href={`/admin/session/${session.id}/qa-studio/presenter`} target="_blank" rel="noopener noreferrer">강사 슬라이드쇼 ↗</a><a href={`/admin/session/${session.id}/qa-studio/student`} target="_blank" rel="noopener noreferrer">학생 질문 창 ↗</a><Link href={`/admin/session/${session.id}/question-map`}>기존 질문 지도 ↗</Link></>}/>

  <div className={s.demo}><b>{sourceQuestions?'SOI 자료 데모':'프론트엔드 실험'}</b> {sourceQuestions?'원본 슬라이드 15장 + 익명 질문 21건 · 초기 답변 상태 유지':'실제 슬라이드 + 가상 청중 50명 · 질문·주제·반응은 시뮬레이션'} · DB 저장 없음</div>
  {!sourceQuestions&&<div style={{position:'fixed',bottom:48,left:20,zIndex:20,background:'white',padding:12,borderRadius:12,maxWidth:440}} role="status"><strong>로컬 의미 분석</strong> · {analysis.run?`${analysis.run.done}/${analysis.run.total} · ${analysis.run.status==='running'?'분석 중':analysis.run.status==='complete'?'완료 · 검토 필요':'일부 실패'}`:'미분석'} <button onClick={analysis.start}>분석 시작 / 실패 페이지 재시도</button>{analysis.run&&Object.keys(analysis.run.errors).length>0&&<p>{Object.values(analysis.run.errors)[0]}</p>}<small>외부 전송 없음 · 분석 서버 8769 필요</small></div>}<nav className={s.nav} aria-label="진행 모드"><button onClick={()=>{setPanelOpen(false);c.setMode('map');arrange('content');}}>내용별 자료 분류</button><button onClick={()=>setContentOpen(true)}>질문 받겠습니다 · 실시간 그래프</button><button aria-pressed={c.mode==='lecture'} data-studio-trigger onClick={()=>{c.setMode('lecture');setPanelOpen(true);}}>01 수업 중</button><button aria-pressed={c.mode==='questions'} data-studio-trigger onClick={()=>{c.start();setPanelOpen(true);}}>02 질문 시간</button><button aria-pressed={c.mode==='map'} onClick={()=>c.setMode('map')}>03 전체 자료 지도</button><span/>{!sourceQuestions&&<button disabled={c.count>=c.fixtures.length} onClick={c.arrive}>가상 질문 10개 유입</button>}<button onClick={()=>setAudience(!audience)} aria-expanded={audience}>청중 반응 미리보기</button><button disabled={!c.canUndo} onClick={c.undo}>처리 되돌리기</button></nav>
  <div className={s.canvasBase}><SpatialCanvas allowBoards contentMode detailsLabel="이 페이지 주제 보기" session={demoSession} allowSimulation={false} sectors={analysis.confirmed??analyzedSectors(session)} onComplete={q=>c.complete([q.id])} busy={false} error="" layout={layout} mode={mapMode} sort={sort} newCount={Math.max(0,c.count-c.snapshot)} arrange={arrange} onOpen={id=>{const index=session.slides.findIndex(x=>x.id===id);const t=c.topics.find(x=>x.page===index);if(t){c.refresh();open(t.id);}}}/></div>
  {c.mode!=='map'&&<button ref={floatingButton} data-studio-trigger className={s.floatingToggle} aria-expanded={panelOpen} aria-controls="studio-question-panel" onClick={()=>setPanelOpen(value=>!value)}>{panelOpen?'닫기 ×':c.mode==='lecture'?`질문 현황 · ${pending.length}`:'설명할 주제 열기'}</button>}
  {panelOpen&&c.mode==='lecture'?<section id="studio-question-panel" data-studio-panel className={s.lecture}><small>수업 중에는 중요한 변화만.</small><h2>질문은 모아둘게요.<br/>강의를 이어가세요.</h2><div className={s.metrics}><div><b>{pending.length}</b>미처리 질문</div><div><b>{sourceQuestions?c.current.length:new Set(c.current.map(q=>q.person)).size}</b>{sourceQuestions?'SOI 질문':'가상 질문자'}</div><div><b>+{Math.max(0,c.count-c.snapshot)}</b>새로 도착</div></div><p>{hotspot?`${hotspot.page+1}페이지 · ${hotspot.title}에 미처리 ${hotspot.pending}건`:'등록된 질문이 없습니다.'}</p><button className={s.primary} onClick={c.start}>여기까지, 질문 받을게요 →</button><small>{sourceQuestions?'익명 SOI 질문 원문을 읽기 전용으로 불러왔습니다.':'질문 유입은 버튼으로 재현합니다. 발표 페이지는 자동으로 이동하지 않습니다.'}</small></section>:panelOpen&&c.mode==='questions'?<div id="studio-question-panel" className={s.workspace}>
   <aside data-studio-panel className={s.queue}><div className={s.heading}><h2>설명할 주제</h2><button onClick={c.refresh}>목록 갱신 {c.count>c.snapshot?`+${c.count-c.snapshot}`:''}</button></div><small>페이지 + 질문 유형으로 구성한 데모 주제입니다. AI 요약이 아닙니다.</small><div className={s.tabs}>{(['waiting','held','done'] as const).map((key,i)=><button key={key} aria-pressed={c.tab===key} onClick={()=>c.setTab(key)}>{['대기','나중에','설명 완료'][i]} {c.topics.filter(t=>t.state===key).length}</button>)}</div>{visible.length===0&&<p>이 목록에 주제가 없습니다. 새 질문이 있다면 목록을 갱신하세요.</p>}{visible.map((t,i)=><button className={`${s.topic} ${c.active===t.id?s.active:''}`} key={t.id} onClick={()=>open(t.id)}><small>{i<3&&c.tab==='waiting'?`우선 확인 ${i+1} · `:''}{t.page+1}페이지</small><strong>{t.title}</strong><span>{sourceQuestions?`질문 ${t.items.length}개 · 미처리 ${t.pending}개`:`질문 ${t.items.length}개 · ${t.people}명 · 미처리 ${t.pending}개`}</span>{Object.values(c.votes[t.id]??{}).includes('no')&&<em>추가 설명 요청 있음</em>}</button>)}</aside>
   <section data-studio-panel className={`${s.focus} ${!topic?s.focusEmpty:''}`}>{topic&&session.slides[topic.page]?<><div className={s.heading}><div><small>{topic.page+1}페이지 / {session.title}</small><h2>{topic.title}</h2></div><button onClick={()=>c.setActive(null)}>접기</button></div><div className={s.stage} ref={canvas}><SlideCanvas slide={session.slides[topic.page]} questions={c.current.filter(q=>q.slideIndex===topic.page).map(q=>({...q,status:c.done.includes(q.id)?'resolved' as const:q.status}))} selectedId={question?.id} onSelectPin={setPin} statusColoredPins/></div>
    <div className={s.representative}><small>{sourceQuestions?'질문 원문':'대표 원문'} / {cursor+1} of {items.length}{sourceQuestions?` · ${question?.id}`:` · 가상 청중 ${question?.person}`}</small><p>{question?.text.replace(/^\[.*?\]\s*/,'')??'목록을 갱신해 새 질문을 확인하세요.'}</p><div className={s.actions}><button disabled={cursor===0} onClick={()=>setCursor(i=>i-1)}>← 이전</button><button disabled={cursor>=items.length-1} onClick={()=>setCursor(i=>i+1)}>다른 질문 확인 →</button><span/>{topic.state==='waiting'?<><button onClick={()=>c.hold(topic.id)}>나중에</button><button className={s.primary} onClick={askComplete}>설명 완료…</button></>:topic.state==='held'||topic.items.some(q=>c.done.includes(q.id))?<button onClick={()=>c.restore(topic.id)}>다시 대기열로</button>:<small>이 주제는 원본에서 이미 답변 완료됐습니다.</small>}</div></div>
    {review&&<section className={s.review} aria-label="설명 완료 대상 확인"><h3>함께 설명한 질문을 선택하세요</h3><p>선택한 질문만 완료 처리합니다. 새로 들어온 질문은 자동 포함하지 않습니다.</p><button onClick={()=>setSelected(items.filter(q=>q.status==='unanswered'&&!c.done.includes(q.id)).map(q=>q.id))}>현재 미처리 원문 전체 선택</button><div>{items.map(q=><label key={q.id}><input type="checkbox" disabled={q.status!=='unanswered'||c.done.includes(q.id)} checked={selected.includes(q.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,q.id]:ids.filter(id=>id!==q.id))}/>{q.text}{(q.status!=='unanswered'||c.done.includes(q.id))&&' ✓ 설명 완료'}</label>)}</div><div className={s.actions}><button onClick={()=>setReview(false)}>취소</button><button className={s.primary} disabled={!selected.length} onClick={()=>{c.complete(selected);setReview(false);}}>선택한 {selected.length}개 설명 완료</button></div></section>}
    <div className={s.feedback}><strong>설명 완료 ≠ 청중 이해</strong><span>이해했어요 {Object.values(c.votes[topic.id]??{}).filter(v=>v==='yes').length}명</span><span>아직 모르겠어요 {Object.values(c.votes[topic.id]??{}).filter(v=>v==='no').length}명</span><small>가상 청중 반응 · 응답하지 않은 사람의 이해 여부는 알 수 없습니다.</small></div>
   </>:<div className={s.empty}><h2>무엇부터 설명할까요?</h2><p>왼쪽 주제를 선택하면 자료 위치와 대표 질문을 함께 확인할 수 있습니다.</p><small>대기열은 자동 재정렬하지 않습니다. ‘목록 갱신’으로 새 질문을 반영하세요.</small></div>}</section>
  </div>:null}
  {panelOpen&&pinQuestion&&c.mode==='questions'&&topic&&<PinComposer canvasRef={canvas} x={pinQuestion.x??.5} y={pinQuestion.y??.5} duration={180} onClose={()=>setPin(null)}><h3 id="question-modal-title">{sourceQuestions?`질문 ${pinQuestion.id}`:`가상 청중 ${pinQuestion.person}`}</h3><p>{pinQuestion.text}</p><button disabled={c.done.includes(pinQuestion.id)||pinQuestion.status!=='unanswered'} onClick={()=>c.complete([pinQuestion.id])}>{c.done.includes(pinQuestion.id)||pinQuestion.status!=='unanswered'?'이미 답변 완료':'이 질문 설명 완료'}</button><button onClick={()=>setPin(null)}>닫기</button></PinComposer>}
  {audience&&<aside className={s.audience}><div className={s.heading}><h3>청중 반응 시뮬레이터</h3><button onClick={()=>setAudience(false)}>닫기</button></div><p>실제 청중 연결 없이 반응 흐름만 시험합니다.</p><label>가상 참여자 <select value={person} onChange={e=>setPerson(Number(e.target.value))}>{Array.from({length:50},(_,i)=><option key={i} value={i+1}>{i+1}번 청중</option>)}</select></label>{c.topics.filter(t=>t.items.some(q=>c.done.includes(q.id))).map(t=><div className={s.vote} key={t.id}><strong>{t.page+1}페이지 · {t.title}</strong><button aria-pressed={c.votes[t.id]?.[person]==='yes'} onClick={()=>c.vote(t.id,person,'yes')}>이해했어요</button><button aria-pressed={c.votes[t.id]?.[person]==='no'} onClick={()=>c.vote(t.id,person,'no')}>아직 모르겠어요</button>{c.votes[t.id]?.[person]==='no'&&<button onClick={()=>{c.restore(t.id);open(t.id);}}>강사 대기열로 복귀</button>}</div>)}{!c.done.length&&<p>먼저 질문에 ‘설명 완료’를 눌러주세요.</p>}</aside>}
  {contentOpen&&<ContentDashboard session={demoSession} sectors={analysis.confirmed??analyzedSectors(session)} onClose={()=>setContentOpen(false)} arrive={c.arrive} sourceQuestions={sourceQuestions}/>}
 </main>;
}
