import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { EMBEDDING_MODEL, cosine } from "@/app/_infrastructure/server/local-embedding";
import { questionVectorsWithin } from "@/app/_infrastructure/server/question-placement";
import { labLocalRequest } from "@/app/_model/model-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 400;
const MIN_SIMILARITY = 0.7;
type Row = { id: string; text: string; page: number };

/**
 * 로컬 개발 전용 — 질문 축약을 위한 문장 유사도. 강사가 보낸 질문 문장을 로컬 임베딩으로 비교해
 * 같은 페이지 쌍의 코사인 유사도만 돌려준다. DB 는 읽지도 쓰지도 않고, 묶음 판단은 브라우저의 순수 로직이 한다.
 */
export async function POST(request: Request) {
  try {
    if (!labLocalRequest(request, process.env.NODE_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL)) throw new AdminApiError(404, "LOCAL_ONLY");
    // Explicit loopback-only development demo: no database reads or credentials.
    // The local-request guard above still applies, including origin checks.
    if (process.env.NEXT_PUBLIC_DATA_MODE !== 'demo') await requireAdminRequest(request);
    const body = await readSmallJsonBody(request, 256_000) as { questions?: unknown; budgetMs?: unknown } | null;
    if (!Array.isArray(body?.questions) || body.questions.length > MAX_ROWS) throw new AdminApiError(400, "INVALID_QUESTIONS");
    const rows: Row[] = [];
    const ids = new Set<string>();
    for (const item of body.questions as unknown[]) {
      const row = item as Partial<Row>;
      if (typeof row?.id !== "string" || !row.id || row.id.length > 64 || ids.has(row.id)) throw new AdminApiError(400, "INVALID_QUESTIONS");
      if (typeof row.text !== "string" || !row.text.trim() || [...row.text].length > 500) throw new AdminApiError(400, "INVALID_QUESTIONS");
      if (typeof row.page !== "number" || !Number.isInteger(row.page) || row.page < 0) throw new AdminApiError(400, "INVALID_QUESTIONS");
      ids.add(row.id);
      rows.push({ id: row.id, text: row.text.trim(), page: row.page });
    }
    const budgetMs = typeof body?.budgetMs === "number" ? Math.min(8000, Math.max(500, body.budgetMs)) : 4000;
    const { vectors, pending, embedding } = await questionVectorsWithin(rows.map((row) => row.text), budgetMs);
    const edges: Array<[string, string, number]> = [];
    const byPage = new Map<number, Row[]>();
    for (const row of rows) if (vectors.has(row.text)) byPage.set(row.page, [...(byPage.get(row.page) ?? []), row]);
    for (const group of byPage.values()) {
      for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) {
        const value = cosine(vectors.get(group[i].text)!, vectors.get(group[j].text)!);
        if (value >= MIN_SIMILARITY) edges.push([group[i].id, group[j].id, Math.round(value * 1000) / 1000]);
      }
    }
    return Response.json({
      edges, pending, embedding, model: embedding === "used" ? EMBEDDING_MODEL.name : undefined,
      embeddedIds: rows.filter((row) => vectors.has(row.text)).map((row) => row.id),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
