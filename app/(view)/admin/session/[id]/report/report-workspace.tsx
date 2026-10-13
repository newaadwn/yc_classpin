'use client';

import Link from 'next/link';
import type {ReportBundle} from '@/app/_service/report-bundle';
import {GenerationSettings,type GenerationOptions} from '@/app/component/generation-settings';
import {AnalysisBoardFullscreen} from '../question-map/analysis-board';
import {DashboardAnalysis} from '../question-map/dashboard-analysis';
import {AnalysisShellHeader} from '@/app/component/analysis-shell-header';

import {useMemo,useState} from 'react';

import type {ClassSession} from '@/app/_model/types';
import {SlideCanvas} from '@/app/component/slide-canvas';
import {useCondensedQuestions} from '../question-map/use-condensed-questions';
import {useLocalSections} from '../qa-studio/use-local-sections';
import {SpatialCanvas} from '../question-map/spatial-canvas';
import {pageBucket,type MapMode} from '@/app/_model/question-map';
import s from './page.module.css';
import {reexplainTopics} from '@/app/_model/reexplain-topics';
import {ReexplainReview} from '@/app/component/reexplain-review';

const kinds={single:'개별 질문',exact:'동일 문구',signal:'영역·의도 규칙',semantic:'의미 유사도 제안'};
const intents={confusion:'설명 요청',why:'이유·근거 확인',example:'예시 요청',concept:'개념 확인',other:'기타 질문'};

export function ReportWorkspace({source,onClose,bundle,onRegenerate}:{source:ClassSession;onClose?:()=>void;bundle?:ReportBundle;onRegenerate?:()=>void}){
  const [options,setOptions]=useState<GenerationOptions|null>(bundle?.options??null);
  const [settingsOpen,setSettingsOpen]=useState(!bundle);
  const [snapshot]=useState(()=>({session:structuredClone(source),at:bundle?.createdAt??new Date().toISOString()}));
  const {session}=snapshot;
  const analysis=useLocalSections(session);
  const sectors=bundle?.sectors??analysis.confirmed??{};
  const live=useCondensedQuestions(session,{sectors,enabled:!bundle});
  const condensed=bundle?{...live,groups:bundle.groups,status:bundle.status,ready:()=>true,groupsFor:(rows:typeof session.questions)=>{const ids=new Set(rows.map(q=>q.id));return bundle.groups.map(g=>g.questions.filter(q=>ids.has(q.id))).filter(g=>g.length);}}:live;
  const [selected,setSelected]=useState<string|null>(null);
  const [original,setOriginal]=useState<string|null>(null);
  const [pendingOnly,setPendingOnly]=useState(false);
  const [mode,setMode]=useState<MapMode>('original');
  const [sort,setSort]=useState('page');
  const groups=[...condensed.groups].sort((a,b)=>b.questions.length-a.questions.length||a.page-b.page);
  const visibleGroups=groups.filter(group=>!pendingOnly||group.questions.some(q=>q.status==='unanswered'));
  const active=visibleGroups.find(group=>group.id===selected)??visibleGroups[0];
  const [selectedPage,setSelectedPage]=useState<number|null>(null);
  const question=active?.questions.find(item=>item.id===original)??active?.representative;
  const slide=session.slides[selectedPage??active?.page??-1];
  const region=slide&&selectedPage===null?(sectors[slide.id]??[]).find(item=>item.id===active?.region):undefined;
  const pending=session.questions.filter(item=>item.status==='unanswered');
  const back=`/admin/folders/${session.folderId??'unfiled'}?tab=insights`;
  const layout=useMemo(()=>{
    const rows=session.slides.map((slide,index)=>{const questions=session.questions.filter(q=>q.slideIndex===index);return {id:slide.id,bucket:pageBucket(questions,mode),count:questions.length,oldest:questions.map(q=>q.createdAt).sort()[0]??'~'};});
    return sort==='count'?rows.sort((a,b)=>b.count-a.count):sort==='oldest'?rows.sort((a,b)=>a.oldest.localeCompare(b.oldest)):rows;
  },[session,mode,sort]);
  const maxCount=Math.max(1,...visibleGroups.map(group=>group.questions.length));
  if(!options)return <main className={s.root}><h1>결과보고서 생성</h1><p>보고 싶은 분석 항목을 선택해 주세요.</p><button onClick={()=>setSettingsOpen(true)}>생성 설정 열기</button> <Link href={`/admin/session/${session.id}/qa-studio`}>QA Studio로 돌아가기</Link>{settingsOpen&&<GenerationSettings title="결과보고서" onCancel={()=>setSettingsOpen(false)} onGenerate={value=>{setOptions(value);setSettingsOpen(false);}}/>}</main>;
  const sections=options.sections;
  return <main className={s.root}>
    {settingsOpen&&<GenerationSettings title="결과보고서" initial={options} onCancel={()=>setSettingsOpen(false)} onGenerate={value=>{setOptions(value);setSettingsOpen(false);}}/>}
    <AnalysisShellHeader sessionId={session.id} title={session.title} active="report" back={back} actions={<><button onClick={()=>onRegenerate?onRegenerate():setSettingsOpen(true)}>{bundle?'결과리포트 다시 생성':'분석 항목 변경'}</button>{onClose&&<button type="button" onClick={onClose}>QA Studio로 돌아가기</button>}<Link href={`/admin/session/${session.id}/analysis`}>영역 레이블 검토</Link></>}/>
    <div className={s.reportTitle}><div><span>강의 후 분석</span><h1>결과보고서</h1></div><span className={s.draft}>분석 초안</span></div>
    <p>조회 기준 {new Date(snapshot.at).toLocaleString('ko-KR')} · 이 화면을 연 시점의 자료·질문을 사용합니다. 레이블과 의미 묶음은 분석 중 변경될 수 있으며, 아직 저장·확정된 보고서가 아닙니다.</p>
    {sections.includes(0)&&<ReexplainReview session={session} topics={reexplainTopics(session,groups,sectors)} scope="report"/>}

    <p role="status">{condensed.status||'질문 분석 대기'} · 영역명은 현재 자료 버전에 대해 검토·확정된 레이블만 사용합니다.</p>
    {!session.questions.length&&<section className={s.panel}><h2>등록된 질문이 없습니다.</h2><p>질문이 없는 상태에서는 질문 패턴이나 이해도를 판단하지 않습니다.</p></section>}
    <section className={s.panel}><DashboardAnalysis reviewScope="report" key={sections.join()} session={session} groups={groups} sectors={sectors} status={condensed.status} sections={sections.filter(index=>index!==0)} onPage={id=>setSelectedPage(session.slides.findIndex(slide=>slide.id===id))}/></section>
    {selectedPage!==null&&!sections.includes(2)&&slide&&<AnalysisBoardFullscreen title={`${selectedPage+1}페이지 질문 근거`} onClose={()=>setSelectedPage(null)}><SlideCanvas slide={slide} questions={session.questions.filter(q=>q.slideIndex===selectedPage)} selectedId={original} onSelectPin={setOriginal} statusColoredPins/>{session.questions.filter(q=>q.slideIndex===selectedPage).map(q=><p key={q.id}>{q.text}</p>)}</AnalysisBoardFullscreen>}
    {sections.includes(2)&&<div className={s.layout}>
      <section className={s.panel}><h2>주요 질문 주제</h2><p>내용 영역 → 질문 주제 → 원문 순서로 확인하세요. 제목은 기존 질문 유형과 대표 원문을 사용합니다.</p>
        <label className={s.toggle}><input type="checkbox" checked={pendingOnly} onChange={e=>{setPendingOnly(e.target.checked);setSelectedPage(null);}}/>미답변이 있는 묶음만</label>
        <div className={s.groups}>{visibleGroups.map(group=>{
          const page=session.slides[group.page];
          const label=(sectors[page?.id]??[]).find(item=>item.id===group.region)?.name??'영역 미분류';
          return <button key={group.id} aria-pressed={selectedPage===null&&active?.id===group.id} onClick={()=>{setSelected(group.id);setSelectedPage(null);setOriginal(null);}}><small>{group.page+1}페이지 · {label}</small><b>{intents[group.intent]}</b><span className={s.bar} aria-hidden="true"><i style={{width:`${group.questions.length/maxCount*100}%`}}/></span><span>{group.representative.text}</span><small>원문 {group.questions.length}건 · 미답변 {group.questions.filter(item=>item.status==='unanswered').length}건 · {kinds[group.kind]}</small></button>;
        })}</div>
        {!visibleGroups.length&&<p>이 조건에 해당하는 질문 묶음이 없습니다.</p>}
      </section>
      <section className={s.canvas} aria-label="강의 전체 자료 지도"><SpatialCanvas readOnly grouping={condensed} selectedSlideId={slide?.id} session={session} sectors={sectors} layout={layout} mode={mode} sort={sort} newCount={0} arrange={(next=mode,order=sort)=>{setMode(next);setSort(order);}} onOpen={id=>{const page=session.slides.findIndex(item=>item.id===id);const group=visibleGroups.find(item=>item.page===page);setSelected(group?.id??null);setSelectedPage(group?null:page);setOriginal(null);}} allowSimulation={false} onComplete={()=>{}} busy={false} error=""/></section>
      <section className={s.panel} aria-label="슬라이드와 질문 근거"><h2>{slide?`${slide.pageIndex+1}페이지 · ${region?.name??'영역 미분류'}`:'질문 근거'}</h2>
        {slide?<div className={s.stage}><SlideCanvas slide={slide} questions={selectedPage===null?(active?.questions??[]):[]} selectedId={question?.id} onSelectPin={setOriginal} statusColoredPins>{region&&<span className={s.region} style={{left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.w*100}%`,height:`${region.h*100}%`}} aria-hidden="true"/>}</SlideCanvas></div>:<p>연결된 슬라이드를 찾을 수 없습니다. 질문 원문은 아래에서 확인할 수 있습니다.</p>}
        <h3>묶음에 포함된 원문</h3>{selectedPage!==null?<p>이 페이지에는 현재 필터에 해당하는 묶음이 없습니다.</p>:<div className={s.groups}>{active?.questions.map(item=><button key={item.id} aria-pressed={question?.id===item.id} onClick={()=>setOriginal(item.id)}><small>{item.status==='unanswered'?'미답변':'답변 처리됨'} · {item.x==null||item.y==null?'좌표 없음':'핀 위치 있음'}</small><span>{item.text}</span></button>)}</div>}
        <p>묶음은 검토를 위한 제안입니다. 질문 수로 수강생의 이해도를 단정하지 않습니다.</p>
      </section>
    </div>}
    {sections.includes(0)&&<section className={s.panel}><h2>후속 설명 검토</h2><p>미답변 원문 {pending.length}건을 우선 확인하세요. 반복된 질문은 해당 내용의 설명·예시 보완 여부를 검토할 근거이며, 자동 개선 결론은 생성하지 않습니다.</p></section>}
  </main>;
}
