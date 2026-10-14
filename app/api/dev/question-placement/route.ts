import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireParticipantRequest } from "@/app/_infrastructure/server/admin-api";
import { placeQuestion, placementDeck, refineQuestionPlacement, warmPlacement, type PlacementSlide } from "@/app/_infrastructure/server/question-placement";
import { labLocalRequest } from "@/app/_model/model-lab";
import { categoryLabel } from "@/app/_model/i18n";
import { enabledQuestionCategories, normalizeQuestionCategorySettings, questionCategoryLabel } from "@/app/_model/types";
import type { ExistingQuestion } from "@/app/_model/question-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LectureRow = {
  id: string;
  question_categories: unknown;
  materials: Array<{ id: string; material_versions: Array<{ id: string; version_no: number; slides: Array<{ id: string; page_index: number; image_checksum: string | null }> }> }>;
};
type QuestionRow = { id: string; slide_id: string | null; raw_text: string; status: string; reaction_count: number | null; region_anchors: { coords?: { x?: unknown; y?: unknown } } | null };

/** 참여자 권한(RLS) 그대로 라이브 강의·슬라이드·공개 질문을 읽는다. 서비스 키는 쓰지 않는다. */
async function loadLiveLecture(client: SupabaseClient, lectureId: string, materialId: string) {
  const { data, error } = await client.from("lectures")
    .select("id, question_categories, materials!materials_lecture_id_fkey(id, material_versions(id, version_no, slides(id, page_index, image_checksum)))")
    .eq("id", lectureId)
    .eq("status", "live")
    .maybeSingle();
  if (error || !data) throw new AdminApiError(404, "LECTURE_NOT_FOUND");
  const lecture = data as unknown as LectureRow;
  const material = lecture.materials.find((item) => item.id === materialId);
  const version = material && [...material.material_versions].sort((a, b) => b.version_no - a.version_no)[0];
  if (!version) throw new AdminApiError(404, "MATERIAL_NOT_FOUND");
  const slides: PlacementSlide[] = [...version.slides].sort((a, b) => a.page_index - b.page_index).map((slide) => ({ id: slide.id, pageIndex: slide.page_index, imageChecksum: slide.image_checksum }));
  const settings = normalizeQuestionCategorySettings(lecture.question_categories);
  const categories = enabledQuestionCategories(settings).map((key) => ({ key, label: questionCategoryLabel(settings, key, (category) => categoryLabel("ko", category)) }));
  return { slides, categories };
}

async function loadExistingQuestions(client: SupabaseClient, lectureId: string, slides: PlacementSlide[]): Promise<ExistingQuestion[]> {
  const { data, error } = await client.rpc("find_lecture_questions", { target_lecture_id: lectureId });
  if (error) throw new AdminApiError(503, "QUESTIONS_UNAVAILABLE", true);
  const pageBySlide = new Map(slides.map((slide) => [slide.id, slide.pageIndex]));
  return (Array.isArray(data) ? data as QuestionRow[] : []).flatMap((row) => {
    const page = row.slide_id ? pageBySlide.get(row.slide_id) : undefined;
    if (page === undefined) return [];
    const x = Number(row.region_anchors?.coords?.x);
    const y = Number(row.region_anchors?.coords?.y);
    return [{ id: row.id, text: row.raw_text, page, x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null, status: row.status, reactionCount: Math.max(0, row.reaction_count ?? 0) }];
  }).slice(0, 300);
}

/**
 * 로컬 개발 전용 — 참여자가 텍스트로 쓴 질문의 페이지·영역·좌표·카테고리·신뢰도와 중복/연관 질문을 판단한다.
 * DB 에는 아무것도 쓰지 않는다. PIN 생성은 참여자 브라우저가 기존 질문 등록 경로(RLS)로 수행한다.
 */
export async function POST(request: Request) {
  try {
    if (!labLocalRequest(request, process.env.NODE_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL)) throw new AdminApiError(404, "LOCAL_ONLY");
    const { client } = await requireParticipantRequest(request);
    const body = await readSmallJsonBody(request, 4096) as Record<string, unknown> | null;
    const mode = body?.mode === "refine" ? "refine" : body?.mode === "warmup" ? "warmup" : "fast";
    const lectureId = typeof body?.lectureId === "string" && UUID.test(body.lectureId) ? body.lectureId : null;
    const materialId = typeof body?.materialId === "string" && UUID.test(body.materialId) ? body.materialId : null;
    if (!lectureId || !materialId) throw new AdminApiError(400, "INVALID_LECTURE");
    const { slides, categories } = await loadLiveLecture(client, lectureId, materialId);
    if (mode === "warmup") {
      const deck = await placementDeck(slides);
      const status = deck.regions.length ? warmPlacement(deck) : "unsupported";
      return Response.json({ status, supportedPages: deck.supportedPages }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const currentPage = typeof body?.currentPage === "number" && Number.isInteger(body.currentPage) ? body.currentPage : -1;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (currentPage < 0 || currentPage >= slides.length) throw new AdminApiError(400, "INVALID_PAGE");
    if (!text || [...text].length > 300) throw new AdminApiError(400, "INVALID_TEXT");
    const existing = await loadExistingQuestions(client, lectureId, slides);
    const input = { text, currentPage, slides, categories, existing };
    const result = mode === "refine" ? await refineQuestionPlacement(input) : await placeQuestion(input);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
