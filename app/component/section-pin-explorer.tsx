'use client';
import {useEffect,useMemo,useRef,useState,type ComponentProps,type CSSProperties} from 'react';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import type {ReactNode} from 'react';
import {QuestionPriorityList} from './question-priority-list';
import {SlideCanvas} from './slide-canvas';
import {useSectionPinExplorer} from '@/app/_controller/use-section-pin-explorer';
import {clampToSection,isPoint,placeClusterMarkers,shortCount,type PinFilter} from '@/app/_model/section-pin-explorer';
import {QUESTION_TYPE_LABELS} from '@/app/_model/section-questions';
import type {ClassSession,Question} from '@/app/_model/types';
import styles from './section-pin-explorer.module.css';

type Props={unified?:boolean;session:ClassSession;canvas:ComponentProps<typeof SlideCanvas>;onClose:()=>void;detailTarget?:HTMLElement|null;toolbarTarget?:HTMLElement|null};
function DetailSlot({target,children}:{target?:HTMLElement|null;children:ReactNode}){return target?createPortal(<div className={styles.externalPanel}>{children}</div>,target):children;}
const typeName=(type:string|null)=>type?QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS]??'의도 확인 필요':'의도 확인 필요';
function ControlSlot({target,children}:{target?:HTMLElement|null;children:ReactNode}){return target?createPortal(<div className={styles.integratedControls}>{children}</div>,target):children;}
const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR'):'시간 정보 없음';
const categoryColor=(type:string|null)=>({concept:'var(--color-question-pin-concept)',clarification:'var(--color-question-pin-clarification)',why:'var(--color-question-pin-why)',application:'var(--color-question-pin-application)',comparison:'var(--color-question-pin-comparison)',deep_dive:'var(--color-question-pin-deep-dive)',logistics:'var(--color-question-pin-logistics)'}[type??'']??'var(--pin-neutral-400)');
const tint=(color:string):CSSProperties=>({'--section-color':color} as CSSProperties);

/** A shared instructor-only drill-down, with overlays in the actual SlideCanvas coordinate space. */
export function SectionPinExplorer({session,canvas,onClose,detailTarget,toolbarTarget,unified=false}:Props) {
  const visible=useMemo(()=>{
    const allowed=canvas.visibleQuestionIds?new Set(canvas.visibleQuestionIds):null;
    return (canvas.questions??session.questions).filter(q=>q.sessionId===session.id&&q.slideIndex===canvas.slide.pageIndex&&(!allowed||allowed.has(q.id)));
  },[canvas.questions,canvas.visibleQuestionIds,canvas.slide.pageIndex,session.id,session.questions]);
  const vm=useSectionPinExplorer(session,canvas.slide.id,visible);
  const stage=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),root=useRef<HTMLDivElement>(null);
  const [burst,setBurst]=useState<{x:number;y:number}|null>(null);
  const bubbleRef=useRef<HTMLDivElement>(null);
  const [bubbleSize,setBubbleSize]=useState({width:320,height:100});
  useEffect(()=>{const el=bubbleRef.current;if(!el)return;const observer=new ResizeObserver(()=>setBubbleSize({width:el.offsetWidth,height:el.offsetHeight}));observer.observe(el);return()=>observer.disconnect();},[vm.cluster?.id]);
  const [hover,setHover]=useState<{label:string;color:string;x:number;y:number}|null>(null);
  const showCategory=(element:HTMLElement,type:string|null)=>{const rect=element.getBoundingClientRect();setHover({label:typeName(type),color:categoryColor(type),x:Math.max(90,Math.min(window.innerWidth-90,rect.x+rect.width/2)),y:rect.top<54?rect.bottom+8:rect.top-42});};
  const [sidebarPercent,setSidebarPercent]=useState(28);
  const resizePointer=useRef<number|null>(null);
  const resizeSidebar=(clientX:number)=>{const rect=root.current?.getBoundingClientRect();if(rect)setSidebarPercent(Math.max(22,Math.min(55,(rect.right-clientX)/rect.width*100)));};
  const [panelOpen,setPanelOpen]=useState(true);
  useEffect(()=>{
    const key=`classpin-priority-target:${session.id}`;
    try{const target=JSON.parse(sessionStorage.getItem(key)??'null');if(target?.pageId!==canvas.slide.id)return;
      if(vm.rows.some(row=>row.clusters.some(c=>c.questions.some(q=>q.original.id===target.questionId)))){sessionStorage.removeItem(key);vm.selectRaw(target.questionId);setPanelOpen(true);}
    }catch{sessionStorage.removeItem(key);}
  },[session.id,canvas.slide.id,vm.rows,vm.selectRaw]);
  const [size,setSize]=useState({width:1000,height:563});
  useEffect(()=>{const element=stage.current?.querySelector('.slide-canvas');if(!element)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(element);return()=>observer.disconnect();},[]);
  const markers=useMemo(()=>vm.section?.section?placeClusterMarkers(vm.section.clusters,vm.section.section,size.width,size.height):[],[vm.section,size]);
  const level=vm.cluster?'cluster_detail':vm.section?'section_detail':'section_overview';
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[level]);
  const moveSection=(id:string|null)=>{const s=vm.rows.find(r=>r.id===id)?.section;setBurst(s?clampToSection({x:s.x+s.width*.5,y:s.y+Math.min(s.height*.4,.085)},s,size.width,size.height):null);setPanelOpen(true);vm.selectSection(id);};
  const openCluster=(id:string)=>{setHover(null);const m=markers.find(m=>m.id===id);setBurst(m?{x:m.x,y:m.y}:null);setPanelOpen(true);vm.selectCluster(id);};
  const burstStyle=(x:number,y:number,index:number):CSSProperties=>burst?({'--burst-x':`${(burst.x-x)*size.width}px`,'--burst-y':`${(burst.y-y)*size.height}px`,animationDelay:`${Math.min(index,8)*22}ms`} as CSSProperties):{};
  const showRaw=(id:string)=>{setPanelOpen(true);vm.selectRaw(id);};
  const pending=vm.cluster?.questions.filter(q=>q.original.status==='unanswered').length??0;
  const located=vm.cluster?.questions.filter(q=>isPoint(q.original))??[];
  const bubblePosition=(()=>{
    const w=Math.min(bubbleSize.width,size.width-16),h=Math.min(bubbleSize.height,size.height-16);
    let best={x:8,y:8,score:Infinity};
    for(let row=0;row<=8;row++)for(let col=0;col<=8;col++){
      const x=8+Math.max(0,size.width-w-16)*col/8,y=8+Math.max(0,size.height-h-16)*row/8;
      const overlap=located.reduce((sum,{original:q})=>{const px=q.x!*size.width,py=q.y!*size.height;return sum+Math.max(0,Math.min(x+w,px+25)-Math.max(x,px-25))*Math.max(0,Math.min(y+h,py+10)-Math.max(y,py-48));},0);
      const score=overlap*1000+row+col*.01;if(score<best.score)best={x,y,score};
    }
    return best;
  })();
  const rawQuestions=vm.cluster?.questions.map(q=>q.original)??[];
  const status=(q:Question)=>q.status==='unanswered'?'미답변':q.status==='answered'?'답변됨':'설명 완료';
  return <div ref={root} className={styles.root} data-panel-open={panelOpen&&!detailTarget} data-unified={unified} data-integrated={!!toolbarTarget} data-section-explorer data-level={level} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(vm.section)vm.back();else if(unified)setPanelOpen(false);else onClose();}
    else if(['ArrowLeft','ArrowRight'].includes(e.key)&&(e.target as HTMLElement).closest('button,select,input,textarea'))e.stopPropagation();
  }}>
    {hover&&createPortal(<div role="tooltip" className={styles.categoryTooltip} style={{...tint(hover.color),left:hover.x,top:hover.y}}>{hover.label}</div>,document.body)}
    <ControlSlot target={toolbarTarget}><header className={styles.toolbar}><nav aria-label="질문 탐색 경로"><button onClick={()=>moveSection(null)} aria-current={!vm.section?'page':undefined}>페이지 {canvas.slide.pageIndex+1}</button>{vm.section&&<><span aria-hidden="true">›</span><button onClick={()=>moveSection(vm.section!.id)} aria-current={!vm.cluster?'page':undefined}>{vm.section.title}</button></>}{vm.cluster&&<><span aria-hidden="true">›</span><span aria-current="page">개별 핀 {vm.cluster.questionCount}건</span></>}</nav>{!unified&&<button onClick={onClose}>기존 핀 보기</button>}{toolbarTarget&&!detailTarget&&<button aria-expanded={panelOpen} onClick={()=>setPanelOpen(open=>!open)}>{panelOpen?'질문 창 닫기':'질문 창 열기'}</button>}</header>
    <div className={styles.filters}><label>처리 상태<select aria-label="처리 상태" value={vm.filter.status} onChange={e=>vm.setFilter(f=>({...f,status:e.target.value as PinFilter['status']}))}><option value="all">전체 상태</option><option value="open">미답변</option><option value="done">답변·완료</option></select></label><label>질문 유형<select aria-label="질문 유형" value={vm.filter.type} onChange={e=>vm.setFilter(f=>({...f,type:e.target.value as PinFilter['type']}))}><option value="all">전체 유형</option>{Object.entries(QUESTION_TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="unknown">의도 확인 필요</option></select></label><span role="status">표시 {vm.count} / {vm.total}건</span>{(vm.filter.type!=='all'||vm.filter.status!=='all')&&<button onClick={()=>vm.setFilter({status:'all',type:'all'})}>필터 초기화</button>}</div>
    </ControlSlot><div className={styles.layout} data-priority={!!detailTarget} data-external-panel={!!detailTarget} style={{"--sidebar-width":`${sidebarPercent}%`} as CSSProperties}>
      <div className={styles.stageColumn} data-has-question={!!vm.cluster}>

        <div ref={stage} className={styles.stage} onClick={event=>{if(event.button===0&&vm.section&&!(event.target as HTMLElement).closest('button,a,input,select,textarea'))vm.back();}}>
          <SlideCanvas {...canvas} questions={[]} showPins={false} onCanvasClick={undefined} pinDisplayPositions={undefined}>
            {canvas.children}
            {vm.cluster&&<div ref={bubbleRef} className={styles.representativeBubble} data-representative-question style={{...tint(vm.section!.color),left:bubblePosition.x,top:bubblePosition.y}} onClick={e=>e.stopPropagation()}><small>선택한 묶음 · {vm.cluster.questionCount}건</small><strong>{vm.cluster.representativeQuestion}</strong></div>}
            {vm.rows.filter(row=>row.section).map(row=>{
              const s=row.section;if(!s)return null;const summary=clampToSection({x:s.x+s.width*.5,y:s.y+Math.min(s.height*.4,.085)},s,size.width,size.height);
              return <div key={row.id} style={tint(row.color)} data-section-id={row.id}>
                <button className={styles.overlay} data-drilldown={!!vm.section} data-dimmed={!!vm.section&&vm.section.id!==row.id} data-selected={vm.section?.id===row.id} style={{left:`${s.x*100}%`,top:`${s.y*100}%`,width:`${s.width*100}%`,height:`${s.height*100}%`,borderStyle:row.pattern as CSSProperties['borderStyle']}} onClick={()=>moveSection(row.id)} aria-label={`${row.title} 섹션 선택 · ${row.count}건`}><span>{row.number}. {row.title}</span></button>
                {!vm.section&&<button className={styles.marker} data-section-summary data-done={row.count>0&&row.open===0} style={{left:`${summary.x*100}%`,top:`${summary.y*100}%`}} aria-label={`${row.title} 요약 핀 · 질문 ${row.count}건`} title="섹션 요약 위치 · 실제 질문 좌표가 아닙니다" onClick={()=>moveSection(row.id)}>{shortCount(row.count)}{row.count>0&&row.open===0&&<small>완료</small>}</button>}
              </div>;
            })}
            {vm.section&&!vm.cluster&&<div style={tint(vm.section.color)}>
              <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{markers.filter(m=>m.displaced).map(m=><line key={m.id} x1={m.anchor.x*100} y1={m.anchor.y*100} x2={m.x*100} y2={m.y*100}/>)}</svg>
              {markers.map((m,index)=><button key={m.id} data-cluster-marker onMouseEnter={e=>showCategory(e.currentTarget,m.cluster.questionType)} onMouseLeave={()=>setHover(null)} onFocus={e=>showCategory(e.currentTarget,m.cluster.questionType)} onBlur={()=>setHover(null)} data-question-type={m.cluster.questionType??"unknown"} className={`${styles.marker} ${styles.clusterMarker} ${burst?styles.droplet:""}`} data-done={m.cluster.questions.every(q=>q.original.status!=='unanswered')} style={{...tint(categoryColor(m.cluster.questionType)),...burstStyle(m.x,m.y,index),left:`${m.x*100}%`,top:`${m.y*100}%`}} title={`${typeName(m.cluster.questionType)} · ${m.cluster.representativeQuestion}`} aria-label={`묶음 ${index+1} · ${m.cluster.questionCount}건 · ${m.cluster.representativeQuestion}`} onClick={()=>openCluster(m.id)}>{shortCount(m.cluster.questionCount)}</button>)}
            </div>}
            {vm.cluster&&<div style={tint(categoryColor(vm.cluster.questionType))}>
              <svg className={styles.lines} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">{rawQuestions.filter(isPoint).map(q=>q.anchorKind==='box'&&q.width&&q.height?<rect key={q.id} x={q.x} y={q.y} width={q.width} height={q.height}/>:q.anchorKind==='path'&&q.path?<polyline key={q.id} points={q.path.map(p=>`${p.x},${p.y}`).join(' ')}/>:null)}</svg>

              {located.map(({original:q},index)=><button key={q.id} className={`${styles.rawPin} ${styles.ghostPin}`} data-original-pin={q.id} data-raw-pin={q.id} data-selected={vm.raw?.id===q.id} style={{left:`${q.x!*100}%`,top:`${q.y!*100}%`,zIndex:vm.raw?.id===q.id?9:7}} title={q.text} aria-label={`원본 핀 ${index+1} · ${q.text}`} onClick={()=>showRaw(q.id)}><span>?</span></button>)}
            </div>}
          </SlideCanvas>
        </div>
        <p className={styles.caption}>{vm.section&&"빈 곳을 좌클릭하면 한 단계 뒤로 · "}{!vm.section?'숫자는 섹션 전체 질문 수입니다. 요약 핀은 실제 질문 위치가 아닙니다.':!vm.cluster?'숫자는 유사 질문 묶음 크기입니다. 평균 좌표를 기준으로 겹침을 피하며, 가는 선은 이동 전 위치를 가리킵니다.':`선택한 묶음의 원본 위치 ${located.length}개 · 흐린 핀은 원래 좌표 · 위치 없는 질문 ${vm.cluster.questionCount-located.length}건. 겹친 질문은 오른쪽 목록에서 선택하세요.`}</p>
      </div>
      {detailTarget&&<QuestionPriorityList session={session} pageId={canvas.slide.id} groups={vm.rows.flatMap(row=>row.clusters)} onSelect={showRaw}/>}
      {toolbarTarget&&!detailTarget&&panelOpen&&<div className={styles.resizeHandle} role="separator" aria-label="슬라이드와 질문 사이드바 너비 조절" aria-orientation="vertical" aria-valuemin={22} aria-valuemax={55} aria-valuenow={Math.round(sidebarPercent)} tabIndex={0}
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();resizePointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(resizePointer.current===e.pointerId)resizeSidebar(e.clientX);}}
        onPointerUp={e=>{if(resizePointer.current===e.pointerId){resizePointer.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}}
        onPointerCancel={()=>{resizePointer.current=null;}}
        onLostPointerCapture={()=>{resizePointer.current=null;}}
        onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();setSidebarPercent(n=>e.key==='Home'?22:e.key==='End'?55:Math.max(22,Math.min(55,n+(e.key==='ArrowLeft'?2:-2))));}}
      />}
      <DetailSlot target={detailTarget}><aside hidden={!!toolbarTarget&&!detailTarget&&!panelOpen} className={styles.panel} aria-label="페이지 섹션 질문 상세">
        {toolbarTarget&&!detailTarget&&<div className={styles.floatingHeading}><strong>섹션별 질문</strong><button aria-label="질문 창 닫기" onClick={()=>setPanelOpen(false)}>×</button></div>}
        <div className={styles.panelHeading}><div><small>{!vm.section?'LEVEL 1 · 섹션 개요':!vm.cluster?'LEVEL 2 · 질문 묶음':'LEVEL 3 · 개별 핀'}</small><h2 ref={heading} tabIndex={-1}>{vm.cluster?'선택한 질문 묶음':vm.section?.title??`페이지 ${canvas.slide.pageIndex+1} 질문 분포`}</h2></div>{vm.section&&<button aria-label="상위 단계로" onClick={vm.back}>←</button>}</div>
        <details className={styles.colorLegend} open><summary>질문 범주별 색상</summary><div className={styles.distribution}>{Object.entries(QUESTION_TYPE_LABELS).map(([type,label])=><span key={type} style={tint(categoryColor(type))}>{label}</span>)}<span style={tint(categoryColor(null))}>의도 확인 필요</span></div></details>
        <p className={styles.note}>{vm.message}</p>
        {!vm.sections.length&&<Link href={`/admin/session/${session.id}/analysis`}>자료 분석·영역 검수하기 →</Link>}
        {vm.error&&<p role="alert">{vm.error}</p>}
        {vm.undo&&<button disabled={vm.busy} className={styles.action} onClick={()=>void vm.restore()}>{vm.undo.count}건 처리 되돌리기</button>}
        {!vm.section&&<><div className={styles.metrics}><b>{vm.sections.length}<small>확정 섹션</small></b><b>{vm.count}<small>표시 질문</small></b></div><p>색과 번호는 섹션을 구분합니다. 0건인 섹션도 표시합니다.</p><div className={styles.list}>{vm.rows.map(row=><button key={row.id} style={tint(row.color)} className={styles.row} onClick={()=>moveSection(row.id)}><span className={styles.swatch}>{row.number||'–'}</span><span>{row.title}<small>{row.clusters.length}개 묶음 · 미답변 {row.open}건</small></span><b>{row.count}</b></button>)}</div>{!vm.count&&<p>현재 조건에 해당하는 질문이 없습니다.</p>}</>}
        {vm.section&&!vm.cluster&&<><div className={styles.metrics}><b>{vm.section.count}<small>질문</small></b><b>{vm.section.clusters.length}<small>묶음</small></b><b>{vm.section.open}<small>미답변</small></b></div>{vm.section.section&&<p><strong>관련 개념</strong><br/>{vm.section.section.title}</p>}<div className={styles.distribution}>{Object.entries(vm.section.types).map(([type,count])=><span key={type} style={tint(categoryColor(type))}>{typeName(type)} {count}건</span>)}</div><div className={styles.list}>{vm.section.clusters.map((c,index)=><button key={c.id} className={`${styles.row} ${styles.categoryRow}`} style={tint(categoryColor(c.questionType))} onClick={()=>openCluster(c.id)}><span className={styles.swatch}>{index+1}</span><span>{c.representativeQuestion}<small>{typeName(c.questionType)} · {c.questions.every(q=>q.original.status!=='unanswered')?'답변·완료':'미답변 포함'}</small></span><b>{c.questionCount}</b></button>)}</div>{!vm.section.count&&<p>이 섹션에는 현재 조건의 질문이 없습니다.</p>}<button className={styles.action} onClick={vm.retry}>의미 분석 다시 확인</button></>}
        {vm.cluster&&<><div className={styles.distribution}><span style={tint(categoryColor(vm.cluster.questionType))}>{typeName(vm.cluster.questionType)}</span></div><p className={styles.representative}>{vm.cluster.representativeQuestion}</p><p>{vm.cluster.questionCount}건 · {typeName(vm.cluster.questionType)} · {pending?`미답변 ${pending}건`:'모두 답변·완료'}</p><p className={styles.note}>대표 원문입니다. AI가 만든 답변이 아닙니다.</p><button className={styles.action} disabled={vm.busy||!pending} onClick={()=>void vm.complete()}>{vm.busy?'처리 중…':pending?`답변 완료 처리 · ${pending}건`:'답변 완료됨'}</button><p className={styles.note}>선택된 필터의 미답변 질문만 설명 완료 상태로 변경합니다.</p>
          <h3>원본 질문 {vm.cluster.questionCount}건</h3><div className={styles.list}>{vm.cluster.questions.map(({original:q},index)=><button key={q.id} className={styles.row} data-raw-row={q.id} aria-pressed={vm.raw?.id===q.id} onClick={()=>showRaw(q.id)}><b>{index+1}</b><span>{q.text}<small>{status(q)} · {isPoint(q)?`좌표 (${q.x.toFixed(3)}, ${q.y.toFixed(3)})`:'위치 미지정'}</small></span></button>)}</div>
          {vm.raw&&<section className={styles.rawDetail} aria-label="선택 원문 상세"><h3>선택한 원본 질문</h3><p>{vm.raw.text}</p><time dateTime={vm.raw.createdAt}>{date(vm.raw.createdAt)}</time><p>{status(vm.raw)} · {isPoint(vm.raw)?`좌표 (${vm.raw.x}, ${vm.raw.y})`:'좌표 없음'}</p><p>섹션: {vm.section!.title}<br/>연결: 현재 선택한 질문 묶음</p>{canvas.onSelectPin&&<button className={styles.action} onClick={()=>canvas.onSelectPin?.(vm.raw!.id)}>기존 원본 질문 창 열기</button>}</section>}
        </>}
      </aside></DetailSlot>
    </div>
  </div>;
}
