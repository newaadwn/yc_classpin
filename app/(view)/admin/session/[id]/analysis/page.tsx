'use client';
/* eslint-disable @next/next/no-img-element -- Uploaded slide URLs and native image dimensions are required for coordinate editing. */
import {useEffect,useState} from 'react';
import {useParams,useRouter} from 'next/navigation';
import Link from 'next/link';
import {useSessions} from '@/app/_controller/session-store';
import {AnalysisSettings} from '@/app/component/analysis-settings';
import {SectionDrawLayer} from '@/app/component/section-draw-layer';
import {SectionNameAssistant} from '@/app/component/section-name-assistant';
import {mergeSections,splitSection,type AnalysisConfig,type AnalysisReview,type ReviewSection} from '@/app/_model/lecture-analysis';
import {validSector} from '@/app/_model/question-map';
import {readReview,writeReview,prepareReview,confirmReview,courseOptions,analysisSource} from '@/app/_service/lecture-analysis-service';
import {analyzeLocalDeck,readSectionRun,isLocalDeckRunning,type SectionRun} from '@/app/_service/local-sections';
import styles from '@/app/component/analysis-workspace.module.css';

const steps=[['file','파일 확인'],['elements','구성 요소 추출'],['layout','여백·배치 분석'],['semantic','내용 관계 분석'],['sections','질문 영역 생성']];
const elementName=(kind:string)=>({text:'텍스트',image:'그림',table:'표',chart:'차트',equation:'수식',formula:'수식',code:'코드',title:'제목',paragraph_title:'소제목',header:'머리말',footer:'꼬리말',number:'번호'}[kind]??'기타 요소');
export default function AnalysisPage(){
 const {id}=useParams<{id:string}>(),router=useRouter(),{sessions,ready}=useSessions();
 const session=sessions.find(s=>s.id===id);
 const [review,setReview]=useState<AnalysisReview|null>(null),[run,setRun]=useState<SectionRun|null>(null),[loaded,setLoaded]=useState(false);
 const [editing,setEditing]=useState(false),[pageIndex,setPageIndex]=useState(0),[selected,setSelected]=useState<string[]>([]),[view,setView]=useState('sections');
 const [preserve,setPreserve]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ratio,setRatio]=useState(16/9);
 const [drawingPage,setDrawingPage]=useState<string|null>(null);
 const [deleted,setDeleted]=useState<{pageId:string;source:string;sections:ReviewSection[]}|null>(null);
 useEffect(()=>{const sync=()=>{setReview(readReview(id));setRun(readSectionRun(id));setBusy(isLocalDeckRunning(id));setLoaded(true);};const timer=setTimeout(sync,0);window.addEventListener('classpin-sections',sync);window.addEventListener('classpin-analysis-review',sync);window.addEventListener('storage',sync);return()=>{clearTimeout(timer);window.removeEventListener('classpin-sections',sync);window.removeEventListener('classpin-analysis-review',sync);window.removeEventListener('storage',sync);};},[id]);
 if(!ready||!loaded)return <main className={styles.workspace}>자료를 불러오는 중…</main>;
 if(!session)return <main className={styles.workspace}>자료를 찾을 수 없습니다. <Link href="/admin/dashboard">자료 목록</Link></main>;
 if(process.env.NEXT_PUBLIC_DATA_MODE!=='demo')return <main className={styles.workspace}>현재 분석 검수는 로컬 데모에서 사용할 수 있습니다. 운영 자료는 변경하지 않습니다. <Link href={`/admin/session/${id}`}>강의로 돌아가기</Link></main>;
 const slide=session.slides[Math.min(pageIndex,session.slides.length-1)];
 if(!slide)return <main className={styles.workspace}>슬라이드가 없습니다.</main>;
 const sections=review?.sections[slide.id]??[],excluded=review?.config.excludedPages.includes(slide.pageIndex+1)??false;
 const edited=Object.values(review?.sections??{}).flat().filter(s=>s.modifiedByInstructor).length;
 const guarded=(action:()=>void)=>{try{action();setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'처리 실패');}};
 const saveSections=(next:ReviewSection[])=>guarded(()=>{if(!review||busy)return;writeReview({...review,sections:{...review.sections,[slide.id]:next},reviewedPages:review.reviewedPages.filter(p=>p!==slide.id)});});
 const update=(sectionId:string,patch:Partial<ReviewSection>)=>saveSections(sections.map(s=>s.id===sectionId?{...s,...patch,modifiedByInstructor:true}:s));
 const deleteSelected=()=>guarded(()=>{
  if(busy||excluded||drawingPage===slide.id||view!=='sections'||!selected.length)return;
  const current=readReview(id);if(!current)return;
  const items=current.sections[slide.id]??[],removed=items.filter(s=>selected.includes(s.id));if(!removed.length)return;
  writeReview({...current,sections:{...current.sections,[slide.id]:items.filter(s=>!selected.includes(s.id)).map(s=>({...s,modifiedByInstructor:true}))},reviewedPages:current.reviewedPages.filter(p=>p!==slide.id)});
  setDeleted({pageId:slide.id,source:current.source,sections:removed});setSelected([]);
 });
 const restoreDeleted=()=>guarded(()=>{
  if(busy||!deleted)return;const current=readReview(id);if(!current||current.source!==deleted.source)throw Error('자료가 변경되어 복원할 수 없습니다.');
  const items=current.sections[deleted.pageId]??[];
  writeReview({...current,sections:{...current.sections,[deleted.pageId]:[...items,...deleted.sections.filter(s=>!items.some(item=>item.id===s.id))]},reviewedPages:current.reviewedPages.filter(p=>p!==deleted.pageId)});setDeleted(null);
 });
 const analyze=(pageId?:string,config?:AnalysisConfig)=>guarded(()=>{
  if(busy)return;
  if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('자동 분석은 로컬 분석 서버(8769)가 필요합니다. 이 화면에서는 수동 검수만 가능합니다.');
  if(!preserve&&edited&&!window.confirm(`직접 수정한 영역 ${edited}개가 있습니다. ${pageId?'현재 페이지의':'모든'} 수정본을 새 분석 결과로 덮어쓸까요? 기존 확정본은 유지됩니다.`))return;
  if(config){if(config.excludedPages.some(n=>n>session.slides.length))throw Error('제외 페이지가 자료의 페이지 수를 초과합니다.');prepareReview(session,config);setEditing(false);}
  setSelected([]);void analyzeLocalDeck(session,undefined,{sessions,pageId,force:true,preserveManual:preserve});
 });
 const all=Object.values(review?.sections??{}).flat().filter(s=>s.enabled);
 const elements=run?.elements?.[slide.id]??[];
 const boxes=view==='elements'?elements.map(e=>({id:`e-${e.id}`,name:elementName(e.kind),x:e.box[0],y:e.box[1],w:e.box[2]-e.box[0],h:e.box[3]-e.box[1]})):view==='layout'?run?.candidates?.[slide.id]??[]:sections.filter(s=>s.enabled);
 const counts=Object.values(run?.elements??{}).flat().reduce<Record<string,number>>((a,e)=>{const name=elementName(e.kind);a[name]=(a[name]??0)+1;return a;},{});
 return <main className={styles.workspace} onKeyDown={e=>{
  if(e.key!=='Backspace'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.nativeEvent.isComposing)return;
  if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
  if(!busy&&!excluded&&drawingPage!==slide.id&&view==='sections'&&selected.length){e.preventDefault();e.stopPropagation();deleteSelected();}
 }}>
  <header><div><Link href={`/admin/session/${id}`}>← 강의로 돌아가기</Link><h1>{session.title} · 분석과 검수</h1><p>질문 영역은 강사가 확정한 뒤 사용됩니다. 로컬 저장 · 운영 DB 변경 없음</p></div><div className={styles.toolbar}><button className="btn secondary" disabled={busy} onClick={()=>setEditing(v=>!v)}>분석 설정</button><button className="btn primary" disabled={busy||!review} onClick={()=>guarded(()=>{confirmReview(session);router.push(`/admin/session/${id}`);})}>분석 확정 · 질문 기능 시작</button></div></header>
  {message&&<p role="alert" className={styles.status}>{message}</p>}
  {deleted&&<p role="status" className={styles.status}>영역 {deleted.sections.length}개를 삭제했습니다. <button className="btn secondary" disabled={busy} onClick={restoreDeleted}>영역 삭제 되돌리기</button></p>}
  {(!review||editing)&&<section className={styles.status}><AnalysisSettings fileName={session.fileName} initial={review?.config} courses={courseOptions(sessions)} onSubmit={config=>analyze(undefined,config)} onCancel={review?()=>setEditing(false):undefined} label="설정 저장 · 분석 시작"/></section>}
  {review&&!editing&&<>
   <ol className={styles.steps} aria-label="실제 분석 진행 단계">{steps.map(([key,label],i)=>{const done=key==='file'||(busy?i<steps.findIndex(([k])=>k===run?.stage):key==='elements'?Object.keys(run?.elements??{}).length>0:key==='layout'?Object.keys(run?.candidates??{}).length>0:Object.keys(run?.sections??{}).length>0);return <li key={key} aria-current={busy&&run?.stage===key?'step':undefined}>{done?'✓':i+1+'.'} {label}{busy&&run?.stage===key?' · 진행 중':''}</li>;})}</ol>
   <div className={styles.status} role="status">{busy?`${session.slides.find(s=>s.id===run?.currentPage)?.pageIndex!==undefined?(session.slides.find(s=>s.id===run?.currentPage)!.pageIndex+1)+'페이지 · ':''}${run?.done??0}/${run?.total??0}페이지 처리 완료`:run?.status==='running'?'분석이 중단되었습니다. 다시 분석을 눌러 재개해 주세요.':run?.status==='partial'?'일부 분석 실패 · 실패 페이지는 재시도하거나 직접 설정할 수 있습니다.':run?.status==='complete'?'질문 영역 초안 준비 완료 · 페이지별 검수 후 확정해 주세요.':'설정을 저장하고 분석을 시작해 주세요.'}
    <p>총 {session.slides.length}페이지 · 질문 가능 {session.slides.filter(s=>!review.config.excludedPages.includes(s.pageIndex+1)&&(review.sections[s.id]??[]).some(r=>r.enabled)).length}페이지 · 활성 영역 {all.length}개 · 제외 {review.config.excludedPages.length}페이지 · 검수 {review.reviewedPages.length}페이지</p>
    <p>실제 추출 요소: {Object.entries(counts).map(([k,n])=>`${k} ${n}개`).join(' · ')||'아직 추출되지 않았습니다.'}</p>
    <p>핵심 개념: {[...new Set(all.flatMap(s=>s.concepts))].slice(0,16).join(', ')||'분석 후 표시'}</p>
    {review.confirmed&&<p>기존 확정본: {new Date(review.confirmed.confirmedAt).toLocaleString()} · 다시 확정하기 전까지 기존 확정본으로 질문을 연결합니다.</p>}
    {review.source!==analysisSource(session)&&<p role="alert">자료가 변경되었습니다. 설정을 저장하고 다시 분석해 주세요.</p>}
    {run?.fileError&&<p role="alert">전체 작업 오류: {run.fileError}</p>}
    {!!run?.warnings?.length&&<details><summary>분석 안내 {run.warnings.length}개</summary>{run.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
   </div>
   <div className={styles.toolbar}><span>직접 수정 {edited}개</span><select aria-label="재분석 보존 정책" value={preserve?'preserve':'replace'} disabled={busy} onChange={e=>setPreserve(e.target.value==='preserve')}><option value="preserve">직접 수정한 페이지 보존</option><option value="replace">전체 새로 분석 (수정본 덮어쓰기)</option></select><button className="btn secondary" disabled={busy} onClick={()=>analyze()}>전체 다시 분석</button></div>
   <div className={styles.layout}>
    <nav className={styles.pages} aria-label="검수할 페이지">{session.slides.map((s,i)=><button key={s.id} aria-current={s.id===slide.id?'page':undefined} onClick={()=>{setPageIndex(i);setSelected([]);}}><img src={s.imageUrl} alt=""/>{s.pageIndex+1}페이지<br/>{review.config.excludedPages.includes(s.pageIndex+1)?'분석 제외':review.reviewedPages.includes(s.id)?'검수 완료':run?.errors[s.id]?'분석 실패':'검수 대기'}</button>)}</nav>
    <section><div className={styles.toolbar}><label>표시 <select aria-label="영역 표시 방식" value={view} onChange={e=>{setView(e.target.value);setDrawingPage(null);}}><option value="sections">최종 질문 영역</option><option value="layout">여백 기반 후보</option><option value="elements">추출 요소</option></select></label><span>{slide.pageIndex+1}페이지 · {boxes.length}개</span></div>
     {drawingPage===slide.id&&!busy&&!excluded&&<p role="status">슬라이드 위에서 드래그하세요. 마우스를 놓으면 영역이 저장됩니다. Esc로 취소 · 너무 작은 드래그는 무시합니다. <button className="btn secondary" onClick={()=>setDrawingPage(null)}>영역 그리기 취소</button><button className="btn secondary" onClick={()=>{saveSections([...sections,{id:crypto.randomUUID(),name:'직접 지정한 영역',x:.1,y:.2,w:.4,h:.4,source:'manual',modifiedByInstructor:true,enabled:true,concepts:[]}]);setDrawingPage(null);}}>드래그 대신 숫자로 지정</button></p>}
     <div className={styles.stage} style={{aspectRatio:ratio}}><img src={slide.imageUrl} alt={`${slide.pageIndex+1}페이지`} onLoad={e=>setRatio(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)}/>{!excluded&&boxes.map(s=><button key={s.id} className={styles.box} aria-label={`${s.name} 영역 선택`} aria-pressed={selected.includes(s.id)} style={{left:`${s.x*100}%`,top:`${s.y*100}%`,width:`${s.w*100}%`,height:`${s.h*100}%`}} onClick={()=>{if(view==='sections')setSelected(ids=>ids.includes(s.id)?ids.filter(v=>v!==s.id):[...ids,s.id]);}}><span>{s.name}</span></button>)}{drawingPage===slide.id&&!busy&&!excluded&&view==='sections'&&<SectionDrawLayer key={slide.id} onCancel={()=>setDrawingPage(null)} onAdd={box=>guarded(()=>{const current=readReview(id);if(!current)throw Error("검수 데이터를 불러올 수 없습니다.");const newId=crypto.randomUUID();writeReview({...current,sections:{...current.sections,[slide.id]:[...(current.sections[slide.id]??[]),{...box,id:newId,name:"직접 지정한 영역",source:"manual",modifiedByInstructor:true,enabled:true,concepts:[]}]},reviewedPages:current.reviewedPages.filter(p=>p!==slide.id)});setSelected([newId]);setDrawingPage(null);})}/>}</div>
     {run?.errors[slide.id]&&<p role="alert">이 페이지 분석 실패: {run.errors[slide.id]}</p>}
     <div className={styles.toolbar}><button className="btn secondary" disabled={busy||excluded} onClick={()=>analyze(slide.id)}>이 페이지 다시 분석</button><button className="btn secondary" disabled={busy||excluded} aria-pressed={drawingPage===slide.id} onClick={()=>{setView('sections');setDrawingPage(drawingPage===slide.id?null:slide.id);}}>직접 영역 추가</button><button className="btn primary" disabled={busy||excluded} onClick={()=>guarded(()=>{if(!sections.some(s=>s.enabled)||sections.some(s=>s.enabled&&!validSector(s)))throw Error('활성 영역의 이름과 좌표를 확인해 주세요.');writeReview({...review,reviewedPages:[...new Set([...review.reviewedPages,slide.id])]});})}>이 페이지 검수 완료</button></div>
     <label><input type="checkbox" disabled={busy} checked={excluded} onChange={e=>guarded(()=>writeReview({...review,config:{...review.config,excludedPages:e.target.checked?[...review.config.excludedPages,slide.pageIndex+1]:review.config.excludedPages.filter(n=>n!==slide.pageIndex+1)},reviewedPages:review.reviewedPages.filter(p=>p!==slide.id)}))}/>이 페이지는 질문 영역에서 제외</label>
    </section>
    <aside className={styles.inspector} aria-label="영역 수정"><h2>질문 영역 검수</h2><p>선택 후 합치거나 나눌 수 있습니다. 좌표는 슬라이드 전체를 0~1로 표현합니다.</p><div className={styles.toolbar}><button className="btn secondary" disabled={busy||selected.length<2} onClick={()=>guarded(()=>{saveSections(mergeSections(sections,selected,crypto.randomUUID()));setSelected([]);})}>선택 영역 합치기</button>{(['x','y'] as const).map(axis=><button key={axis} className="btn secondary" disabled={busy||selected.length!==1} onClick={()=>guarded(()=>saveSections(splitSection(sections,selected[0],axis,crypto.randomUUID())))}>{axis==='x'?'좌우':'상하'}로 나누기</button>)}</div>
     {sections.map(s=><article key={s.id}><label><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(v=>v!==s.id))}/>선택 · {s.source==='ai'?'자동 생성':s.source==='layout'?'배치 후보':'수동 지정'}{s.modifiedByInstructor?' · 강사 수정':''}</label><label>영역 이름<input aria-label={`${s.id} 영역 이름`} disabled={busy} maxLength={40} value={s.name} onChange={e=>update(s.id,{name:e.target.value,concepts:[e.target.value]})}/></label><label><input type="checkbox" disabled={busy} checked={s.enabled} onChange={e=>update(s.id,{enabled:e.target.checked})}/>질문 영역으로 사용</label><div className={styles.coordinates}>{(['x','y','w','h'] as const).map(key=><label key={key}>{key}<input aria-label={`${s.id} ${key}`} disabled={busy} type="number" min={0} max={1} step={.01} value={s[key]} onChange={e=>update(s.id,{[key]:Number(e.target.value)})}/></label>)}</div>{!validSector(s)&&<small role="alert">이름과 좌표(오른쪽·아래 경계 ≤ 1)를 확인하세요.</small>}<small>{s.text?.slice(0,200)}</small></article>)}
     <SectionNameAssistant key={slide.id} session={session} pageId={slide.id} sections={sections} disabled={busy||excluded}/>
     {!sections.length&&<p>아직 생성된 영역이 없습니다. 분석이 실패했다면 직접 영역을 추가할 수 있습니다.</p>}
    </aside>
   </div>
  </>}
 </main>;
}
