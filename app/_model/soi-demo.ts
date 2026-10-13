import {defaultQuestionCategorySettings,type ClassSession,type Question,type QuestionStatus} from './types';

export interface SoiDemoSource {
  title: string;
  sourceFile: string;
  slides: Array<{pageIndex:number;image:string}>;
  questions: Array<{
    id:string;
    text:string;
    anchor?:{x?:number|null;y?:number|null}|null;
    anchorKind?:string;
    slideIndex:number;
    category:string;
    status:string;
    reactionCount?:number;
    createdAt:string;
  }>;
}

const questionStatus=(value:string):QuestionStatus=>value==='resolved'?'resolved':value==='answered'?'answered':'unanswered';

/** Sanitized, read-only SOI preview data; no author IDs or answer bodies are imported. */
export function createSoiDemoSession(source:SoiDemoSource,startedAt=new Date().toISOString()):ClassSession{
  if(!source||!Array.isArray(source.slides)||!Array.isArray(source.questions)||source.slides.length===0){
    throw new Error('SOI 데모 자료 형식이 올바르지 않습니다.');
  }
  const slides=source.slides.map((slide,index)=>{
    if(!/^slides\/slide-\d{2}\.jpg$/.test(slide.image))throw new Error('허용되지 않은 슬라이드 파일 경로입니다.');
    return {id:`soi-slide-${index+1}`,pageIndex:slide.pageIndex,title:`슬라이드 ${slide.pageIndex+1}`,imageUrl:`/demo/soi/${slide.image}`};
  });
  const sessionId='soi-demo';
  const questions:Question[]=source.questions.map((question)=>({
    id:question.id,
    sessionId,
    slideIndex:question.slideIndex,
    x:typeof question.anchor?.x==='number'&&Number.isFinite(question.anchor.x)?question.anchor.x:null,
    y:typeof question.anchor?.y==='number'&&Number.isFinite(question.anchor.y)?question.anchor.y:null,
    anchorKind:'point',
    width:null,
    height:null,
    path:null,
    category:question.category,
    marker:'pin',
    text:question.text,
    status:questionStatus(question.status),
    isMine:false,
    reactionCount:Math.max(0,Math.trunc(question.reactionCount??0)),
    reactedByMe:false,
    createdAt:question.createdAt
  }));
  if(questions.some(question=>question.slideIndex<0||question.slideIndex>=slides.length||!question.text.trim())){
    throw new Error('SOI 질문에 유효하지 않은 페이지 또는 질문 내용이 있습니다.');
  }
  return {
    id:sessionId,
    folderId:null,
    code:'SOIDEMO',
    title:source.title,
    fileName:source.sourceFile,
    status:'live',
    startedAt,
    endedAt:null,
    currentSlide:0,
    presentationInteractions:true,presentationAutoplay:false,
    showQuestionPins:true,
    showPresentationQr:false,
    presentationQrPosition:'bottom-right',
    questionCategories:defaultQuestionCategorySettings(),
    createdAt:startedAt,
    slides,
    questions
  };
}
