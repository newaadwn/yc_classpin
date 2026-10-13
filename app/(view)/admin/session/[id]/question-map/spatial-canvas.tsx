'use client';
/* eslint-disable @next/next/no-img-element -- native images preserve slide geometry */
import {insideBubbles,bubbleTail} from '@/app/_model/outward-bubbles';
import {CanvasDemoChat} from '@/app/component/canvas-demo-chat';
import {ScopeSummary} from '@/app/component/scope-summary';
import type {AnalysisScope} from '@/app/_model/report-scopes';
import {useEffect,useMemo,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {SlideCanvas} from '@/app/component/slide-canvas';
import {PinComposer} from '@/app/component/pin-composer';
import unselectedPinIcon from '@/assets/icons/pin_black_icon.svg';
import selectedPinIcon from '@/assets/icons/pin_icon.svg';
import {questionMarkerEmoji} from '@/app/_model/types';
import type {ClassSession,Question} from '@/app/_model/types';
import {hasPoint,mapType,sectorSummaries,type Sector,type MapMode,typeNames} from '@/app/_model/question-map';
import {canvasLayout,fitCamera,zoomCamera,type CanvasPoint,type Camera,type CanvasRow} from '@/app/_model/question-canvas';
import s from './spatial-canvas.module.css';
import {useCondensedQuestions} from './use-condensed-questions';
import {GenerationSettings,type GenerationOptions} from '@/app/component/generation-settings';
import {AnalysisBoard,AnalysisBoardFullscreen,boardTitles,type BoardKind} from './analysis-board';
import {withBoardBounds,BOARD_WIDTH,BOARD_HEIGHT} from '@/app/_model/analysis-board-layout';
import {audienceSimulation,SIM_PIN_PREFIX} from '@/app/_model/question-map-simulation';

type Origin={left:number;top:number;width:number;height:number};
type Processing={onComplete:(q:Question)=>void;busy:boolean;error:string};
function FullscreenSlide({session,id,filter,onClose,onQuestions,origin,onComplete,busy,error,sectors,setFilter,detailsLabel,groupQuestions,groupingReady}:{groupQuestions:(rows:Question[])=>Question[][];groupingReady:boolean;session:ClassSession;id:string;filter:string;onClose:()=>void;onQuestions:()=>void;origin:Origin|null;sectors:Sector[];setFilter:(value:string)=>void;detailsLabel:string}&Processing){
 const dialog=useRef<HTMLDialogElement>(null);
 const canvas=useRef<HTMLDivElement>(null);const [selected,setSelected]=useState<string|null>(null);const [ratio,setRatio]=useState(origin?origin.width/origin.height:16/9);
 const index=session.slides.findIndex(slide=>slide.id===id),slide=session.slides[index];
 const questions=session.questions.filter(q=>q.slideIndex===index);
 const [pinView,setPinView]=useState<'all'|'grouped'|'overlay'>('all');
 const [groupId,setGroupId]=useState<string|null>(null);
 const groups=groupQuestions(questions.filter(q=>filter==='all'||mapType(q)===filter));
 const selectedGroup=groups.find(g=>g[0].id===groupId);
 const question=questions.find(q=>q.id===selected);
 const summaries=sectorSummaries(questions,sectors,filter);
 const [activeSector,setActiveSector]=useState<string|null>(null);
 const activeGroup=summaries.find(g=>g.id===activeSector);
 const [queue,setQueue]=useState<{name:string;ids:string[]}|null>(null);
 const queueIndex=queue?.ids.indexOf(selected??'')??-1;
 function openSector(id:string){setActiveSector(id);setQueue(null);setSelected(null);}
 function changeFilter(value:string){setFilter(value);setQueue(null);setSelected(null);}

 useLayoutEffect(()=>{
  const el=dialog.current;if(!el)return;const previous=document.activeElement as HTMLElement|null;el.showModal();
  let animation:Animation|undefined;
  if(origin&&canvas.current&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const target=canvas.current.getBoundingClientRect();
   animation=canvas.current.animate([{transformOrigin:'0 0',transform:`translate(${origin.left-target.left}px,${origin.top-target.top}px) scale(${origin.width/target.width},${origin.height/target.height})`},{transformOrigin:'0 0',transform:'translate(0,0) scale(1)'}],{duration:320,easing:'cubic-bezier(.22,.8,.24,1)'});
  }
  return()=>{animation?.cancel();el.close();previous?.focus();};
 },[origin]);
 return createPortal(<dialog ref={dialog} className={s.fullscreen} aria-label={`${index+1}페이지 전체화면`} onCancel={e=>{if(question){e.preventDefault();setSelected(null);}else onClose();}}>
  <header className={s.fullscreenToolbar}><strong>{index+1} / {session.slides.length} 페이지</strong><span>핀을 눌러 질문 보기 · {typeNames[filter]??'모든 질문'}</span><select aria-label="질문 유형" value={filter} onChange={e=>changeFilter(e.target.value)}><option value="all">전체 질문</option>{Object.entries(typeNames).filter(([k])=>!['mixed','none'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button onClick={onQuestions}>{detailsLabel}</button><button autoFocus onClick={onClose}>닫기 ✕ · Esc</button></header>
  <nav className={s.sectorSummary} aria-label="질문 표시 방식">{([['all','전체 질문'],['grouped','묶음 질문'],['overlay','전체 흐리게 + 묶음']] as const).map(([value,label])=><button key={value} aria-pressed={pinView===value} onClick={()=>{setPinView(value);setSelected(null);setGroupId(null);}}>{label}</button>)}<span>원문 {questions.filter(q=>filter==='all'||mapType(q)===filter).length}개 → 묶은 후 {groups.length}개 · 문구·영역 규칙 + 의미 유사도 · {groupingReady?'강사 검토 필요':'의미 유사도 계산 중'}</span></nav>
  <nav className={s.sectorSummary} aria-label="영역별 질문">{summaries.map(group=><button key={group.id} aria-pressed={activeSector===group.id} onClick={()=>openSector(group.id)}>{group.name} · 해당 미처리 {group.pending} / 전체 미처리 {group.totalPending}</button>)}{!sectors.length&&<span>영역 편집에서 먼저 영역을 지정하세요.</span>}</nav>
  <div className={s.sectionWorkspace}><div className={s.fullscreenStage}><div ref={canvas} className={s.fullscreenCanvas} data-pin-view={pinView} style={{'--slide-ratio':ratio} as React.CSSProperties} onLoadCapture={e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.parentElement?.classList.contains('slide-canvas')&&img.naturalHeight)setRatio(img.naturalWidth/img.naturalHeight);}}>
   {slide&&<SlideCanvas slide={slide} questions={questions} questionCategories={session.questionCategories} selectedId={selected} onSelectPin={id=>{setQueue(null);setGroupId(null);setSelected(id);}} statusColoredPins emphasizedQuestionIds={filter==='all'?undefined:questions.filter(q=>mapType(q)===filter).map(q=>q.id)}>
    {pinView!=='all'&&groups.map((group,i)=>{const anchor=group.find(hasPoint);return <button key={group[0].id} className={s.groupPin} style={{left:`${(anchor?.x??.95)*100}%`,top:`${(anchor?.y??(.08+i*.08)% .9)*100}%`}} aria-label={`유사 의미 질문 ${group.length}개: ${group[0].text}`} onClick={()=>{setGroupId(group[0].id);setSelected(group[0].id);setQueue(null);}}><span>{group.length}</span></button>;})}
    {sectors.map((region,i)=>{const group=summaries.find(g=>g.id===region.id)!;return <div key={region.id} className={s.fixedSector} data-active={activeSector===region.id} style={{left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.w*100}%`,height:`${region.h*100}%`,'--sector-color':['#9562db','#268e83','#d78034','#447acf'][i%4]} as React.CSSProperties}><button aria-pressed={activeSector===region.id} onClick={()=>openSector(region.id)}>{region.name} · {group.pending}건 미처리</button></div>;})}
   </SlideCanvas>}
  </div></div><aside className={s.sectionQuestions}><h2>{activeGroup?.name??'섹션별 질문'}</h2><p>{sectors.length?'색상 영역을 클릭해 질문을 확인하세요.':'연결된 분석 영역이 없습니다.'}</p><small>{session.id==='f7767d0a-14a7-4b1c-bd3d-fc50a8691d68'?('수동 지정 의미 영역 · 자동 분할 아님'):'지정된 영역 기준'}</small>{activeGroup&&<><p>{(sectors.find(s=>s.id===activeSector) as (Sector & {meaning?:string})|undefined)?.meaning}</p><h3>질문 {activeGroup.questions.length}개 · 미처리 {activeGroup.pending}개</h3>{!activeGroup.questions.length&&<p>현재 필터에 해당하는 질문이 없습니다.</p>}{activeGroup.questions.map(q=><button key={q.id} aria-pressed={selected===q.id} onClick={()=>setSelected(q.id)}><small>{typeNames[mapType(q)]} · {q.status==='unanswered'?'미처리':'답변 처리됨'}</small><p>{q.text}</p></button>)}</>}</aside></div>
  {question&&<PinComposer key={question.id} canvasRef={canvas} x={question.x??.5} y={question.y??.5} duration={180} onClose={()=>setSelected(null)}><div className={s.quickQuestion}><button className={s.quickClose} aria-label="질문 닫기" onClick={()=>setSelected(null)}>✕</button><h2 id="question-modal-title" className="sr-only">질문</h2>{queue&&<div className={s.questionStepper}><strong>{queue.name}</strong><button aria-label="이전 질문" disabled={queueIndex<=0} onClick={()=>setSelected(queue.ids[queueIndex-1])}>‹</button><span>{queueIndex+1} / {queue.ids.length}</span><button aria-label="다음 질문" disabled={queueIndex>=queue.ids.length-1} onClick={()=>setSelected(queue.ids[queueIndex+1])}>›</button></div>}{selectedGroup&&<div className={s.groupOriginals}><strong>같은 의미로 제안된 질문 {selectedGroup.length}개 · 원문별 상태 유지</strong>{selectedGroup.map(q=><button key={q.id} aria-pressed={selected===q.id} onClick={()=>setSelected(q.id)}>{q.status==='unanswered'?'미처리':'답변 처리됨'} · {q.text}</button>)}</div>}<p>{question.text}</p>{error&&<small role="alert">{error}</small>}<button className={s.completeButton} disabled={busy||question.status!=='unanswered'} onClick={()=>onComplete(question)}>{question.status!=='unanswered'?'✓ 답변 처리됨':busy?'처리 중…':'답변 처리'}</button></div></PinComposer>}
 </dialog>,document.body);
}

function useBarDrag(){
 const [offset,setOffset]=useState({x:0,y:0});
 const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 function move(element:HTMLElement,x:number,y:number){
  const bar=element.parentElement!, parent=bar.parentElement!;
  const rect=bar.getBoundingClientRect(), bounds=parent.getBoundingClientRect();
  setOffset(o=>({x:o.x+Math.max(bounds.left+8-rect.left,Math.min(x, bounds.right-8-rect.right)),y:o.y+Math.max(bounds.top+8-rect.top,Math.min(y,bounds.bottom-8-rect.bottom))}));
 }
 return {style:{transform:`translateX(-50%) translate(${offset.x}px,${offset.y}px)`},handle:{
  title:'드래그 또는 방향키로 이동',style:{touchAction:'none',cursor:'move'},
  onKeyDown:(e:React.KeyboardEvent<HTMLButtonElement>)=>{const d:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(d[e.key]){e.preventDefault();move(e.currentTarget,...d[e.key] as [number,number]);}},
  onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.stopPropagation();drag.current={x:e.clientX,y:e.clientY,left:offset.x,top:offset.y};e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{const d=drag.current;if(d)move(e.currentTarget,d.left+e.clientX-d.x-offset.x,d.top+e.clientY-d.y-offset.y);},
  onPointerUp:()=>{drag.current=null;},onPointerCancel:()=>{drag.current=null;}
 }};
}
export function SpatialCanvas({session:sourceSession,layout:baseLayout,mode,sort,newCount,arrange,onOpen,onComplete,busy,error,sectors,allowSimulation=true,contentMode=false,detailsLabel='영역 편집',readOnly=false,selectedSlideId,grouping,allowBoards=false,initialBoards,reviewScope='studio',analysisScopes:baseScopes=[]}:{session:ClassSession;layout:CanvasRow[];mode:MapMode;sort:string;newCount:number;arrange:(mode?:MapMode,sort?:string)=>void;onOpen:(id:string)=>void;sectors:Record<string,Sector[]>;allowSimulation?:boolean;contentMode?:boolean;detailsLabel?:string;readOnly?:boolean;selectedSlideId?:string;grouping?:ReturnType<typeof useCondensedQuestions>;allowBoards?:boolean;initialBoards?:GenerationOptions;reviewScope?:'studio'|'report';analysisScopes?:AnalysisScope[]}&Processing){
 const [chat,setChat]=useState<{x:number;y:number}|null>(null);
 const [customScopes,setCustomScopes]=useState<AnalysisScope[]>([]);
 const analysisScopes=[...baseScopes,...customScopes];
 const layout=useMemo(()=>[...baseLayout,...customScopes.flatMap((scope,i)=>scope.session.slides.map(slide=>({id:`chat-${i}:${slide.id}`,slideId:slide.id,bucket:scope.name,questionIds:scope.session.questions.filter(q=>scope.session.slides[q.slideIndex].id===slide.id).map(q=>q.id)})))],[baseLayout,customScopes]);
 useEffect(()=>{if(!allowBoards&&!initialBoards)return;const open=(e:MouseEvent)=>{if((e.target as Element)?.closest('dialog'))return;e.preventDefault();setChat({x:e.clientX,y:e.clientY});};window.addEventListener('contextmenu',open);return()=>window.removeEventListener('contextmenu',open);},[allowBoards,initialBoards]);
 const [boards,setBoards]=useState<Array<{id:string;kind:BoardKind;scopeName?:string;options?:GenerationOptions;x:number;y:number;width:number;height:number}>>(()=>analysisScopes.length?analysisScopes.map((scope,i)=>({id:`scope-${i}`,kind:'dashboard' as const,scopeName:scope.name,options:initialBoards,x:0,y:0,width:BOARD_WIDTH,height:340})):initialBoards?(['dashboard','report'] as const).map((kind,i)=>({id:`analysis-board-${kind}`,kind,options:initialBoards,x:-BOARD_WIDTH-100,y:i*(BOARD_HEIGHT+60),width:BOARD_WIDTH,height:BOARD_HEIGHT})):[]);
 const [configure,setConfigure]=useState<BoardKind|null>(null);
 const [fullBoard,setFullBoard]=useState<string|null>(null);
 const resize=useRef<{id:string;x:number;y:number;width:number;height:number;zoom:number}|null>(null);
 const boardsRef=useRef(boards);useLayoutEffect(()=>{boardsRef.current=boards;},[boards]);
 const [simulation,setSimulation]=useState(allowSimulation);
 const [simulationDone,setSimulationDone]=useState<string[]>([]);
 const generated=audienceSimulation(sourceSession).map(q=>simulationDone.includes(q.id)?{...q,status:'resolved' as const}:q);
 const session=simulation?{...sourceSession,questions:[...sourceSession.questions,...generated]}:sourceSession;
 const ownGrouping=useCondensedQuestions(session,{sectors,enabled:!grouping});
 const condensed=grouping??ownGrouping;
 function createDemoScope(numbers:number[]){
  const missing=numbers.filter(n=>!session.slides.some(s=>s.pageIndex+1===n));if(missing.length)throw Error(`${missing.join(', ')}페이지가 이 자료에 없습니다. 현재 자료의 페이지 번호를 입력해 주세요.`);
  const selected=session.slides.filter(s=>numbers.includes(s.pageIndex+1));const indices=selected.map(s=>session.slides.indexOf(s));
  const rows=session.questions.filter(q=>indices.includes(q.slideIndex)).map(q=>({...q,slideIndex:indices.indexOf(q.slideIndex)}));
  const ids=new Set(rows.map(q=>q.id));const name=`AI 요청 ${customScopes.length+1} · ${selected.map(s=>s.pageIndex+1).join(', ')}페이지`;
  const scope:AnalysisScope={name,session:{...session,slides:selected,questions:rows},groups:condensed.groups.flatMap(g=>{const qs=g.questions.filter(q=>ids.has(q.id)).map(q=>({...q,slideIndex:indices.indexOf(q.slideIndex)}));return qs.length?[{...g,page:indices.indexOf(g.page),questions:qs,representative:qs.find(q=>q.id===g.representative.id)??qs[0]}]:[]})};
  setCustomScopes(current=>[...current,scope]);setBoards(current=>[...current,{id:`chat-board-${customScopes.length}`,kind:'dashboard',scopeName:name,options:initialBoards,x:0,y:0,width:BOARD_WIDTH,height:340}]);
 }
 function completePin(q:Question){if(allowSimulation&&q.id.startsWith(SIM_PIN_PREFIX)){setSimulationDone(ids=>ids.includes(q.id)?ids:[...ids,q.id]);return;}onComplete(q);}
 const [initial]=useState(()=>canvasLayout(layout,1440,900,analysisScopes.length?BOARD_WIDTH+64:0));const [points,setPoints]=useState(initial.points);const [frames,setFrames]=useState(initial.frames);
 const [camera,setCamera]=useState<Camera>({x:40,y:20,zoom:.6});const [animate,setAnimate]=useState(false);
 const filterBar=useBarDrag();const toolsBar=useBarDrag();
 const [filter,setFilter]=useState('all');const [tool,setTool]=useState<'select'|'hand'>('select');const [focused,setFocused]=useState<string|null>(null);
 const [showCountPins,setShowCountPins]=useState(true);
 const pageCounts=new Map<number,number>();
 for(const q of session.questions){if(filter==='all'||mapType(q)===filter)pageCounts.set(q.slideIndex,(pageCounts.get(q.slideIndex)??0)+1);}
 const maxQuestions=Math.max(0,...session.slides.map((_,index)=>pageCounts.get(index)??0));
 const [expanded,setExpanded]=useState<string|null>(null);const [origin,setOrigin]=useState<Origin|null>(null);
 function openSlide(id:string){id=layout.find(r=>r.id===id)?.slideId??id;if(readOnly){onOpen(id);return;}const card=Array.from(viewport.current?.querySelectorAll<HTMLElement>('[data-card]')??[]).find(el=>el.dataset.card===id);const rect=card?.querySelector('img')?.getBoundingClientRect();setOrigin(rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:null);setFocused(id);setExpanded(id);}
 const viewport=useRef<HTMLDivElement>(null);const drag=useRef<{id:string|null;start:CanvasPoint;origin:CanvasPoint;zoom:number;moved:boolean}|null>(null);
 const cameraRef=useRef(camera);const pointsRef=useRef(points);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{cameraRef.current=camera;},[camera]);useEffect(()=>{pointsRef.current=points;},[points]);
 useEffect(()=>{
  const el=viewport.current;if(!el)return;
  let frame=0,stop:ReturnType<typeof setTimeout>;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const mainRows=layout.filter(r=>!r.id.startsWith('chat-')),extraRows=layout.filter(r=>r.id.startsWith('chat-'));
   const next=canvasLayout(mainRows,el.clientWidth,el.clientHeight,baseScopes.length?BOARD_WIDTH+64:0);
   if(extraRows.length){const extra=canvasLayout(extraRows,el.clientWidth,el.clientHeight,BOARD_WIDTH+64);const y=Math.max(0,...next.frames.map(f=>f.y+f.height),...boardsRef.current.filter(b=>!b.id.startsWith('chat-')).map(b=>b.y+b.height))+100;
   Object.entries(extra.points).forEach(([id,p])=>{next.points[id]={x:p.x,y:p.y+y};});next.frames.push(...extra.frames.map(f=>({...f,y:f.y+y})));}
   const normalFrames=next.frames.filter(f=>!f.name.startsWith('AI 요청 ')),chatFrames=next.frames.filter(f=>f.name.startsWith('AI 요청 '));
   const positioned=[...insideBubbles(normalFrames,boardsRef.current.filter(b=>!b.id.startsWith('chat-'))),...insideBubbles(chatFrames,boardsRef.current.filter(b=>b.id.startsWith('chat-')))];setBoards(positioned);
   setAnimate(true);setPoints(next.points);setFrames(next.frames);setCamera(fitCamera(withBoardBounds(next.points,positioned),el.clientWidth,el.clientHeight));
   clearTimeout(stop);stop=setTimeout(()=>setAnimate(false),650);
  });};
  update();const observer=new ResizeObserver(update);observer.observe(el);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);clearTimeout(stop);};
 },[layout,analysisScopes.length,baseScopes.length]);
 useEffect(()=>{const el=viewport.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();setAnimate(false);setCamera(c=>zoomCamera(c,{x:e.clientX-r.left,y:e.clientY-r.top},c.zoom*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.004)));};el.addEventListener('wheel',wheel,{passive:false});return()=>{el.removeEventListener('wheel',wheel);if(timer.current)clearTimeout(timer.current);};},[]);
 function smooth(){setAnimate(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setAnimate(false),650);}
 function fit(){const el=viewport.current;if(el){smooth();setCamera(fitCamera(withBoardBounds(points,boards),el.clientWidth,el.clientHeight));}}
 function zoom(factor:number){const el=viewport.current;if(el){smooth();setCamera(c=>zoomCamera(c,{x:el.clientWidth/2,y:el.clientHeight/2},c.zoom*factor));}}
 function begin(e:PointerEvent<HTMLDivElement>){if(e.button!==0&&e.button!==1)return;if((e.target as HTMLElement).closest('[data-controls]'))return;const card=(e.target as HTMLElement).closest<HTMLElement>('[data-card],[data-board]');const id=tool==='select'&&e.button===0?(card?.dataset.card??card?.dataset.board)??null:null;const c=cameraRef.current;const origin=id?(pointsRef.current[id]??boardsRef.current.find(b=>b.id===id)):{x:c.x,y:c.y};if(!origin)return;setAnimate(false);drag.current={id,start:{x:e.clientX,y:e.clientY},origin,zoom:c.zoom,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e:PointerEvent<HTMLDivElement>){const d=drag.current;if(!d)return;const dx=e.clientX-d.start.x,dy=e.clientY-d.start.y;if(Math.hypot(dx,dy)<3&&!d.moved)return;d.moved=true;if(d.id&&boardsRef.current.some(b=>b.id===d.id))setBoards(rows=>rows.map(b=>b.id===d.id?{...b,x:d.origin.x+dx/d.zoom,y:d.origin.y+dy/d.zoom}:b));else if(d.id)setPoints(p=>({...p,[d.id!]:{x:d.origin.x+dx/d.zoom,y:d.origin.y+dy/d.zoom}}));else setCamera(c=>({...c,x:d.origin.x+dx,y:d.origin.y+dy}));}
 function end(){const d=drag.current;if(d&&!d.moved&&d.id&&!boardsRef.current.some(b=>b.id===d.id)){openSlide(d.id);}drag.current=null;}
 function focusBoard(board:{id:string;x:number;y:number}){const el=viewport.current;if(!el)return;smooth();setCamera(fitCamera(withBoardBounds({},[board]),el.clientWidth,el.clientHeight));}
 function addBoard(kind:BoardKind,options?:GenerationOptions){const existing=boards.find(b=>b.kind===kind);if(existing){if(options)setBoards(rows=>rows.map(b=>b.id===existing.id?{...b,options}:b));focusBoard(existing);return;}const board={id:`analysis-board-${kind}`,kind,options,x:-BOARD_WIDTH-100,y:boards.length?Math.max(...boards.map(b=>b.y+b.height))+60:0,width:BOARD_WIDTH,height:BOARD_HEIGHT};setBoards(rows=>[...rows,board]);focusBoard(board);}
 return <section className={s.shell} style={initialBoards?{height:'100%',minHeight:0}:undefined} aria-label="자유 배치 질문 캔버스">
  {chat&&<CanvasDemoChat at={chat} onClose={()=>setChat(null)} onCreate={createDemoScope}/>}
  {configure&&<GenerationSettings title={boardTitles[configure]} initial={boards.find(b=>b.kind===configure)?.options} onCancel={()=>setConfigure(null)} onGenerate={options=>{addBoard(configure,options);setConfigure(null);}}/>}
  {boards.filter(b=>b.id===fullBoard).map(board=><AnalysisBoardFullscreen key={board.id} title={board.scopeName?`${board.scopeName} 분석`:boardTitles[board.kind]} onClose={()=>setFullBoard(null)}><AnalysisBoard reviewScope={reviewScope} sections={board.options?.sections} kind={board.kind} session={analysisScopes.find(a=>a.name===board.scopeName)?.session??session} groups={analysisScopes.find(a=>a.name===board.scopeName)?.groups??condensed.groups} sectors={board.scopeName?Object.fromEntries((analysisScopes.find(a=>a.name===board.scopeName)?.session.slides??[]).map(slide=>[slide.id,sectors[slide.id]??[]])):sectors} status={condensed.status} onPage={id=>{setFullBoard(null);openSlide(id);}}/></AnalysisBoardFullscreen>)}
  {expanded&&<FullscreenSlide groupQuestions={condensed.groupsFor} groupingReady={condensed.ready(session.slides.findIndex(slide=>slide.id===expanded))} detailsLabel={detailsLabel} sectors={sectors[expanded]??[]} setFilter={setFilter} origin={origin} onComplete={completePin} busy={busy} error={error} session={session} id={expanded} filter={filter} onClose={()=>setExpanded(null)} onQuestions={()=>{setExpanded(null);onOpen(expanded);}}/>}
  <div className={s.tools} style={toolsBar.style} data-controls><button aria-label="분류 도구 이동" {...toolsBar.handle}>⠿</button>{allowBoards&&<><button onClick={()=>setConfigure('dashboard')}>대시보드 생성</button><button onClick={()=>addBoard('topics')}>주제 분석 생성</button><button onClick={()=>setConfigure('report')}>결과 요약 생성</button></>}{(allowBoards||initialBoards)&&<button onClick={()=>setChat({x:window.innerWidth-400,y:window.innerHeight-400})}>✳ AI 채팅 · 예시</button>}<span className={s.brand}>✳</span><div><strong>Question canvas</strong><small>{session.slides.length} SLIDES · {session.questions.length} PINS</small></div><div className={s.separator}/>{([['original','페이지'],['status','처리 상태'],['type','질문 유형']] as const).map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>arrange(key)}>{label}</button>)}{contentMode&&<button aria-pressed={mode==='content'} onClick={()=>arrange('content')}>내용 범주</button>}<select aria-label="정렬" value={sort} onChange={e=>arrange(mode,e.target.value)}><option value="page">원래 순서</option><option value="count">질문 많은 순</option><option value="oldest">오래 기다린 순</option></select><button onClick={()=>arrange()}>재배치{newCount?` +${newCount}`:''}</button></div>
  <div ref={viewport} role="region" aria-label="슬라이드 캔버스. 방향키로 이동, 더하기와 빼기로 확대 축소, 0으로 전체 보기" tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const delta:Record<string,CanvasPoint>={ArrowLeft:{x:100,y:0},ArrowRight:{x:-100,y:0},ArrowUp:{x:0,y:100},ArrowDown:{x:0,y:-100}};if(delta[e.key]){e.preventDefault();setAnimate(false);setCamera(c=>({...c,x:c.x+delta[e.key].x,y:c.y+delta[e.key].y}));}else if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else zoom(e.key==='-'?.8:1.25);}}} className={`${s.viewport} ${tool==='hand'?s.hand:''}`} style={{backgroundPosition:`${camera.x}px ${camera.y}px`,backgroundSize:`${24*camera.zoom}px ${24*camera.zoom}px`}} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;}}>
   <div className={`${s.world} ${animate?s.motion:''}`} style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`}}>
    {boards.map(board=><article key={board.id} data-board={board.id} data-tail={bubbleTail(board,frames.find(f=>f.name===board.scopeName))} className={`${s.analysisBoard} ${board.scopeName?s.summaryBubble:''}`} style={{transform:`translate(${board.x}px,${board.y}px)`,width:board.width,height:board.height}}><header tabIndex={0} aria-label={`${boardTitles[board.kind]} 이동 핸들`} onKeyDown={e=>{const moves:Record<string,[number,number]>={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-30],ArrowDown:[0,30]};const delta=moves[e.key];if(delta){e.preventDefault();e.stopPropagation();setBoards(rows=>rows.map(b=>b.id===board.id?{...b,x:b.x+delta[0],y:b.y+delta[1]}:b));}}}><strong>✳ {board.scopeName?'AI 요약':boardTitles[board.kind]}</strong><span data-controls>{!initialBoards&&board.kind!=='topics'&&<button onClick={()=>setConfigure(board.kind)}>항목 변경</button>}<button aria-label={`${board.scopeName??boardTitles[board.kind]} 확대`} onClick={()=>setFullBoard(board.id)}>{board.scopeName?'자세히 보기 →':'전체화면'}</button>{!initialBoards&&<button aria-label={`${boardTitles[board.kind]} 제거`} onClick={()=>setBoards(rows=>rows.filter(b=>b.id!==board.id))}>×</button>}</span></header><div className={s.boardPreview} data-controls onClickCapture={e=>{if(board.scopeName)return;e.preventDefault();e.stopPropagation();setFullBoard(board.id);}}>{board.scopeName?<div className={s.summaryCopy}><small>{board.scopeName} · 질문·분석 결과 기반</small><ScopeSummary material={sourceSession} name={board.scopeName} session={analysisScopes.find(a=>a.name===board.scopeName)?.session??session} groups={analysisScopes.find(a=>a.name===board.scopeName)?.groups??condensed.groups}/></div>:<AnalysisBoard reviewScope={reviewScope} sections={board.options?.sections} kind={board.kind} session={analysisScopes.find(a=>a.name===board.scopeName)?.session??session} groups={analysisScopes.find(a=>a.name===board.scopeName)?.groups??condensed.groups} sectors={board.scopeName?Object.fromEntries((analysisScopes.find(a=>a.name===board.scopeName)?.session.slides??[]).map(slide=>[slide.id,sectors[slide.id]??[]])):sectors} status={condensed.status} onPage={openSlide}/>}</div><button data-controls className={s.boardResize} aria-label={`${boardTitles[board.kind]} 크기 조절`} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();setBoards(rows=>rows.map(b=>b.id===board.id?{...b,width:Math.max(420,b.width+(e.key==='ArrowRight'?30:e.key==='ArrowLeft'?-30:0)),height:Math.max(360,b.height+(e.key==='ArrowDown'?30:e.key==='ArrowUp'?-30:0))}:b));}} onPointerDown={e=>{e.stopPropagation();setAnimate(false);resize.current={id:board.id,x:e.clientX,y:e.clientY,width:board.width,height:board.height,zoom:camera.zoom};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const r=resize.current;if(!r||r.id!==board.id)return;e.stopPropagation();setBoards(rows=>rows.map(b=>b.id===r.id?{...b,width:Math.max(420,r.width+(e.clientX-r.x)/r.zoom),height:Math.max(360,r.height+(e.clientY-r.y)/r.zoom)}:b));}} onPointerUp={()=>{resize.current=null;}} onPointerCancel={()=>{resize.current=null;}}>◢</button></article>)}
    {frames.map((f,i)=><div key={f.name} className={s.frame} style={{left:f.x,top:f.y,width:f.width,height:f.height,'--group-tone':['#8279e5','#52a59a','#c19558','#7997c2'][i%4]} as React.CSSProperties}><span>{String(i+1).padStart(2,'0')} / {f.name}</span></div>)}
    {layout.map(row=>{const slide=session.slides.find(s=>s.id===(row.slideId??row.id));if(!slide)return null;const index=session.slides.indexOf(slide);const p=points[row.id];if(!p)return null;const qs=session.questions.filter(q=>q.slideIndex===index&&(!row.questionIds||row.questionIds.includes(q.id)));const matched=qs.filter(q=>filter==='all'||mapType(q)===filter);const busiest=maxQuestions>0&&matched.length===maxQuestions;return <div key={row.id} data-card={row.id} data-busiest={busiest} data-report-selected={readOnly&&selectedSlideId===slide.id} className={`${s.slide} ${focused===slide.id?s.selected:''}`} style={{transform:`translate(${p.x}px,${p.y}px)`}} ><div className={s.slideLabel}><b>{String(index+1).padStart(2,'0')}</b><span>SLIDE {index+1}{busiest?' · 최다 질문':''}</span><em>{matched.filter(q=>q.status==='unanswered').length} 미처리</em></div><div className={s.image}>{slide.imageUrl?<img src={slide.imageUrl} alt={`${index+1}페이지`} draggable={false}/>:<span>이미지 없음</span>}{qs.filter(hasPoint).map(q=><span key={q.id} className={`${s.thumbnailPin} ${q.status==='unanswered'?s.pendingPin:''}`} style={{left:`${q.x!*100}%`,top:`${q.y!*100}%`,opacity:filter==='all'||mapType(q)===filter?1:.15}}><img src={(q.status==='unanswered'?unselectedPinIcon:selectedPinIcon).src} alt=""/><b>{questionMarkerEmoji(q.marker)}</b></span>)}{showCountPins&&<span className={s.questionCountPin} role="img" aria-label={`${index+1}페이지 · ${filter==='all'?'전체 질문':typeNames[filter]??'선택한 유형'} ${matched.length}개`} title={`페이지 질문 ${matched.length}개`}><svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 1C15 1 2 14 2 31c0 20 30 48 30 48s30-28 30-48C62 14 49 1 32 1Z"/></svg><strong>{matched.length}</strong></span>}{showCountPins&&<span className={`${s.questionCountPin} ${s.groupCountPin}`} role="img" aria-label={`묶음 ${condensed.groupsFor(matched).length}개${condensed.ready(index)?'':' · 의미 유사도 계산 중'}`} title={condensed.ready(index)?'파란 핀: 문구·영역 규칙 + 의미 유사도로 묶은 수':'파란 핀: 규칙 묶음 수 · 의미 유사도는 계산 중'}><svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 1C15 1 2 14 2 31c0 20 30 48 30 48s30-28 30-48C62 14 49 1 32 1Z"/></svg><strong>{condensed.groupsFor(matched).length}</strong></span>}</div><div className={s.slideFooter} data-controls><small>미답변 {qs.filter(q=>q.status==='unanswered').length}</small><button onClick={()=>{openSlide(slide.id);}} aria-label={`${index+1}페이지 ${readOnly?'근거 보기':'전체화면'}`}>{readOnly?'근거 보기':'전체화면'}</button></div></div>;})}
   </div>
  </div>
  <aside className={s.leftTools} aria-label="캔버스 도구"><button aria-label="선택 및 슬라이드 이동" aria-pressed={tool==='select'} onClick={()=>setTool('select')}>↖</button><button aria-label="캔버스 이동" aria-pressed={tool==='hand'} onClick={()=>setTool('hand')}>✥</button></aside>
  <div className={s.bottom}><span className={s.hint}>드래그로 배치 · 빈 곳은 이동 · 휠로 확대 · {readOnly?'클릭하면 질문 근거':'클릭하면 전체화면'}</span><div className={s.zoom}><button aria-label="축소" onClick={()=>zoom(.8)}>−</button><span>{Math.round(camera.zoom*100)}%</span><button aria-label="확대" onClick={()=>zoom(1.25)}>+</button><button onClick={fit}>전체 보기</button></div></div>
  <div className={s.filter} style={filterBar.style}><button aria-label="핀 필터 이동" {...filterBar.handle}>⠿</button><small role="status">{condensed.status}</small><button type="button" aria-pressed={showCountPins} onClick={()=>setShowCountPins(value=>!value)}>큰 숫자 핀 {showCountPins?'ON':'OFF'}</button>{allowSimulation&&<button aria-pressed={simulation} onClick={()=>setSimulation(!simulation)}>50명 시뮬레이션 {simulation?'ON':'OFF'}</button>}{simulation&&<span>가상 150핀 추가 · 1인 3개 · DB 저장 없음</span>}<span>빨강: 전체 · 파랑: 묶은 후</span><span>PIN FILTER</span><select aria-label="캔버스 핀 유형" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">모든 질문</option>{Object.entries(typeNames).filter(([k])=>!['none','mixed'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><small>자유 배치는 이 화면에서만 유지 · 발표 순서는 그대로</small></div>
 </section>;
}
