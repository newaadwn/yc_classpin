'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '@/app/_controller/auth-context';
import type {ClassSession,Question} from '@/app/_model/types';
import {generateBundle,readBundle,saveBundle,type ReportBundle} from '@/app/_service/report-bundle';
import {GenerationSettings,type GenerationOptions} from './generation-settings';
import {AnalysisShellHeader} from './analysis-shell-header';
import {SpatialCanvas} from '@/app/(view)/admin/session/[id]/question-map/spatial-canvas';
import {ReportWorkspace} from '@/app/(view)/admin/session/[id]/report/report-workspace';
import {SlideCanvas} from './slide-canvas';
import {AnalysisBoardFullscreen} from '@/app/(view)/admin/session/[id]/question-map/analysis-board';
import {reportScopes} from '@/app/_model/report-scopes';
import {pageBucket,type MapMode} from '@/app/_model/question-map';

export function GeneratedReportWorkspace({source,view}:{source:ClassSession;view:'studio'|'report'}){
 const {user}=useAuth();return <Workspace key={`${user?.id??'demo'}:${source.id}`} source={source} view={view} owner={user?.id??'demo'}/>;
}
function Workspace({source,view,owner}:{source:ClassSession;view:'studio'|'report';owner:string}){
 const router=useRouter();
 const [bundle,setBundle]=useState<ReportBundle|null>(null),[ready,setReady]=useState(false),[settings,setSettings]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [mode,setMode]=useState<MapMode>('original'),[sort,setSort]=useState('page');
 const [page,setPage]=useState<string|null>(null);const request=useRef<AbortController|null>(null);
 useEffect(()=>{let active=true;void readBundle(owner,source.id).then(value=>{if(active){setBundle(value);setSettings(!value||new URLSearchParams(location.search).has('generate'));}}).catch(()=>{if(active){setError('저장된 초안을 불러오지 못했습니다. 다시 생성할 수 있습니다.');setSettings(true);}}).finally(()=>{if(active)setReady(true);});return()=>{active=false;request.current?.abort();};},[owner,source.id]);
 async function generate(options:GenerationOptions){
  if(request.current)return;const controller=new AbortController();request.current=controller;setSettings(false);setBusy(true);setError('');
  try{const value=await generateBundle(source,options,AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),setMessage);controller.signal.throwIfAborted();await saveBundle(owner,value);controller.signal.throwIfAborted();setBundle(value);router.replace(`/admin/session/${source.id}/qa-studio?report=1`);}
  catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'분석에 실패했습니다.');setSettings(true);}}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 if(!ready)return <main style={{padding:32}} role="status">보고서 초안을 불러오는 중…</main>;
 const modal=settings&&!busy?<GenerationSettings error={error} title="통합 결과리포트" initial={bundle?.options} onCancel={()=>setSettings(false)} onGenerate={generate}/>:null;
 if(busy||!bundle)return <main style={{padding:32}}><AnalysisShellHeader sessionId={source.id} title={source.title} active="report" back={source.folderId?`/admin/folders/${source.folderId}`:'/admin/dashboard'}/><h1>{busy?'강의 결과 분석 중':'결과리포트 생성'}</h1><p>전체 자료 {source.slides.length}페이지 · 질문 {source.questions.length}건</p><p>한 번의 분석으로 QA Studio, 대시보드, 요약리포트를 함께 준비합니다.</p>{busy?<><p role="status">{message}</p><progress aria-label="결과리포트 분석 중"/><button onClick={()=>request.current?.abort()}>분석 취소</button></>:<button className="btn primary" onClick={()=>setSettings(true)}>결과리포트 생성</button>}{error&&<p role="alert">{error}</p>}<p>결과는 이 계정의 브라우저 초안으로 저장됩니다.</p>{modal}</main>;
 if(view==='report')return <>{modal}<ReportWorkspace key={bundle.id} source={bundle.session} bundle={bundle} onRegenerate={()=>setSettings(true)}/></>;
 const grouping={groups:bundle.groups,status:bundle.status,pending:0,embedding:'used' as const,ready:()=>true,groupsFor:(rows:Question[])=>{const ids=new Set(rows.map(q=>q.id));return bundle.groups.map(g=>g.questions.filter(q=>ids.has(q.id))).filter(g=>g.length);},groupOf:(id:string)=>bundle.groups.find(g=>g.questions.some(q=>q.id===id))};
 const scopes=reportScopes(bundle.session,bundle.groups,bundle.sectors,mode);
 const slide=bundle.session.slides.find(s=>s.id===page);
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column',background:'var(--color-bg-page)'}}>
  <AnalysisShellHeader sessionId={source.id} title={source.title} active="studio" back={source.folderId?`/admin/folders/${source.folderId}`:'/admin/dashboard'} actions={<><Link href={`/admin/session/${source.id}/analysis`}>페이지 의미 영역 분석 · 검토</Link><button onClick={()=>setSettings(true)}>결과리포트 다시 생성</button><Link href={`/admin/session/${source.id}/report`}>요약리포트 열기</Link></>}/>
  <p style={{margin:'8px 24px',fontSize:13}}>{bundle.scope.label} · {new Date(bundle.createdAt).toLocaleString('ko-KR')} 생성 · 실제 질문 {bundle.session.questions.length}건 · 브라우저 초안</p>
  {mode==='content'&&<p style={{margin:'4px 24px',fontSize:12}}>검토·확정된 의미 영역명 기준입니다. 미분류 페이지는 ‘페이지 의미 영역 분석 · 검토’에서 분석한 뒤 결과리포트를 다시 생성하세요.</p>}
  {error&&<p role="alert">{error}</p>}
  <div style={{flex:1,minHeight:0}}><SpatialCanvas key={`${bundle.id}:${mode}`} contentMode analysisScopes={scopes} initialBoards={bundle.options} readOnly reviewScope="report" grouping={grouping} session={bundle.session} sectors={bundle.sectors} layout={scopes.length?scopes.flatMap((scope,i)=>scope.session.slides.map(slide=>({id:`scope-${i}:${slide.id}`,slideId:slide.id,bucket:scope.name,questionIds:scope.session.questions.filter(q=>scope.session.slides[q.slideIndex].id===slide.id).map(q=>q.id)}))):bundle.session.slides.filter(s=>bundle.scope.pageIds.includes(s.id)).map(s=>{const rows=bundle.session.questions.filter(q=>q.slideIndex===bundle.session.slides.indexOf(s));return {id:s.id,bucket:pageBucket(rows,mode),count:rows.length,oldest:rows.map(q=>q.createdAt).sort()[0]??'~'};}).sort((a,b)=>sort==='count'?b.count-a.count:sort==='oldest'?a.oldest.localeCompare(b.oldest):0)} mode={mode} sort={sort} newCount={0} arrange={(next=mode,order=sort)=>{setMode(next);setSort(order);}} onOpen={setPage} onComplete={()=>{}} busy={false} error="" allowSimulation={false}/></div>
  {slide&&<AnalysisBoardFullscreen title={`${slide.pageIndex+1}페이지 질문 근거`} onClose={()=>setPage(null)}><SlideCanvas slide={slide} questions={bundle.session.questions.filter(q=>q.slideIndex===bundle.session.slides.indexOf(slide))}>{(bundle.sectors[slide.id]??[]).map(r=><span key={r.id} style={{position:'absolute',left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.w*100}%`,height:`${r.h*100}%`,border:'2px solid var(--color-brand)',background:'rgb(40 103 232 / 10%)',pointerEvents:'none'}}>{r.name}</span>)}</SlideCanvas>{bundle.session.questions.filter(q=>q.slideIndex===bundle.session.slides.indexOf(slide)).map(q=><p key={q.id}>{q.text}</p>)}</AnalysisBoardFullscreen>}{modal}
 </main>;
}
