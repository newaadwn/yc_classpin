import { getAudienceAccessToken } from "@/app/_infrastructure/supabase/client";
import type { PlacementDecision, RelatedQuestion } from "@/app/_model/question-placement";

export type QuestionPlacementResult = {
  status: "auto" | "confirm" | "unsupported";
  message?: string;
  decision?: PlacementDecision;
  related: RelatedQuestion[];
  analysis: {
    source: "retrieval" | "llm";
    embedding: "used" | "unavailable" | "warming";
    embeddingModel?: string;
    llmModel?: string;
    llmReason?: string;
    llmConfidence?: "high" | "medium" | "low";
    llmElapsedMs?: number;
    llmSkipped?: "uninformative" | "confident";
    elapsedMs: number;
    supportedPages: number[];
  };
};

export class QuestionPlacementError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const MESSAGES: Record<string, string> = {
  LOCAL_ONLY: "AI 위치 찾기는 로컬 개발 환경에서만 쓸 수 있어요.",
  AUTH_REQUIRED: "참여 세션이 끊겼어요. 페이지를 새로고침해 주세요.",
  LECTURE_NOT_FOUND: "진행 중인 강의를 찾지 못했어요.",
  MATERIAL_NOT_FOUND: "강의자료를 찾지 못했어요.",
  INVALID_TEXT: "질문은 1~300자로 입력해 주세요.",
  INVALID_PAGE: "현재 페이지 정보를 확인하지 못했어요.",
  QUESTIONS_UNAVAILABLE: "기존 질문을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  MODEL_BUSY: "다른 AI 작업이 실행 중이라 이번에는 AI 재확인을 건너뛰었어요.",
  MODEL_UNAVAILABLE: "로컬 AI 실행 환경을 찾지 못했어요.",
  MODEL_FAILED: "AI가 위치를 다시 판단하지 못했어요.",
};

async function post(body: Record<string, unknown>, signal?: AbortSignal) {
  const token = await getAudienceAccessToken();
  if (!token) throw new QuestionPlacementError("AUTH_REQUIRED", "AI 위치 찾기는 로컬 Supabase 참여 세션에서만 쓸 수 있어요.");
  const response = await fetch("/api/dev/question-placement", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = String(data?.error?.code ?? "FAILED");
    throw new QuestionPlacementError(code, MESSAGES[code] ?? "AI 위치 찾기에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  return data;
}

/** 질문 문장으로 페이지·영역·좌표·카테고리·신뢰도와 중복/연관 질문을 받는다. DB 에는 쓰지 않는다. */
export async function requestQuestionPlacement(input: { lectureId: string; materialId: string; currentPage: number; text: string; mode: "fast" | "refine" }, signal?: AbortSignal) {
  return await post(input, signal) as QuestionPlacementResult;
}

/** 참여 화면을 열 때 영역 임베딩을 미리 준비한다. 실패해도 질문 흐름은 글자 검색으로 계속된다. */
export async function warmQuestionPlacement(lectureId: string, materialId: string) {
  try { await post({ mode: "warmup", lectureId, materialId }); } catch { /* optional warm-up */ }
}
