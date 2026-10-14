import type {ClassSession} from '@/app/_model/types';
import {validSector,type Sector} from '@/app/_model/question-map';
import {readReview,applyAnalysisPage,previousLectureContext,analysisSource} from './lecture-analysis-service';
export type NativeElement={id:number;kind:string;text:string;box:[number,number,number,number]};
type NativePage={pageIndex:number;width:number;height:number;elements:NativeElement[]};
export type AnalysisStage='file'|'elements'|'layout'|'semantic'|'sections'|'complete';
export type SectionRun={status:'running'|'complete'|'partial';done:number;total:number;errors:Record<string,string>;sections:Record<string,Sector[]>;source:string;model:string;nativePages?:NativePage[];warnings?:string[];stage?:AnalysisStage;currentPage?:string;elements?:Record<string,NativeElement[]>;candidates?:Record<string,Sector[]>;configKey?:string;fileError?:string};
const key=(id:string)=>`classpin-local-sections-v1:${id}`;
const running=new Set<string>();
export function isLocalDeckRunning(id:string){return running.has(id);}
export function readSectionRun(id:string):SectionRun|null{try{return JSON.parse(localStorage.getItem(key(id))??'null');}catch{return null;}}
export const sectionSource=analysisSource;
export async function analyzeLocalDeck(session:ClassSession,file?:File,options:{sessions?:ClassSession[];pageId?:string;force?:boolean;preserveManual?:boolean}={}){
 if(running.has(session.id)||!['127.0.0.1','localhost'].includes(location.hostname))return;
 const review=readReview(session.id);if(!review)return;
 running.add(session.id);
 const source=sectionSource(session),old=readSectionRun(session.id),config=review.config,configKey=JSON.stringify(config);
 const same=old?.source===source, reusable=same&&old.configKey===configKey;
 const pages=session.slides.filter(s=>!config.excludedPages.includes(s.pageIndex+1)&&(!options.pageId||s.id===options.pageId));
 const run:SectionRun={status:'running',stage:'file',done:0,total:pages.length,errors:options.pageId&&reusable?{...old.errors}:{},sections:reusable?{...old.sections}:{},source,model:'Native PPTX / OCR + layout + Qwen3-4B',nativePages:same?old.nativePages:undefined,elements:same?{...old.elements}:{},candidates:{},configKey,warnings:[]};
 const save=()=>{localStorage.setItem(key(session.id),JSON.stringify(run));window.dispatchEvent(new Event('classpin-sections'));};
 const request=async(path:string,body:BodyInit,json=false)=>{const r=await fetch(`http://127.0.0.1:8769/${path}`,{method:'POST',headers:{'Content-Type':json?'application/json':'application/octet-stream'},body,signal:AbortSignal.timeout(600000)});if(!r.ok)throw Error(r.status===409?'다른 로컬 분석이 실행 중입니다. 잠시 후 재시도하세요.':`${path} 분석 실패 (${r.status}) · 수동 영역 지정 또는 재시도가 가능합니다.`);return r.json();};
 try{
  save();
  if(file&&/\.pptx$/i.test(file.name)){
   try{if(file.size>32*1024*1024)throw Error('PPTX 원본 분석 한도 32MB 초과');const data=await request('pptx-layout',file);if(!Array.isArray(data.pages)||data.pages.length!==session.slides.length)throw Error('PPTX 페이지 수 불일치');run.nativePages=data.pages;save();}
   catch(error){run.warnings!.push(`${error instanceof Error?error.message:'원본 분석 실패'} · 이미지 분석으로 대체`);save();}
  }
  for(const slide of pages){
   run.currentPage=slide.id;delete run.errors[slide.id];
   if(options.preserveManual!==false&&(readReview(session.id)?.sections[slide.id]??[]).some(s=>s.modifiedByInstructor)){run.warnings!.push(`${slide.pageIndex+1}페이지: 강사 수정본 보존`);run.done++;save();continue;}
   if(!options.force&&run.sections[slide.id]){run.done++;save();continue;}
   try{
    run.stage='elements';save();
    let elements=run.elements![slide.id]??run.nativePages?.find(p=>p.pageIndex===slide.pageIndex)?.elements;
    if(!elements?.length||elements.length>65||!elements.some(e=>e.text.trim())){
     if(!slide.imageUrl)throw Error('슬라이드 이미지가 없습니다.');
     const url=new URL(slide.imageUrl,location.origin);
     if(url.protocol!=='data:'&&!(url.protocol==='blob:'&&url.origin===location.origin)&&url.origin!==location.origin)throw Error('외부 이미지는 분석 서버에 전송하지 않습니다.');
     const image=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!image.ok)throw Error('이미지 읽기 실패');
     const blob=await image.blob();if(blob.size>8*1024*1024)throw Error('이미지 용량 초과');
     elements=(await request('layout',blob)).elements;
    }
    if(!Array.isArray(elements)||!elements.length)throw Error('추출 요소가 없습니다. 수동 영역을 지정해 주세요.');
    run.elements![slide.id]=elements;run.stage='layout';save();
    const limit={coarse:3,normal:6,fine:10}[config.granularity];
    run.candidates![slide.id]=(await request('layout-candidates',JSON.stringify({elements,config}),true)).candidates;save();
    run.stage='semantic';save();
    const result=await request('native-sections',JSON.stringify({elements,config,previous:previousLectureContext(session,options.sessions??[],config)}),true);
    if(result.status!=='complete'||!Array.isArray(result.sections)||!result.sections.length||result.sections.length>limit||!result.sections.every(validSector))throw Error('분석 결과 형식 오류');
    const current=readReview(session.id);if(current?.source!==source||JSON.stringify(current.config)!==configKey)throw Error('분석 도중 자료나 설정이 변경되었습니다. 다시 분석해 주세요.');
    run.sections[slide.id]=result.sections;run.stage='sections';
    applyAnalysisPage(session.id,slide.id,result.sections.map((s:Sector)=>({...s,source:'ai',modifiedByInstructor:false,enabled:true,concepts:[s.name]})),options.preserveManual!==false);
   }catch(error){run.errors[slide.id]=error instanceof Error?error.message:'분석 실패';}
   run.done++;save();
  }
  run.status=Object.keys(run.errors).length?'partial':'complete';run.stage='complete';save();
 }catch(error){run.status='partial';run.fileError=error instanceof Error?error.message:'저장 또는 분석 실패';try{save();}catch{console.error('분석 결과를 저장할 공간이 부족합니다.');}}
 finally{running.delete(session.id);window.dispatchEvent(new Event('classpin-sections'));}
}
