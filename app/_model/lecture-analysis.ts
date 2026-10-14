import type { Sector } from './question-map';
export const FIELDS = { engineering_it:'공학·IT', natural_science:'자연과학', medical:'의학·보건', business:'경영·경제', humanities:'인문', social_science:'사회과학', art_design:'예술·디자인', etc:'기타' };
export const LEVELS = { beginner:'입문', basic:'기초', intermediate:'중급', advanced:'심화', expert:'전문가' };
export const PURPOSES = { concept:'개념 이해', problem_solving:'문제 풀이', exam:'시험/자격 대비', practice:'실습', project:'프로젝트', discussion:'발표/토론', research:'연구/심화 학습', etc:'기타' };
export const ELEMENTS = { concept:'개념 및 정의', image:'그림 / 이미지', chart:'그래프 / 차트', table:'표', equation:'수식', code:'코드', example:'사례', exercise:'연습문제', etc:'기타' };
export type AnalysisConfig = {
  mode?:'auto'|'manual';
  lectureType:'single'|'series'; courseId:string|null; courseTitle:string; sequenceNumber:number|null;
  connectPreviousLectures:boolean; field:keyof typeof FIELDS | (keyof typeof FIELDS)[]; fieldOther:string; studentLevel:keyof typeof LEVELS;
  purposes:string[]; granularity:'coarse'|'normal'|'fine'; focusElements:string[];
  language:'ko'|'en'|'mixed'|'other'; languageOther:string; keyConcepts:string[]; customTerms:string;
  excludedPages:number[];
};
export const defaultAnalysisConfig = ():AnalysisConfig => ({lectureType:'single',courseId:null,courseTitle:'',sequenceNumber:null,connectPreviousLectures:true,field:'engineering_it',fieldOther:'',studentLevel:'beginner',purposes:['concept'],granularity:'normal',focusElements:['concept','image'],language:'ko',languageOther:'',keyConcepts:[],customTerms:'',excludedPages:[]});
export function configError(c:AnalysisConfig):string|null {
  if(c.mode!==undefined&&!['auto','manual'].includes(c.mode))return '분석 방식을 확인해 주세요.';
  const fields=Array.isArray(c.field)?c.field:[c.field];
  if(!['single','series'].includes(c.lectureType)||!['ko','en','mixed','other'].includes(c.language))return '강의 형태와 언어를 확인해 주세요.';
  if(c.language==='other'&&!c.languageOther.trim())return '기타 언어를 입력해 주세요.';
  if(c.lectureType==='series'&&(!c.courseTitle.trim()||!Number.isInteger(c.sequenceNumber)||c.sequenceNumber!<1))return '과목 이름과 1 이상의 차시를 입력해 주세요.';
  if(!fields.length||fields.some(f=>!Object.hasOwn(FIELDS,f)))return '강의 분야를 하나 이상 선택해 주세요.';
  if(!(c.studentLevel in LEVELS)||!['coarse','normal','fine'].includes(c.granularity))return '분석 설정을 확인해 주세요.';
  if(!c.purposes.length||c.purposes.some(p=>!(p in PURPOSES))||!c.focusElements.length||c.focusElements.some(p=>!(p in ELEMENTS)))return '강의 목적과 중요 요소를 각각 하나 이상 선택해 주세요.';
  if(fields.includes('etc')&&!c.fieldOther.trim())return '기타 강의 분야를 입력해 주세요.';
  if(c.excludedPages.some(n=>!Number.isInteger(n)||n<1))return '제외 페이지는 1 이상의 정수로 입력해 주세요.';
  if(c.courseTitle.length>120||c.fieldOther.length>120||c.languageOther.length>100||c.customTerms.length>2000||c.keyConcepts.join(',').length>1000)return '입력 내용이 너무 깁니다.';
  return null;
}
export type ReviewSection = Sector & {text?:string; source:'ai'|'layout'|'manual'; modifiedByInstructor:boolean; enabled:boolean; concepts:string[]};
export type AnalysisReview = {version:1;lectureId:string;source:string;config:AnalysisConfig;sections:Record<string,ReviewSection[]>;reviewedPages:string[];createdAt:string;updatedAt:string;confirmed?:{source:string;config:AnalysisConfig;sections:Record<string,ReviewSection[]>;confirmedAt:string}};
export function mergeSections(sections:ReviewSection[],ids:string[],id:string):ReviewSection[] {
  const selected=sections.filter(s=>ids.includes(s.id)&&s.enabled);
  if(selected.length<2)throw Error('활성 영역을 두 개 이상 선택해 주세요.');
  const x=Math.min(...selected.map(s=>s.x)),y=Math.min(...selected.map(s=>s.y));
  const merged:ReviewSection={id,name:selected.map(s=>s.name).join(' + ').slice(0,40),x,y,w:Math.max(...selected.map(s=>s.x+s.w))-x,h:Math.max(...selected.map(s=>s.y+s.h))-y,text:selected.map(s=>s.text??'').join('\n'),source:'manual',modifiedByInstructor:true,enabled:true,concepts:[...new Set(selected.flatMap(s=>s.concepts))]};
  return [...sections.filter(s=>!ids.includes(s.id)),merged];
}
export function splitSection(sections:ReviewSection[],id:string,axis:'x'|'y',newId:string):ReviewSection[] {
  const s=sections.find(s=>s.id===id);if(!s)throw Error('영역이 없습니다.');
  const dimension=axis==='x'?'w':'h';if(s[dimension]<.04)throw Error('영역이 너무 작아 나눌 수 없습니다.');
  const first={...s,name:`${s.name} 1`.slice(0,40),[dimension]:s[dimension]/2,source:'manual' as const,modifiedByInstructor:true};
  const second={...first,id:newId,name:`${s.name} 2`.slice(0,40),[axis]:s[axis]+s[dimension]/2};
  return sections.flatMap(item=>item.id===id?[first,second]:[item]);
}
