import { getAccessToken } from "@/app/_infrastructure/supabase/client";
import type { SimilarityEdge } from "@/app/_model/question-condense";

export type SimilarityResponse = { edges: SimilarityEdge[]; pending: number; embedding: "used" | "unavailable" | "warming"; embeddedIds: string[]; model?: string };

const MESSAGES: Record<string, string> = {
  LOCAL_ONLY: "의미 유사도 계산은 로컬 개발 환경에서만 됩니다.",
  AUTH_REQUIRED: "강사 로그인이 필요합니다.",
  INVALID_QUESTIONS: "질문 목록이 너무 크거나 형식이 맞지 않습니다.",
};

/** 같은 페이지 질문 문장의 임베딩 유사도를 로컬 서버에서 받는다. DB 접근 없음. 실패해도 규칙 묶음은 그대로 쓴다. */
export async function fetchQuestionSimilarity(questions: Array<{ id: string; text: string; page: number }>, budgetMs: number, signal?: AbortSignal): Promise<SimilarityResponse> {
  const token = await getAccessToken();
  if (!token && process.env.NEXT_PUBLIC_DATA_MODE !== 'demo') throw new Error(MESSAGES.AUTH_REQUIRED);
  const response = await fetch("/api/dev/question-similarity", {
    method: "POST", signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ questions, budgetMs }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(MESSAGES[String(data?.error?.code)] ?? "의미 유사도를 불러오지 못했습니다.");
  return data as SimilarityResponse;
}
