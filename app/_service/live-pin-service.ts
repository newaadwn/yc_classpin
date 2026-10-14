import {getAccessToken} from "@/app/_infrastructure/supabase/client";
import type {PinSuggestion} from "@/app/_model/live-pin";
export async function suggestPin(questionId:string,signal:AbortSignal):Promise<PinSuggestion> {
  const token=await getAccessToken();
  const response=await fetch("/api/dev/live-pin",{method:"POST",signal,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({questionId})});
  const data=await response.json();
  if(!response.ok){
    const errors:Record<string,string>={CONTEXT_MISSING:"이 슬라이드와 일치하는 OCR·영역 분석이 없습니다. 자료 분석부터 진행해 주세요.",LOCAL_ONLY:"AI 추천은 로컬 개발 환경에서만 사용할 수 있습니다.",MODEL_BUSY:"다른 로컬 AI 작업이 실행 중입니다. 잠시 후 다시 시도해 주세요.",MODEL_UNAVAILABLE:"로컬 AI 실행 환경을 확인해 주세요.",MODEL_FAILED:"AI가 유효한 근거 기반 초안을 만들지 못했습니다. 다시 시도하거나 직접 답변해 주세요.",AUTH_REQUIRED:"강사 로그인이 필요합니다.",QUESTION_NOT_FOUND:"이 질문을 조회할 권한이 없거나 삭제된 질문입니다."};
    throw new Error(errors[data.error?.code]??"추천 답변을 불러오지 못했습니다.");
  }
  return data;
}
