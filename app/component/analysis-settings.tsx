'use client';
import {useEffect,useRef,useState} from 'react';
import {FIELDS,LEVELS,PURPOSES,ELEMENTS,configError,defaultAnalysisConfig,type AnalysisConfig} from '@/app/_model/lecture-analysis';
import type {CourseOption} from '@/app/_service/lecture-analysis-service';
import styles from './analysis-workspace.module.css';

const titles:Record<string,[string,string]>={
 type:['어떤 강의인가요?','강의에 맞게 질문 영역을 준비할게요.'],
 course:['어떤 과목의 몇 번째 강의인가요?','이전 차시에서 다룬 개념도 함께 참고할 수 있어요.'],
 field:['어떤 분야를 다루나요?','관련된 분야를 모두 골라주세요. 전문 용어와 개념을 이해하는 데 활용해요.'],
 level:['누가 듣는 강의인가요?','수강생의 이해 수준에 맞춰 분석할게요.'],
 purpose:['무엇을 배우는 강의인가요?','중요한 목적을 모두 골라주세요.'],
 detail:['질문 영역을 얼마나 나눌까요?','강의 방식에 맞는 크기를 골라주세요.'],
 focus:['어떤 내용을 중요하게 볼까요?','중요한 요소를 모두 골라주세요.'],
 review:['이렇게 분석할게요','선택한 내용을 확인하고 시작해 주세요.'],
};
const granularities={coarse:'크게 나누기',normal:'보통 · 추천',fine:'세밀하게'};
export function AnalysisSettings({initial=defaultAnalysisConfig(),courses=[],onSubmit,label='설정 저장',onCancel,fileName}:{initial?:AnalysisConfig;courses?:CourseOption[];onSubmit:(config:AnalysisConfig)=>void;label?:string;onCancel?:()=>void;fileName?:string}){
 const [config,setConfig]=useState(initial),[error,setError]=useState(''),[step,setStep]=useState(-1);
 const [excludedInput,setExcludedInput]=useState(initial.excludedPages.join(','));
 const heading=useRef<HTMLHeadingElement>(null),first=useRef(true);
 const steps=['type',...(config.lectureType==='series'?['course']:[]),'field','level','purpose','detail','focus','review'];
 const current=steps[step],last=current==='review';
 const fields=Array.isArray(config.field)?config.field:[config.field];
 useEffect(()=>{if(first.current){first.current=false;return;}heading.current?.focus();},[step]);
 const set=<K extends keyof AnalysisConfig>(key:K,value:AnalysisConfig[K])=>{setConfig(c=>({...c,[key]:value}));setError('');};
 const nextConfig=()=>({...config,keyConcepts:config.keyConcepts.map(s=>s.trim()).filter(Boolean),excludedPages:[...new Set(excludedInput.split(',').map(s=>s.trim()).filter(Boolean).map(Number))]});
 const changeStep=(n:number)=>{setError('');setStep(n);};
 const choices=(name:'lectureType'|'studentLevel'|'granularity',options:Record<string,string>,descriptions:Record<string,string>={})=><div className={styles.choiceCards}>{Object.entries(options).map(([value,text])=><label key={value} className={styles.choiceCard}><input type="radio" name={name} checked={config[name]===value} onChange={()=>set(name,value as AnalysisConfig[typeof name])}/><span><strong>{text}</strong>{descriptions[value]&&<small>{descriptions[value]}</small>}</span><i aria-hidden="true">{config[name]===value?'✓':''}</i></label>)}</div>;
 const checks=(name:'purposes'|'focusElements',options:Record<string,string>)=><div className={`${styles.choiceCards} ${styles.choiceGrid}`}>{Object.entries(options).map(([value,text])=><label key={value} className={styles.choiceCard}><input type="checkbox" checked={config[name].includes(value)} onChange={e=>set(name,e.target.checked?[...config[name],value]:config[name].filter(x=>x!==value))}/><span><strong>{text}</strong></span><i aria-hidden="true">{config[name].includes(value)?'✓':''}</i></label>)}</div>;
 const summaries:[string,string,string][]=[['type','강의 형태',config.lectureType==='single'?'일회성 강의':'연속 강의'],...(config.lectureType==='series'?[['course','과목·차시',`${config.courseTitle} · ${config.sequenceNumber}차시`] as [string,string,string]]:[]),['field','분야',fields.map(f=>f==='etc'?config.fieldOther:FIELDS[f]).join(', ')],['level','수강생',LEVELS[config.studentLevel]],['purpose','목적',config.purposes.map(p=>PURPOSES[p as keyof typeof PURPOSES]).join(', ')],['detail','영역 크기',granularities[config.granularity]],['focus','중요 요소',config.focusElements.map(p=>ELEMENTS[p as keyof typeof ELEMENTS]).join(', ')]];
 if(step===-1)return <section className={`${styles.settings} ${styles.wizard}`}>
  <div className={styles.wizardTop}>{fileName||'강의 분석 설정'}</div>
  <div className={styles.wizardBody}><h2 ref={heading} tabIndex={-1}>어떻게 분석할까요?</h2><p className={styles.wizardHint}>설정 없이 시작하거나, 강의에 맞게 직접 선택할 수 있어요.</p>
   <div className={styles.courseFields}><button type="button" className="btn primary" onClick={()=>{try{onSubmit({...defaultAnalysisConfig(),mode:'auto',connectPreviousLectures:false});}catch(reason){setError(reason instanceof Error?reason.message:'분석 시작 실패');}}}>AI가 알아서 분석 · 바로 시작</button><p>자료의 내용과 배치를 바탕으로 핵심 영역을 찾아요. 분야·수준·목적은 지정하지 않으며, 기본 영역 크기는 보통입니다. 이전 차시는 연결하지 않습니다.</p>
   <button type="button" className="btn secondary" onClick={()=>{setConfig(c=>({...c,mode:'manual'}));changeStep(0);}}>직접 설정하고 분석</button><p>분야, 수강생 수준, 영역 크기 등을 한 단계씩 선택해요.</p></div>
   <p className={styles.wizardHint}>어느 방식이든 분석 결과를 검수하고 수정할 수 있어요.</p></div>
  {error&&<p role="alert">{error}</p>}{onCancel&&<button type="button" className="btn secondary" onClick={onCancel}>취소</button>}
 </section>;
 return <form className={`${styles.settings} ${styles.wizard}`} onSubmit={e=>{
  e.preventDefault();
  if(!last){
   const problem=current==='course'&&(!config.courseTitle.trim()||!Number.isInteger(config.sequenceNumber)||config.sequenceNumber!<1)?'과목 이름과 1 이상의 차시를 입력해 주세요.':current==='field'&&!fields.length?'강의 분야를 하나 이상 선택해 주세요.':current==='field'&&fields.includes('etc')&&!config.fieldOther.trim()?'강의 분야를 입력해 주세요.':current==='purpose'&&!config.purposes.length?'목적을 하나 이상 선택해 주세요.':current==='focus'&&!config.focusElements.length?'중요 요소를 하나 이상 선택해 주세요.':null;
   if(problem){setError(problem);return;}changeStep(step+1);return;
  }
  const next=nextConfig(),problem=configError(next);if(problem){setError(problem);return;}
  try{onSubmit({...next,courseId:config.lectureType==='series'?(config.courseId??`local-course-${crypto.randomUUID()}`):null,sequenceNumber:config.lectureType==='series'?config.sequenceNumber:null});}catch(reason){setError(reason instanceof Error?reason.message:'저장 실패');}
 }}>
  <div className={styles.wizardTop}><span>{fileName||'강의 분석 설정'}</span><span>{step+1} / {steps.length}</span></div>
  <progress className={styles.wizardProgress} max={steps.length} value={step+1} aria-label="강의 설정 단계"/>
  <section key={current} className={styles.wizardBody} aria-labelledby="analysis-step-title">
   <h2 id="analysis-step-title" ref={heading} tabIndex={-1}>{titles[current][0]}</h2><p className={styles.wizardHint}>{titles[current][1]}</p>
   {current==='type'&&choices('lectureType',{single:'일회성 강의',series:'연속 강의'},{single:'한 번으로 완결되는 특강·세미나·발표',series:'여러 차시에 걸쳐 이어지는 수업·교육 과정'})}
   {current==='course'&&<div className={styles.courseFields}><label>기존 과목<select aria-label="기존 과목" value={config.courseId??''} onChange={e=>{const c=courses.find(c=>c.id===e.target.value);setConfig(v=>({...v,courseId:c?.id??null,courseTitle:c?.title??''}));}}><option value="">새 과목 만들기</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>강의/과목 이름<input required maxLength={120} value={config.courseTitle} onChange={e=>set('courseTitle',e.target.value)} placeholder="예: AI융합입문"/></label><label>현재 차시<input required type="number" min={1} max={999} value={config.sequenceNumber??''} onChange={e=>set('sequenceNumber',Number(e.target.value))}/></label><label className={styles.inlineCheck}><input type="checkbox" checked={config.connectPreviousLectures} onChange={e=>set('connectPreviousLectures',e.target.checked)}/>이전 강의 자료와 연결해서 분석</label></div>}
   {current==='field'&&<>{<div className={`${styles.choiceCards} ${styles.choiceGrid}`}>{Object.entries(FIELDS).map(([value,text])=>{const field=value as keyof typeof FIELDS;return <label key={field} className={styles.choiceCard}><input type="checkbox" checked={fields.includes(field)} onChange={e=>set('field',e.target.checked?[...fields,field]:fields.filter(f=>f!==field))}/><span><strong>{text}</strong></span><i aria-hidden="true">{fields.includes(field)?'✓':''}</i></label>;})}</div>}{fields.includes('etc')&&<label>기타 분야<input required maxLength={120} value={config.fieldOther} onChange={e=>set('fieldOther',e.target.value)}/></label>}</>}
   {current==='level'&&choices('studentLevel',LEVELS,{beginner:'처음 접하는 내용이에요',basic:'기본 개념을 배우는 단계예요',intermediate:'기초를 알고 응용하는 단계예요',advanced:'깊이 있는 내용을 다뤄요',expert:'전문적인 지식을 갖추고 있어요'})}
   {current==='purpose'&&checks('purposes',PURPOSES)}
   {current==='detail'&&choices('granularity',granularities,{coarse:'연관된 내용을 큰 주제로 묶어요',normal:'핵심 개념마다 하나의 질문 영역을 만들어요',fine:'그림·공식·설명을 세부 영역으로 구분해요'})}
   {current==='focus'&&checks('focusElements',ELEMENTS)}
   {last&&<><dl className={styles.wizardSummary}>{summaries.map(([key,title,value])=><div key={key}><dt>{title}</dt><dd>{value}</dd><button type="button" aria-label={`${title} 수정`} onClick={()=>changeStep(steps.indexOf(key))}>수정</button></div>)}</dl><details><summary>고급 설정 · 필요한 경우에만</summary><label>강의 언어<select value={config.language} onChange={e=>set('language',e.target.value as AnalysisConfig['language'])}><option value="ko">한국어</option><option value="en">영어</option><option value="mixed">한국어 + 영어</option><option value="other">기타</option></select></label>{config.language==='other'&&<label>기타 언어<input value={config.languageOther} maxLength={100} onChange={e=>set('languageOther',e.target.value)}/></label>}<label>핵심 개념 (비워두면 AI 판단, 쉼표로 구분)<input maxLength={1000} value={config.keyConcepts.join(',')} onChange={e=>set('keyConcepts',e.target.value.split(','))}/></label><label>전문 용어 / 강의 전용 용어<textarea maxLength={2000} value={config.customTerms} onChange={e=>set('customTerms',e.target.value)}/></label><label>분석 제외 페이지 (쉼표로 구분)<input value={excludedInput} onChange={e=>{if(/^[\d,\s]*$/.test(e.target.value))setExcludedInput(e.target.value);}} placeholder="1,2"/></label></details></>}
  </section>
  {error&&<p role="alert" className={styles.wizardError}>{error}</p>}
  <footer className={styles.wizardFooter}>{step>0?<button type="button" className="btn secondary" onClick={()=>changeStep(step-1)}>이전</button>:onCancel?<button type="button" className="btn secondary" onClick={onCancel}>취소</button>:null}<button className="btn primary" type="submit">{last?label:'다음'}</button></footer>
 </form>;
}
export function AnalysisSetupDialog({courses,onSubmit,onCancel,fileName}:{courses:CourseOption[];onSubmit:(config:AnalysisConfig)=>void;onCancel:()=>void;fileName?:string}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close();},[]);
 return <dialog ref={ref} className={`${styles.dialog} ${styles.wizardDialog}`} aria-label="강의 분석 설정" onCancel={onCancel}><AnalysisSettings courses={courses} fileName={fileName} onSubmit={onSubmit} onCancel={onCancel} label="이 설정으로 업로드 · 분석 시작"/></dialog>;
}
