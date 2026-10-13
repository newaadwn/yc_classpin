'use client';
import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import type {ClassSession,Question} from '@/app/_model/types';
import type {Sector} from '@/app/_model/question-map';
import {SlideCanvas} from '@/app/component/slide-canvas';
import {contentBuckets} from './content-topics';
import {useDemoLive} from './live-controller';
import {useCondensedQuestions} from '../question-map/use-condensed-questions';
import s from './content-dashboard.module.css';

/** 어느 그래프를 눌렀는지: 내용 범주, 보여 줄 페이지, (영역 막대면) 영역 이름, 선택한 질문. */
type View={bucket:number;page:number;region?:string;questionId?:string};
/** 집계 단위. `all`은 원문 1건, `groups`는 지도의 파란 핀과 같은 축약 묶음 1개(대표 질문의 핀 위치로 분류). */
type Basis='all'|'groups';
/** 범주 색은 고정 순서(파랑·주황·청록·노랑), 기타는 회색. 어두운 배경용으로 검증한 값이며 순위에 따라 바뀌지 않는다. */
const SERIES=['var(--series-1)','var(--series-2)','var(--series-3)','var(--series-4)','var(--series-other)'];
const pct=(n:number,total:number)=>total?n/total*100:0;
const uniquePages=(questions:Question[])=>[...new Set(questions.map(q=>q.slideIndex))].sort((a,b)=>a-b);
/** 질문이 가장 많은 페이지. 같으면 앞 페이지. */
function topPage(questions:Question[]){const count=new Map<number,number>();for(const q of questions)count.set(q.slideIndex,(count.get(q.slideIndex)??0)+1);return [...count].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0]??0;}
const polar=(r:number,deg:number)=>{const a=(deg-90)*Math.PI/180;return [120+r*Math.cos(a),120+r*Math.sin(a)] as const;};
/** 도넛 조각(바깥 반지름 100, 안쪽 62). 조각 사이 1.2° 틈으로 경계를 나눈다. */
function slicePath(start:number,end:number){
 const gap=Math.min(1.2,(end-start)/4),a0=start+gap,a1=end-gap,large=a1-a0>180?1:0;
 const [ox0,oy0]=polar(100,a0),[ox1,oy1]=polar(100,a1),[ix0,iy0]=polar(62,a0),[ix1,iy1]=polar(62,a1);
 return `M${ox0} ${oy0}A100 100 0 ${large} 1 ${ox1} ${oy1}L${ix1} ${iy1}A62 62 0 ${large} 0 ${ix0} ${iy0}Z`;
}
const activate=(fn:()=>void)=>(e:KeyboardEvent<SVGElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};

export function ContentDashboard({session,sectors,onClose,arrive,sourceQuestions=false}:{session:ClassSession;sectors:Record<string,Sector[]>;onClose:()=>void;arrive:()=>void;sourceQuestions?:boolean}){
 const live=useDemoLive(session.id,session.slides.length),dialog=useRef<HTMLDialogElement>(null);
 const [includeDemo,setIncludeDemo]=useState(true),[view,setView]=useState<View|null>(null),[basis,setBasis]=useState<Basis>('all');
 const [url]=useState(()=>typeof window==='undefined'?'':`${window.location.origin}/admin/session/${session.id}/qa-studio/student`);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const el=dialog.current;el?.showModal();return()=>{el?.close();previous?.focus();};},[]);
 const questions=[...(includeDemo?session.questions:[]),...live.questions];
 const condensed=useCondensedQuestions({...session,questions},{sectors});
 // 묶음 기준이면 묶음마다 대표 질문 1건만 집계에 넣고, 원문들은 members로 따라간다 (핀·미처리 판정·목록 표시용).
 const byGroups=basis==='groups';
 const units=byGroups?condensed.groups.map(g=>g.representative):questions;
 const members=new Map<string,Question[]>(byGroups?condensed.groups.map(g=>[g.representative.id,g.questions] as const):questions.map(q=>[q.id,[q]] as const));
 const membersOf=(q:Question)=>members.get(q.id)??[q];
 const expand=(rows:Question[])=>rows.flatMap(membersOf);
 const isPending=(q:Question)=>membersOf(q).some(m=>m.status==='unanswered');
 const unitId=(id:string)=>byGroups?condensed.groupOf(id)?.representative.id??id:id;
 const count=(n:number)=>byGroups?`${n}묶음`:`${n}건`;
 const unitName=byGroups?'묶음':'질문';
 const chooseBasis=(next:Basis)=>{setBasis(next);setView(null);};
 const buckets=contentBuckets(session,units,sectors);
 const total=units.length,pending=units.filter(isPending).length;
 const topicMax=Math.max(1,...buckets.map(b=>b.questions.length));
 const detailMax=Math.max(1,...buckets.flatMap(b=>[...b.details.values()].map(q=>q.length)));
 let angle=0;const slices=buckets.map((b,i)=>{const start=angle;angle+=pct(b.questions.length,total)*3.6;return {bucket:b,index:i,start,end:angle};}).filter(x=>x.end>x.start);
 const nonEmpty=buckets.filter(b=>b.questions.length).length;

 // 그래프를 누르면 그 범주에서 질문이 가장 많은 페이지로, 영역 막대는 그 영역이 있는 페이지로 바로 간다.
 const openBucket=(index:number)=>{const b=buckets[index];if(!b.questions.length)return;setView({bucket:index,page:topPage(b.questions)});};
 const openRegion=(index:number,region:string)=>{const rows=buckets[index].details.get(region)??[];if(!rows.length)return;setView({bucket:index,page:topPage(rows),region});};

 const bucket=view?buckets[view.bucket]:null;
 const pages=bucket?uniquePages(bucket.questions):[];
 const pageAt=view?pages.indexOf(view.page):-1;
 const slide=view?session.slides[view.page]:undefined;
 const pageQuestions=view?questions.filter(q=>q.slideIndex===view.page):[];
 const pageUnits=view?units.filter(q=>q.slideIndex===view.page):[];
 const regionRows=view?.region?(bucket?.details.get(view.region)??[]).filter(q=>q.slideIndex===view.page):[];
 const listed=view?.region?regionRows:pageUnits.filter(q=>bucket?.questions.includes(q));
 const sector=view?.region&&slide?sectors[slide.id]?.find(r=>r.name===view.region):undefined;
 const selected=view?.questionId?pageUnits.find(q=>q.id===view.questionId):undefined;
 const selectedMembers=selected?membersOf(selected):[];
 const emphasized=view?.region?expand(regionRows).map(q=>q.id):selectedMembers.length>1?selectedMembers.map(q=>q.id):undefined;
 const goPage=(page:number)=>setView(v=>v&&{bucket:v.bucket,page});

 return <dialog ref={dialog} className={s.root} aria-label="내용별 실시간 질문 대시보드" onCancel={e=>{if(view){e.preventDefault();setView(null);}else onClose();}}>
  <header className={s.top}><div><small>LOCAL DEMO · 내용별 실시간 질문</small><h1>QUESTION TIME</h1><p>수동 주제 분류 · 같은 브라우저 탭 사이 실시간 연결 · 그래프를 누르면 해당 페이지로 이동</p></div><button className={s.close} onClick={onClose}>닫기 · Esc</button></header>
  <nav className={s.toolbar}><label><input type="checkbox" checked={includeDemo} onChange={e=>setIncludeDemo(e.target.checked)}/>{sourceQuestions?'SOI 원문 질문 포함':'가상 청중 질문 포함'}</label>{!sourceQuestions&&<button onClick={arrive}>가상 질문 10개 유입</button>}
   <div className={s.basis} role="group" aria-label="그래프 집계 기준"><button type="button" aria-pressed={!byGroups} onClick={()=>chooseBasis('all')}>전체 질문</button><button type="button" aria-pressed={byGroups} onClick={()=>chooseBasis('groups')}>묶음 · 파란 핀</button></div>
   <span>{byGroups?`묶음 ${condensed.groups.length}개 · 대표 질문의 핀 위치로 분류 · ${condensed.status}`:'원본 질문 수 기준 · 분류 불명확한 핀은 기타로 유지'}</span></nav>
  {live.error&&<p className={s.error} role="alert">{live.error}</p>}
  <div className={s.layout}><section className={s.cards}>
   <article><h2>내용 범주별 질문 비율</h2><p>도넛 조각이나 범례를 누르면 그 범주의 페이지로 갑니다.</p>
    <div className={s.donutWrap}>
     <svg className={s.donut} viewBox="0 0 240 240" role="img" aria-label={total?buckets.map(b=>`${b.name} ${count(b.questions.length)} ${pct(b.questions.length,total).toFixed(1)}%`).join(', '):'질문 없음'}>
      {!total&&<circle cx="120" cy="120" r="81" fill="none" stroke="var(--surface-2)" strokeWidth="38"/>}
      {nonEmpty===1&&slices.map(x=><circle key={x.index} cx="120" cy="120" r="81" fill="none" stroke={SERIES[x.index]} strokeWidth="38" role="button" tabIndex={0} aria-label={`${x.bucket.name} 100% · 페이지로 이동`} onClick={()=>openBucket(x.index)} onKeyDown={activate(()=>openBucket(x.index))}><title>{`${x.bucket.name} · ${count(x.bucket.questions.length)}`}</title></circle>)}
      {nonEmpty>1&&slices.map(x=><path key={x.index} className={s.slice} d={slicePath(x.start,x.end)} fill={SERIES[x.index]} role="button" tabIndex={0} aria-label={`${x.bucket.name} ${count(x.bucket.questions.length)} ${pct(x.bucket.questions.length,total).toFixed(1)}% · 페이지로 이동`} onClick={()=>openBucket(x.index)} onKeyDown={activate(()=>openBucket(x.index))}><title>{`${x.bucket.name} · ${count(x.bucket.questions.length)} · ${pct(x.bucket.questions.length,total).toFixed(1)}%`}</title></path>)}
      {nonEmpty>1&&slices.filter(x=>x.end-x.start>=25).map(x=>{const [lx,ly]=polar(81,(x.start+x.end)/2);return <text key={x.index} x={lx} y={ly} className={s.sliceLabel}>{Math.round(pct(x.bucket.questions.length,total))}%</text>;})}
      <text x="120" y="112" className={s.center}>{total}</text><text x="120" y="136" className={s.centerLabel}>{byGroups?'질문 묶음':'전체 질문'}</text>
     </svg>
     <ul className={s.legend}>{buckets.map((b,i)=><li key={b.name}><button type="button" disabled={!b.questions.length} onClick={()=>openBucket(i)} aria-label={`${b.name} ${count(b.questions.length)} · 페이지로 이동`}><i style={{background:SERIES[i]}}/><span>{b.name}</span><b>{count(b.questions.length)}</b><small>{pct(b.questions.length,total).toFixed(1)}%</small></button></li>)}</ul>
    </div>
   </article>
   <article><h2>내용 범주별 질문 수</h2><p>{byGroups?'묶음 수':'원본 질문 수'} · 공통 척도 · 막대를 누르면 그 범주의 페이지로 갑니다.</p>
    <div className={s.bars}>{buckets.map((b,i)=><button type="button" key={b.name} className={s.bar} disabled={!b.questions.length} title={`${b.name} · ${count(b.questions.length)} · 페이지 ${uniquePages(b.questions).map(p=>p+1).join(', ')||'없음'}`} aria-label={`${b.name} ${count(b.questions.length)} · 페이지로 이동`} onClick={()=>openBucket(i)}><span className={s.label}>{b.name}</span><span className={s.track}><em style={{width:`${b.questions.length/topicMax*100}%`,background:SERIES[i]}}/></span><b className={s.value}>{b.questions.length}<small>{byGroups?'묶음':'건'}</small></b></button>)}</div>
   </article>
   {buckets.map((b,i)=><article key={b.name} className={s.bucket} style={{'--bucket':SERIES[i]} as CSSProperties}>
    <h2><span><i aria-hidden="true"/>{b.name}</span><b>{b.questions.length}<small>{byGroups?'묶음':'건'}</small></b></h2>
    <p>미처리 {count(b.questions.filter(isPending).length)}{b.questions.length?` · 페이지 ${uniquePages(b.questions).map(p=>p+1).join(', ')}`:''}</p>
    {!b.details.size&&<p className={s.empty}>아직 질문이 없습니다.</p>}
    <div className={s.bars}>{[...b.details].map(([name,rows])=>{const page=topPage(rows);return <button type="button" key={name} className={s.bar} title={`${name} · ${count(rows.length)} · ${page+1}페이지로 이동`} aria-label={`${name} ${unitName} ${rows.length}개 보기 · ${page+1}페이지로 이동`} onClick={()=>openRegion(i,name)}><span className={s.label}><small className={s.page}>{page+1}p</small>{name}</span><span className={s.track}><em style={{width:`${rows.length/detailMax*100}%`}}/></span><b className={s.value}>{rows.length}</b></button>;})}</div>
   </article>)}
  </section>
  <aside className={s.summary}><h2>질문 참여</h2>{url&&<div className={s.qr}><QRCodeSVG value={url} size={168} bgColor="#ffffff" fgColor="#0a0b0e"/></div>}<a href={url||undefined} target="_blank" rel="noreferrer">학생 데모 창 열기 ↗</a><p>로컬 데모 QR · 휴대폰 참여용 아님<br/>같은 PC·브라우저·주소의 탭끼리만 연결됩니다.</p><strong>{total}</strong><span>{byGroups?'질문 묶음':'전체 질문'}</span><p title={condensed.status}>{byGroups?`원본 ${questions.length}건`:`묶음 후 ${condensed.groups.length}건`} · 미처리 {pending} · 미분류 {buckets[4].questions.length}</p><p>학생 데모 {live.questions.length}건 / {sourceQuestions?'신규 입력':`가상 데이터 ${includeDemo?session.questions.length:0}건`}</p></aside></div>

  {view&&bucket&&slide&&<section className={s.detail} role="region" aria-label={`${view.page+1}페이지 보기`}>
   <header className={s.detailHead}>
    <div><small><i style={{background:SERIES[view.bucket]}} aria-hidden="true"/>{bucket.name}{view.region?` · ${view.region}`:''}</small><h2>{view.page+1}페이지<span>{view.region?`이 영역 ${count(regionRows.length)}`:`이 범주 ${count(listed.length)}`} · 페이지 전체 {count(pageUnits.length)}{byGroups?` · 원문 ${pageQuestions.length}건`:''}</span></h2></div>
    <div className={s.pager} aria-label={`${bucket.name} 범주의 페이지 이동`}><button type="button" disabled={pageAt<=0} onClick={()=>goPage(pages[pageAt-1])} aria-label="이 범주의 이전 페이지">‹</button><span>{pageAt+1} / {pages.length}</span><button type="button" disabled={pageAt<0||pageAt>=pages.length-1} onClick={()=>goPage(pages[pageAt+1])} aria-label="이 범주의 다음 페이지">›</button></div>
    <button type="button" className={s.sync} disabled={!live.ready} title="같은 브라우저의 강사 슬라이드쇼·학생 데모 창 페이지를 바꿉니다" onClick={()=>live.send({kind:'page',id:crypto.randomUUID(),at:Date.now(),page:view.page})}>발표 창을 이 페이지로</button>
    <button type="button" className={s.close} onClick={()=>setView(null)}>그래프로 돌아가기 · Esc</button>
   </header>
   <div className={s.drill}>
    <div className={s.stage}><SlideCanvas slide={slide} questions={pageQuestions} selectedId={selected?.id} emphasizedQuestionIds={emphasized} onSelectPin={id=>setView(v=>v&&{...v,questionId:unitId(id)})} statusColoredPins>{sector&&<span className={s.sector} style={{left:`${sector.x*100}%`,top:`${sector.y*100}%`,width:`${sector.w*100}%`,height:`${sector.h*100}%`}} aria-hidden="true"><b>{sector.name}</b></span>}</SlideCanvas>
     {selected?<div className={s.selectedText}><small>{isPending(selected)?'미처리':'답변 처리됨'}{selectedMembers.length>1?` · 같은 뜻 원문 ${selectedMembers.length}건 묶음 (대표 질문 표시)`:''}</small>{selected.text}{selectedMembers.length>1&&<ul className={s.members} aria-label="묶음의 다른 원문">{selectedMembers.filter(m=>m.id!==selected.id).map(m=><li key={m.id}><small>{m.status==='unanswered'?'미처리':'답변 처리됨'}</small>{m.text}</li>)}</ul>}</div>:<p className={s.hint}>핀을 누르면 질문 원문이 여기에 보입니다.</p>}</div>
    <div className={s.list}>{listed.length?listed.map(q=>{const n=membersOf(q).length;return <button type="button" key={q.id} onClick={()=>setView(v=>v&&{...v,questionId:q.id})} aria-pressed={selected?.id===q.id}><small>{q.slideIndex+1}페이지 · {isPending(q)?'미처리':'답변 처리됨'}{n>1?` · 같은 뜻 ${n}건`:''}</small><p>{q.text}</p></button>;}):<p className={s.empty}>이 페이지에는 해당 질문이 없습니다.</p>}</div>
   </div>
  </section>}
 </dialog>;
}
