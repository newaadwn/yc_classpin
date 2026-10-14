import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  AUTO_PLACEMENT_CONFIDENCE, REGION_KIND_LABEL, boxCenter, buildPlacementRegions, decidePlacement, findRelatedQuestions,
  parseQuestionCues, placementPoint, rankPlacementRegions,
  type ExistingQuestion, type PlacementDecision, type PlacementRegion, type QuestionCues, type RankedRegion, type RelatedQuestion,
} from "@/app/_model/question-placement";
import { AdminApiError } from "./admin-api";
import { cachedSlidePages, loadSlideAnalysisCache } from "./slide-analysis-cache";
import { EMBEDDING_MODEL, cosine, embedTexts, embeddingStatus } from "./local-embedding";

export type PlacementSlide = { id: string; pageIndex: number; imageChecksum: string | null };
export type PlacementCategory = { key: string; label: string };
type Deck = { key: string; regions: PlacementRegion[]; supportedPages: number[] };
type EmbeddingState = "used" | "unavailable" | "warming";

export type PlacementResponse = {
  status: "auto" | "confirm" | "unsupported";
  message?: string;
  decision?: PlacementDecision;
  related: RelatedQuestion[];
  analysis: {
    source: "retrieval" | "llm";
    embedding: EmbeddingState;
    embeddingModel?: string;
    llmModel?: string;
    llmReason?: string;
    llmConfidence?: "high" | "medium" | "low";
    llmElapsedMs?: number;
    /** refine 요청이었지만 LLM 을 돌리지 않은 이유 (단서 부족 / 이미 충분히 확실). */
    llmSkipped?: "uninformative" | "confident";
    elapsedMs: number;
    supportedPages: number[];
  };
  debug?: Array<{ id: string; score: number; parts: RankedRegion["parts"]; terms: string[]; numbers: string[] }>;
};

const QUERY_INSTRUCTION = "Instruct: Given a student's question asked during a lecture, retrieve the slide region (title, text, chart, table or image caption) that the question refers to\nQuery:";
const DUPLICATE_INSTRUCTION = "Instruct: Retrieve other student questions that ask the same thing\nQuery:";
const WARM_WAIT_MS = 1500;
/** 기존 질문 임베딩 상한. 첫 질문 때 수백 개를 한 번에 임베딩하면 15초 제한을 넘길 수 있어 가까운 페이지·미답변부터 고른다. */
const EMBED_EXISTING_LIMIT = 120;
const state = globalThis as typeof globalThis & {
  questionPlacement?: {
    decks: Map<string, Deck>;
    regionVectors: Map<string, Map<string, number[]>>;
    warming: Map<string, Promise<Map<string, number[]>>>;
    textVectors: Map<string, number[]>;
    llmBusy: boolean;
  };
};
const pool = state.questionPlacement ?? (state.questionPlacement = { decks: new Map(), regionVectors: new Map(), warming: new Map(), textVectors: new Map(), llmBusy: false });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** 슬라이드 checksum 으로 캐시된 OCR·영역을 찾아 질문 배치용 영역 목록을 만든다. */
export async function placementDeck(slides: PlacementSlide[]): Promise<Deck> {
  const cache = await loadSlideAnalysisCache();
  const key = sha(`${cache.signature}|${slides.map((slide) => `${slide.pageIndex}:${slide.imageChecksum ?? ""}`).join("|")}`).slice(0, 32);
  const hit = pool.decks.get(key);
  if (hit) return hit;
  const regions: PlacementRegion[] = [];
  const supportedPages: number[] = [];
  for (const slide of slides) {
    const pages = cachedSlidePages(cache, slide.imageChecksum);
    if (!pages) continue;
    supportedPages.push(slide.pageIndex);
    regions.push(...buildPlacementRegions(slide.pageIndex, pages.ocr.regions, pages.layout.regions));
  }
  const deck = { key, regions, supportedPages };
  if (pool.decks.size > 20) pool.decks.clear();
  pool.decks.set(key, deck);
  return deck;
}

const regionText = (region: PlacementRegion) => `${REGION_KIND_LABEL[region.kind]} (${region.page + 1}페이지): ${region.text}`;

async function computeRegionVectors(deck: Deck) {
  const folder = path.join(process.cwd(), "output", "question-placement");
  const file = path.join(folder, `region-embeddings-${deck.key}.json`);
  try {
    const saved = JSON.parse(await readFile(file, "utf8")) as { model?: string; vectors?: Record<string, number[]> };
    if (saved.model === `${EMBEDDING_MODEL.source}@${EMBEDDING_MODEL.revision}` && saved.vectors) return new Map(Object.entries(saved.vectors));
  } catch { /* first run for this deck */ }
  const withText = deck.regions.filter((region) => region.text);
  const vectors = await embedTexts(withText.map(regionText));
  const map = new Map(withText.map((region, index) => [region.id, vectors[index]]));
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify({ model: `${EMBEDDING_MODEL.source}@${EMBEDDING_MODEL.revision}`, createdAt: new Date().toISOString(), vectors: Object.fromEntries([...map].map(([id, vector]) => [id, vector.map((value) => Math.round(value * 1e5) / 1e5)])) }));
  return map;
}

/** 영역 임베딩을 백그라운드로 준비한다. 첫 계산은 수십 초가 걸릴 수 있어 질문 응답을 막지 않는다. */
export function warmPlacement(deck: Deck): "ready" | "warming" | "unavailable" {
  const status = embeddingStatus();
  if (status === "unavailable") return "unavailable";
  // 디스크 캐시로 영역 벡터가 있어도 질문 벡터용 임베딩 서버는 미리 띄워 둔다.
  if (status === "idle") void embedTexts([QUERY_INSTRUCTION]).catch(() => undefined);
  if (pool.regionVectors.has(deck.key)) return status === "ready" ? "ready" : "warming";
  if (!pool.warming.has(deck.key)) {
    const task = computeRegionVectors(deck)
      .then((vectors) => { pool.regionVectors.set(deck.key, vectors); return vectors; })
      .finally(() => pool.warming.delete(deck.key));
    task.catch(() => undefined);
    pool.warming.set(deck.key, task);
  }
  return "warming";
}

async function regionVectorsWithin(deck: Deck, waitMs: number) {
  const ready = pool.regionVectors.get(deck.key);
  if (ready) return ready;
  if (warmPlacement(deck) === "unavailable") return null;
  const task = pool.warming.get(deck.key);
  if (!task) return pool.regionVectors.get(deck.key) ?? null;
  return Promise.race([task.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs))]);
}

async function textVectors(texts: string[]) {
  const missing = [...new Set(texts.filter((text) => !pool.textVectors.has(text)))];
  if (missing.length) {
    const vectors = await embedTexts(missing, 15_000);
    missing.forEach((text, index) => pool.textVectors.set(text, vectors[index]));
    if (pool.textVectors.size > 2000) [...pool.textVectors.keys()].slice(0, 500).forEach((key) => pool.textVectors.delete(key));
  }
  return texts.map((text) => pool.textVectors.get(text)!);
}

/**
 * 질문 축약용 문장 벡터. 이미 계산한 문장은 바로, 나머지는 작은 배치로 시간 예산 안에서만 계산한다.
 * 예산이 모자라면 남은 개수를 pending 으로 돌려주고, 호출한 쪽이 다시 요청한다 (수업 중 UI 를 오래 막지 않는다).
 */
export async function questionVectorsWithin(texts: string[], budgetMs: number): Promise<{ vectors: Map<string, number[]>; pending: number; embedding: EmbeddingState }> {
  const vectors = new Map<string, number[]>();
  const missing: string[] = [];
  for (const text of new Set(texts)) {
    const hit = pool.textVectors.get(DUPLICATE_INSTRUCTION + text);
    if (hit) vectors.set(text, hit); else missing.push(text);
  }
  if (!missing.length) return { vectors, pending: 0, embedding: "used" };
  const status = embeddingStatus();
  if (status === "unavailable") return { vectors, pending: missing.length, embedding: "unavailable" };
  if (status !== "ready") {
    // 서버가 뜨는 동안(수십 초) 요청을 붙들지 않는다. 시작만 시켜 두고 다음 요청에서 계산한다.
    if (status === "idle") void embedTexts([QUERY_INSTRUCTION]).catch(() => undefined);
    return { vectors, pending: missing.length, embedding: "warming" };
  }
  const deadline = Date.now() + budgetMs;
  let index = 0;
  try {
    while (index < missing.length && Date.now() < deadline) {
      const batch = missing.slice(index, index + 8);
      const rows = await textVectors(batch.map((text) => DUPLICATE_INSTRUCTION + text));
      batch.forEach((text, offset) => vectors.set(text, rows[offset]));
      index += batch.length;
    }
  } catch { return { vectors, pending: missing.length - index, embedding: embeddingStatus() === "unavailable" ? "unavailable" : "warming" }; }
  return { vectors, pending: missing.length - index, embedding: index < missing.length ? "warming" : "used" };
}

type Analysis = { cues: QuestionCues; ranked: RankedRegion[]; decision: PlacementDecision; related: RelatedQuestion[]; embedding: EmbeddingState; questionSimilarity?: Map<string, number> };

/** 중복 판단용으로 임베딩할 기존 질문: 질문이 가리키는 페이지 ±1 과 미답변을 먼저, 같은 순위는 원래 순서 유지. */
function embeddingTargets(existing: ExistingQuestion[], focusPage: number) {
  const rank = (item: ExistingQuestion) => (Math.abs(item.page - focusPage) <= 1 ? 0 : 2) + (item.status === "unanswered" ? 0 : 1);
  return existing.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).slice(0, EMBED_EXISTING_LIMIT).map(({ item }) => item);
}

async function analyze(input: {
  text: string; currentPage: number; deck: Deck; categories: PlacementCategory[]; pageCount: number; existing: ExistingQuestion[];
}): Promise<Analysis | null> {
  const { text, currentPage, deck, categories, pageCount, existing } = input;
  const cues = parseQuestionCues(text, pageCount);
  let embedding: EmbeddingState = embeddingStatus() === "unavailable" ? "unavailable" : "warming";
  let regionSimilarity: Map<string, number> | undefined;
  let questionSimilarity: Map<string, number> | undefined;
  try {
    const vectors = await regionVectorsWithin(deck, WARM_WAIT_MS);
    if (vectors) {
      const targets = embeddingTargets(existing, cues.pageHint ?? currentPage);
      const [query, self, ...others] = await textVectors([QUERY_INSTRUCTION + text, DUPLICATE_INSTRUCTION + text, ...targets.map((item) => DUPLICATE_INSTRUCTION + item.text)]);
      regionSimilarity = new Map([...vectors].map(([id, vector]) => [id, cosine(query, vector)]));
      questionSimilarity = new Map(targets.map((item, index) => [item.id, cosine(self, others[index])]));
      embedding = "used";
    } else if (embeddingStatus() === "unavailable") embedding = "unavailable";
  } catch { embedding = "unavailable"; }
  const ranked = rankPlacementRegions({ cues, regions: deck.regions, currentPage, embeddingSimilarity: regionSimilarity });
  const decision = decidePlacement({ text, cues, ranked, currentPage, enabledCategories: categories.map((item) => item.key), embedding });
  if (!decision) return null;
  const related = findRelatedQuestions(text, { page: decision.page, point: decision.point, box: decision.region.box }, existing, questionSimilarity);
  return { cues, ranked, decision, related, embedding, questionSimilarity };
}

function toResponse(analysis: Analysis, deck: Deck, started: number): PlacementResponse {
  return {
    status: analysis.decision.status,
    decision: analysis.decision,
    related: analysis.related,
    analysis: {
      source: "retrieval",
      embedding: analysis.embedding,
      embeddingModel: analysis.embedding === "used" ? EMBEDDING_MODEL.name : undefined,
      elapsedMs: Math.round(performance.now() - started),
      supportedPages: deck.supportedPages,
    },
    debug: analysis.ranked.slice(0, 5).map((row) => ({ id: row.region.id, score: Math.round(row.score * 1000) / 1000, parts: row.parts, terms: row.matchedTerms, numbers: row.matchedNumbers })),
  };
}

const unsupported = (deck: Deck, started: number): PlacementResponse => ({
  status: "unsupported",
  message: "이 강의자료는 아직 OCR·영역 분석 결과가 없어 AI 위치 찾기를 쓸 수 없어요. 슬라이드를 눌러 직접 위치를 정해 주세요.",
  related: [],
  analysis: { source: "retrieval", embedding: "unavailable", elapsedMs: Math.round(performance.now() - started), supportedPages: deck.supportedPages },
});

/** 빠른 단계: 페이지·영역 후보 검색과 점수화. 수백 ms 안에 끝나며 모델 추론은 하지 않는다. */
export async function placeQuestion(input: {
  text: string; currentPage: number; slides: PlacementSlide[]; categories: PlacementCategory[]; existing: ExistingQuestion[];
}): Promise<PlacementResponse> {
  const started = performance.now();
  const deck = await placementDeck(input.slides);
  if (!deck.regions.length) return unsupported(deck, started);
  const analysis = await analyze({ ...input, deck, pageCount: input.slides.length });
  return analysis ? toResponse(analysis, deck, started) : unsupported(deck, started);
}

const positionWords = (region: PlacementRegion) => {
  const { x, y } = boxCenter(region.box);
  return `${x < 0.4 ? "왼쪽" : x > 0.6 ? "오른쪽" : "가운데"} ${y < 0.35 ? "위" : y > 0.65 ? "아래" : "중간"}`;
};

type LlmOutput = { regionId: string; category: string; relation: string; confidence: "high" | "medium" | "low"; reason: string; model: string; elapsedMs: number };

function runPlacementModel(payload: unknown): Promise<LlmOutput> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "development", PYTHONUTF8: "1", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" };
    for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "QUESTION_PLACEMENT_THREADS"]) if (process.env[name]) env[name] = process.env[name];
    const python = path.join(process.cwd(), ".local/model-benchmark-venv/Scripts/python.exe");
    const script = path.join(process.cwd(), "experiments/semantic_regions/question_placement_llm.py");
    const child = spawn(/* turbopackIgnore: true */ python, [script], { cwd: process.cwd(), env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let output = ""; let settled = false;
    const finish = (error?: AdminApiError, value?: LlmOutput) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value!); };
    // The Python runner kills its own llama-server first; this is the outer safety net.
    const timer = setTimeout(() => { child.kill(); finish(new AdminApiError(504, "MODEL_FAILED")); }, 125_000);
    child.on("error", () => finish(new AdminApiError(503, "MODEL_UNAVAILABLE")));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk.toString(); if (output.length > 10_000) { child.kill(); finish(new AdminApiError(502, "MODEL_FAILED")); } });
    child.stdin.on("error", () => { /* close handler reports early runner failure */ });
    child.on("close", () => {
      try {
        const data = JSON.parse(output);
        if (data.error) throw new AdminApiError(data.error === "MODEL_BUSY" ? 409 : 503, data.error === "MODEL_BUSY" ? "MODEL_BUSY" : "MODEL_FAILED");
        if (typeof data.regionId !== "string" || typeof data.category !== "string" || !["high", "medium", "low"].includes(data.confidence)) throw new Error();
        finish(undefined, data as LlmOutput);
      } catch (error) { finish(error instanceof AdminApiError ? error : new AdminApiError(502, "MODEL_FAILED")); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

const LLM_CONFIDENCE = { high: 0.85, medium: 0.65, low: 0.4 } as const;

/** 애매한 질문만: 상위 후보를 로컬 Qwen3 4B 에게 보여 주고 질문-영역 관계를 다시 판단한다. */
export async function refineQuestionPlacement(input: {
  text: string; currentPage: number; slides: PlacementSlide[]; categories: PlacementCategory[]; existing: ExistingQuestion[];
}): Promise<PlacementResponse> {
  const started = performance.now();
  const deck = await placementDeck(input.slides);
  if (!deck.regions.length) return unsupported(deck, started);
  const analysis = await analyze({ ...input, deck, pageCount: input.slides.length });
  if (!analysis) return unsupported(deck, started);
  // 단서 없는 질문은 LLM 도 후보를 고를 근거가 없고, 이미 자동 배치 수준이면 재확인이 필요 없다.
  // 둘 다 공유 CPU 잠금(강사 AI 초안과 같은 lock)을 1~2분 붙잡지 않도록 바로 돌려준다.
  if (!analysis.decision.informative || analysis.decision.status === "auto") {
    const skipped = toResponse(analysis, deck, started);
    return { ...skipped, analysis: { ...skipped.analysis, llmSkipped: analysis.decision.informative ? "confident" : "uninformative" } };
  }
  const pool6: RankedRegion[] = [];
  for (const row of analysis.ranked) {
    if (pool6.length >= 6) break;
    if (row.region.text || row.region.kind === "chart" || row.region.kind === "table" || row.region.kind === "image") pool6.push(row);
  }
  if (process.platform !== "win32") throw new AdminApiError(503, "MODEL_UNAVAILABLE");
  if (pool.llmBusy) throw new AdminApiError(409, "MODEL_BUSY");
  pool.llmBusy = true;
  let llm: LlmOutput;
  try {
    llm = await runPlacementModel({
      question: input.text,
      currentPage: input.currentPage + 1,
      explicitPage: analysis.cues.pageHint === null ? null : analysis.cues.pageHint + 1,
      categories: Object.fromEntries(input.categories.map((item) => [item.key, item.label])),
      candidates: pool6.map((row) => ({ id: row.region.id, page: row.region.page + 1, type: REGION_KIND_LABEL[row.region.kind], position: positionWords(row.region), text: row.region.text || "(글자 없음)" })),
    });
  } finally { pool.llmBusy = false; }

  const base = toResponse(analysis, deck, started);
  const chosen = pool6.find((row) => row.region.id === llm.regionId);
  const retrieval = analysis.decision;
  let decision: PlacementDecision;
  if (!chosen) {
    decision = { ...retrieval, status: "confirm", confidence: Math.min(retrieval.confidence, 0.3), reasons: ["AI가 후보 중에서 질문에 맞는 영역을 찾지 못했어요. 위치를 직접 정해 주세요.", ...retrieval.reasons] };
  } else {
    const agree = chosen.region.id === retrieval.region.id;
    const chosenPoint = placementPoint(chosen, analysis.cues);
    const chosenCandidate = { page: chosen.region.page, point: chosenPoint, regionId: chosen.region.id, kind: chosen.region.kind, label: REGION_KIND_LABEL[chosen.region.kind], box: chosen.region.box, excerpt: [...chosen.region.text].slice(0, 80).join(""), score: Math.round(chosen.score * 100) / 100 };
    const llmConfidence = LLM_CONFIDENCE[llm.confidence];
    const confidence = Math.round(Math.min(0.95, agree ? Math.max(retrieval.confidence, llmConfidence) + (retrieval.confidence >= 0.5 && llmConfidence >= 0.65 ? 0.05 : 0) : llmConfidence * 0.9) * 100) / 100;
    decision = {
      ...retrieval,
      status: confidence >= AUTO_PLACEMENT_CONFIDENCE ? "auto" : "confirm",
      page: chosen.region.page,
      point: chosenPoint,
      region: { id: chosen.region.id, kind: chosen.region.kind, label: REGION_KIND_LABEL[chosen.region.kind], box: chosen.region.box, excerpt: [...chosen.region.text].slice(0, 80).join("") },
      category: input.categories.some((item) => item.key === llm.category) ? llm.category : retrieval.category,
      confidence,
      pageSource: analysis.cues.pageHint !== null ? "explicit" : chosen.region.page === input.currentPage ? "current" : "search",
      candidates: [chosenCandidate, ...retrieval.candidates.filter((item) => item.regionId !== chosen.region.id)].slice(0, 3),
      reasons: [`Qwen3 4B가 질문과 영역의 관계를 다시 판단했어요${agree ? " (빠른 검색 결과와 같음)" : " (다른 영역으로 수정)"}: ${llm.reason}`, ...retrieval.reasons.filter((reason) => !reason.startsWith("지금 보고") && !reason.includes("페이지를 먼저"))],
    };
  }
  const related = findRelatedQuestions(input.text, { page: decision.page, point: decision.point, box: decision.region.box }, input.existing, analysis.questionSimilarity);
  return {
    ...base,
    status: decision.status,
    decision,
    related: related.length ? related : base.related,
    analysis: { ...base.analysis, source: "llm", llmModel: llm.model, llmReason: llm.reason, llmConfidence: llm.confidence, llmElapsedMs: Math.round(llm.elapsedMs), elapsedMs: Math.round(performance.now() - started) },
  };
}
