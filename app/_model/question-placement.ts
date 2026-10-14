/**
 * 텍스트 질문 → 슬라이드 영역 자동 배치의 순수 로직.
 * 서버가 캐시된 OCR·레이아웃 결과와 (가능하면) 임베딩 유사도를 넣어 호출한다.
 * 규칙 점수는 AI 판단이 아니며, 결과에는 어떤 단서로 골랐는지 이유를 함께 남긴다.
 */

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Point = { x: number; y: number };
export type RegionKind = "title" | "text" | "chart" | "table" | "image" | "caption";
export type RawRegion = { alias?: unknown; label?: unknown; bboxNorm?: unknown; textRedacted?: unknown };
export type PlacementLine = { text: string; box: Box };
export type PlacementRegion = { id: string; page: number; kind: RegionKind; box: Box; text: string; lines: PlacementLine[] };

export type QuestionCues = {
  pageHint: number | null;
  kinds: RegionKind[];
  horizontal: "left" | "right" | "center" | null;
  vertical: "top" | "bottom" | "middle" | null;
  ordinal: { n: number; axis: "row" | "column" } | null;
  numbers: string[];
  terms: string[];
  deictic: boolean;
  color: string | null;
};

export type ScoreParts = { lexical: number; number: number | null; embedding: number | null; kind: number | null; position: number | null };
export type RankedRegion = { region: PlacementRegion; score: number; base: number; parts: ScoreParts; matchedTerms: string[]; matchedNumbers: string[] };

export type ExistingQuestion = { id: string; text: string; page: number; x: number | null; y: number | null; status: string; reactionCount: number };
export type RelatedQuestion = { id: string; text: string; page: number; relation: "duplicate" | "related"; similarity: number; sameArea: boolean; reactionCount: number; status: string };

export type PageSource = "explicit" | "current" | "search";
export type PlacementDecision = {
  status: "auto" | "confirm";
  page: number;
  point: Point;
  region: { id: string; kind: RegionKind; label: string; box: Box; excerpt: string };
  category: string;
  confidence: number;
  pageSource: PageSource;
  /** 질문에 페이지·영역을 특정할 단서(용어·숫자·요소 종류·위치)가 있었는지. 없으면 LLM 재확인도 도움이 되지 않는다. */
  informative: boolean;
  reasons: string[];
  candidates: Array<{ page: number; point: Point; regionId: string; kind: RegionKind; label: string; box: Box; excerpt: string; score: number }>;
};

export const AUTO_PLACEMENT_CONFIDENCE = 0.7;
export const REGION_KIND_LABEL: Record<RegionKind, string> = { title: "제목", text: "본문", chart: "그래프", table: "표", image: "그림", caption: "설명 문구" };

const LAYOUT_KIND: Record<string, RegionKind> = {
  paragraph_title: "title", doc_title: "title", title: "title",
  text: "text", abstract: "text", content: "text", reference: "text", formula: "text", algorithm: "text", aside_text: "text",
  chart: "chart", table: "table", image: "image", figure: "image", seal: "image",
  figure_title: "caption", chart_title: "caption", table_title: "caption", vision_footnote: "caption", footnote: "caption",
};
const EXCLUDED_LAYOUT = new Set(["header", "footer", "number", "header_image", "footer_image"]);
const KIND_PRIORITY: RegionKind[] = ["table", "chart", "image", "title", "caption", "text"];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const area = (box: Box) => (box.x2 - box.x1) * (box.y2 - box.y1);
export const boxCenter = (box: Box): Point => ({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 });

function toBox(value: unknown): Box | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((key) => Number(source[key]));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const box = { x1: clamp(x1), y1: clamp(y1), x2: clamp(x2), y2: clamp(y2) };
  return box.x2 > box.x1 && box.y2 > box.y1 ? box : null;
}

function iou(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = w * h;
  return inter ? inter / (area(a) + area(b) - inter) : 0;
}

export function boxContains(box: Box, point: Point, pad = 0) {
  return point.x >= box.x1 - pad && point.x <= box.x2 + pad && point.y >= box.y1 - pad && point.y <= box.y2 + pad;
}

const cleanText = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
const meaningful = (text: string) => /[\p{L}\p{N}]{2,}/u.test(text);
const sortLines = (lines: PlacementLine[]) => [...lines].sort((a, b) => (Math.round(a.box.y1 * 50) - Math.round(b.box.y1 * 50)) || a.box.x1 - b.box.x1);

/** PP-DocLayout 영역 안에 PP-OCR 줄을 넣어 "종류 + 좌표 + 글자"를 가진 영역 목록을 만든다. */
export function buildPlacementRegions(page: number, ocr: RawRegion[], layout: RawRegion[]): PlacementRegion[] {
  const excluded: Box[] = [];
  const blocks: Array<{ alias: string; kind: RegionKind; box: Box }> = [];
  layout.forEach((item, index) => {
    const label = String(item.label ?? "");
    const box = toBox(item.bboxNorm);
    if (!box) return;
    if (EXCLUDED_LAYOUT.has(label)) { excluded.push(box); return; }
    const kind = LAYOUT_KIND[label];
    if (kind) blocks.push({ alias: String(item.alias ?? `B${index + 1}`), kind, box });
  });
  blocks.sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind));
  const kept: typeof blocks = [];
  for (const block of blocks) if (!kept.some((item) => iou(item.box, block.box) > 0.85)) kept.push(block);

  const assigned = new Map<number, PlacementLine[]>();
  const loose: Array<PlacementLine & { alias: string }> = [];
  ocr.forEach((item, index) => {
    const text = cleanText(item.textRedacted);
    const box = toBox(item.bboxNorm);
    if (!text || !box) return;
    const center = boxCenter(box);
    let best = -1;
    kept.forEach((block, blockIndex) => {
      if (boxContains(block.box, center, 0.006) && (best < 0 || area(block.box) < area(kept[best].box))) best = blockIndex;
    });
    if (best >= 0) assigned.set(best, [...(assigned.get(best) ?? []), { text, box }]);
    else if (!excluded.some((box2) => boxContains(box2, center, 0.004))) loose.push({ text, box, alias: String(item.alias ?? `L${index + 1}`) });
  });

  const regions: PlacementRegion[] = kept.map((block, index) => {
    const lines = sortLines(assigned.get(index) ?? []);
    return { id: `P${page + 1}-${block.alias}`, page, kind: block.kind, box: block.box, text: lines.map((line) => line.text).join(" "), lines };
  });
  for (const line of loose) {
    if (meaningful(line.text)) regions.push({ id: `P${page + 1}-O${line.alias}`, page, kind: "text", box: line.box, text: line.text, lines: [{ text: line.text, box: line.box }] });
  }
  return regions;
}

const KOREAN_ORDINALS: Record<string, number> = { 첫: 1, 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const PARTICLE = /(?:이라는|라는|에서는|에서의|에서|으로는|으로|에게|한테|까지|부터|처럼|이란|란|하고|이랑|랑|은|는|이|가|을|를|의|에|로|와|과|도|만|요)$/;
const STOPWORDS = new Set([
  "뭔가요", "뭔가", "무엇", "무엇인가요", "뭐", "뭔지", "뭘", "뭐예요", "뭐에요", "무슨", "어느", "어떤", "어떻게", "어디", "왜", "이유", "원인",
  "의미", "의미하는", "뜻", "뜻하는", "궁금", "궁금합니다", "궁금해요", "합니다", "해요", "인가요", "건가요", "걸까요", "나요", "까요", "했죠", "하나요",
  "정확히", "여기서", "여기", "이거", "이것", "저거", "그거", "저기", "요기", "말하는", "나온", "나오는", "나왔", "있는", "부분", "내용", "설명", "좀", "더",
  "수", "것", "거", "건", "게", "된", "되는", "하는", "한", "할", "있나요", "있을까요", "알려", "주세요", "질문", "페이지", "슬라이드", "장", "쪽",
  "그래프", "차트", "도표", "표", "그림", "사진", "이미지", "제목", "오른쪽", "왼쪽", "우측", "좌측", "가운데", "중앙", "중간", "위", "아래", "상단",
  "하단", "위쪽", "아래쪽", "행", "열", "줄", "칸", "번째", "기준", "기준으로", "분류된", "분류", "생각", "생각한", "판단", "대한", "관련", "같아요",
  "싶어요", "있었으면", "좋겠습니다", "좋겠다", "뭔데", "정도", "어떻게요", "보면", "보이는", "나타내는", "가리키는", "표시된", "적힌", "쓰인",
  "파란색", "빨간색", "초록색", "노란색", "주황색", "보라색", "회색", "검은색", "흰색", "색", "색깔", "부분이", "것인지", "건지", "인지",
  "말하", "의미하", "뜻하", "생각하", "나오", "궁금하", "정말", "진짜", "너무", "조금", "많이", "그래도", "특히", "혹시", "아마", "이미", "다시",
  "같이", "그냥", "계속", "이렇게", "그렇게", "저렇게", "어떻", "이런", "그런", "저런", "해서", "하면", "해야", "있어야", "없는", "있다", "없다",
  // 위치를 가리키지 않는 평가·요청 표현(카테고리 판단에는 원문을 그대로 쓴다)
  "근거", "근거자료", "부족", "부족한", "다양한", "확실한", "필요", "필요한", "이해", "예시", "사례", "추가", "자세히", "구체적", "구체적인",
]);
const VERB_ENDING = /(?:나요|까요|세요|해요|했죠|하죠|인가|는가|을까|할까|습니다|합니다|입니다|했나|하나|시나|되나|될까|겠다|겠어|네요|군요|거든요|는데|던데|잖아)$/;
const COLOR = /(파란|파랑|빨간|빨강|초록|녹색|노란|노랑|주황|보라|회색|검은|검정|흰|하얀|분홍|하늘)\s*(?:색|색깔)?/;

function ordinalValue(token: string) {
  if (/^\d+$/.test(token)) return Number(token);
  return KOREAN_ORDINALS[token] ?? null;
}

function normalizeNumber(token: string) {
  return token.replace(/\s+/g, "").replace(/,/g, "").replace(/퍼센트|프로/g, "%");
}

/** 질문 문장에서 페이지 번호, 영역 종류, 위치, 서수, 수치와 핵심어를 뽑는다. */
export function parseQuestionCues(text: string, pageCount: number): QuestionCues {
  const source = cleanText(text);
  let pageHint: number | null = null;
  let pageToken = "";
  const pagePatterns = [
    /(\d{1,3})\s*(?:페이지|쪽|장|슬라이드|page\b|p\b|p\.)/i,
    /(?:페이지|슬라이드|page|p\.)\s*(\d{1,3})(?!\s*%)/i,
    /(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열|\d{1,3})\s*(?:번째|째)\s*(?:페이지|슬라이드|장)/,
  ];
  for (const pattern of pagePatterns) {
    const match = pattern.exec(source);
    const value = match ? ordinalValue(match[1]) : null;
    if (value && value >= 1 && value <= pageCount) { pageHint = value - 1; pageToken = match![0]; break; }
  }
  const body = pageToken ? source.replace(pageToken, " ") : source;

  const kinds = new Set<RegionKind>();
  if (/그래프|차트|도표|막대|꺾은선|원\s?그래프|파이|추이|곡선/.test(body)) kinds.add("chart");
  if (/(?:^|[^가-힣])표(?:에서|에|의|를|는|가|로)?(?:[^가-힣]|$)|행|열(?!정)|칸|셀/.test(body)) kinds.add("table");
  if (/그림|사진|이미지|캡처|스크린샷|화면|도식|다이어그램|일러스트|아이콘|로고/.test(body)) kinds.add("image");
  if (/제목|타이틀|헤드라인/.test(body)) kinds.add("title");

  const horizontal = /오른쪽|우측|오른편/.test(body) ? "right" : /왼쪽|좌측|왼편/.test(body) ? "left" : /가운데|중앙/.test(body) ? "center" : null;
  const vertical = /상단|위쪽|윗부분|맨\s?위|위에|위의|윗쪽/.test(body) ? "top" : /하단|아래쪽|아랫부분|맨\s?아래|아래에|아래의|밑에|밑의/.test(body) ? "bottom" : null;

  const ordinalMatch = /(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|\d{1,2})\s*(?:번째|째)\s*(행|줄|열|칸|항목|막대)/.exec(body);
  const ordinalN = ordinalMatch ? ordinalValue(ordinalMatch[1]) : null;
  const ordinal = ordinalMatch && ordinalN ? { n: ordinalN, axis: ordinalMatch[2] === "열" ? "column" as const : "row" as const } : null;
  if (ordinalMatch && ordinalMatch[2] !== "항목" && ordinalMatch[2] !== "막대") kinds.add("table");
  if (ordinalMatch?.[2] === "막대") kinds.add("chart");

  const numbers = [...new Set((body.match(/\d[\d,.]*\s*(?:%|퍼센트|프로|억|만|천|명|원|배|개|달러|조|점|회|년|월|시간|분)?/g) ?? [])
    .map(normalizeNumber)
    .filter((token) => token.length >= 2 || /\D/.test(token)))];

  const terms = [...new Set(body.replace(/[\d,.]+\s*(?:%|퍼센트|프로)?/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.toLowerCase())
    .map((token) => {
      if (STOPWORDS.has(token) || VERB_ENDING.test(token)) return "";
      const stripped = token.replace(PARTICLE, "");
      if (STOPWORDS.has(stripped) || VERB_ENDING.test(stripped)) return "";
      return stripped.length >= 2 ? stripped : token;
    })
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token)))];

  const deictic = /(?:^|\s)(?:여기|여기서|이거|이것|이게|저기|요기)|(?:^|\s)(?:이|저|요)\s+(?:그래프|표|그림|사진|부분|숫자|수치|구조|단계|항목|내용|장|페이지|슬라이드|도식|문장|말|거)/.test(body);
  const colorMatch = COLOR.exec(body);
  return { pageHint, kinds: [...kinds], horizontal, vertical, ordinal, numbers, terms, deictic, color: colorMatch ? colorMatch[1] : null };
}

const compact = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s,]+/g, "");

function bigrams(text: string) {
  const value = compact(text).replace(/[^\p{L}\p{N}%]/gu, "");
  const grams = new Set<string>();
  if (value.length === 1) grams.add(value);
  for (let index = 0; index < value.length - 1; index += 1) grams.add(value.slice(index, index + 2));
  return grams;
}

export function textSimilarity(a: string, b: string) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((gram) => { if (right.has(gram)) shared += 1; });
  return (2 * shared) / (left.size + right.size);
}

function termHit(term: string, regionCompact: string, regionGrams: Set<string>) {
  if (regionCompact.includes(term)) return true;
  // OCR 띄어쓰기·오탈자를 감안한 부분 일치는 한글 4자 이상만 허용한다. 영문·짧은 단어는
  // 긴 잡음 텍스트의 흔한 글자쌍과 우연히 겹치므로 정확히 포함될 때만 인정한다.
  if (!/^[가-힣]{4,}$/.test(term)) return false;
  const grams = bigrams(term);
  let shared = 0;
  grams.forEach((gram) => { if (regionGrams.has(gram)) shared += 1; });
  return shared / grams.size >= 0.75;
}

function kindScore(cues: QuestionCues, kind: RegionKind) {
  if (!cues.kinds.length) return null;
  const related: Record<RegionKind, Partial<Record<RegionKind, number>>> = {
    chart: { chart: 1, image: 0.6, caption: 0.3 }, table: { table: 1, text: 0.15 }, image: { image: 1, chart: 0.5 },
    title: { title: 1, caption: 0.5 }, text: { text: 1 }, caption: { caption: 1 },
  };
  return Math.max(...cues.kinds.map((cue) => related[cue][kind] ?? 0));
}

function positionScore(cues: QuestionCues, box: Box) {
  if (!cues.horizontal && !cues.vertical) return null;
  const { x, y } = boxCenter(box);
  const scores: number[] = [];
  if (cues.horizontal === "right") scores.push(x >= 0.55 ? 1 : x >= 0.45 ? 0.4 : 0);
  if (cues.horizontal === "left") scores.push(x <= 0.45 ? 1 : x <= 0.55 ? 0.4 : 0);
  if (cues.horizontal === "center") scores.push(Math.abs(x - 0.5) <= 0.15 ? 1 : Math.abs(x - 0.5) <= 0.25 ? 0.5 : 0);
  if (cues.vertical === "top") scores.push(y <= 0.4 ? 1 : y <= 0.55 ? 0.4 : 0);
  if (cues.vertical === "bottom") scores.push(y >= 0.6 ? 1 : y >= 0.45 ? 0.4 : 0);
  if (cues.vertical === "middle") scores.push(Math.abs(y - 0.5) <= 0.15 ? 1 : 0.3);
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

/**
 * 영역마다 글자 일치, 수치 일치, 임베딩 유사도, 종류·위치 단서를 합쳐 점수를 매긴다.
 * 질문에 페이지 번호가 있으면 그 페이지, 없으면 현재 페이지를 강하게 우선한다.
 */
export function rankPlacementRegions(input: {
  cues: QuestionCues;
  regions: PlacementRegion[];
  currentPage: number;
  embeddingSimilarity?: ReadonlyMap<string, number>;
}): RankedRegion[] {
  const { cues, regions, currentPage, embeddingSimilarity } = input;
  const embValues = embeddingSimilarity ? regions.map((region) => embeddingSimilarity.get(region.id)).filter((value): value is number => typeof value === "number") : [];
  const embMax = embValues.length ? Math.max(...embValues) : 0;
  const embMedian = embValues.length ? [...embValues].sort((a, b) => a - b)[Math.floor(embValues.length / 2)] : 0;
  const rows = regions.map((region) => {
    const regionCompact = compact(region.text);
    const regionGrams = bigrams(region.text);
    const matchedTerms = cues.terms.filter((term) => termHit(term, regionCompact, regionGrams));
    const lexical = cues.terms.length ? matchedTerms.length / cues.terms.length : 0;
    const matchedNumbers = cues.numbers.filter((token) => regionCompact.includes(compact(token)));
    const number = cues.numbers.length ? matchedNumbers.length / cues.numbers.length : null;
    const cosine = embeddingSimilarity?.get(region.id);
    // 임베딩이 있는 자료에서 글자 없는 영역(그림 등)은 의미 유사도 0으로 둔다.
    const embedding = !embValues.length ? null : typeof cosine === "number"
      ? 0.5 * (embMax > embMedian ? clamp((cosine - embMedian) / (embMax - embMedian)) : 0) + 0.5 * clamp((cosine - 0.3) / 0.4)
      : 0;
    const kind = kindScore(cues, region.kind);
    const position = positionScore(cues, region.box);
    const parts: ScoreParts = { lexical, number, embedding, kind, position };
    const size = area(region.box);
    // 단서가 없을 때는 글자가 많고 적당히 큰 본문 영역을 기본 후보로 둔다.
    const prior = region.text ? 0.25 + 0.4 * clamp([...region.text].length / 60) + 0.35 * clamp(size / 0.12) : 0.2;
    const weighted: Array<[number, number]> = [[0.1, prior]];
    if (cues.terms.length) weighted.push([0.35, lexical]);
    if (number !== null) weighted.push([0.3, number]);
    if (embedding !== null) weighted.push([0.25, embedding]);
    if (kind !== null) weighted.push([0.3, kind]);
    if (position !== null) weighted.push([0.2, position]);
    const totalWeight = weighted.reduce((sum, [weight]) => sum + weight, 0);
    let base = weighted.reduce((sum, [weight, value]) => sum + weight * value, 0) / totalWeight;
    if (size > 0.45) base -= 0.08;
    if (size < 0.0015 && !matchedTerms.length && !matchedNumbers.length) base -= 0.05;
    const content = Math.max(lexical, number ?? 0, typeof cosine === "number" ? clamp((cosine - 0.35) / 0.5) : 0);
    const strong = matchedNumbers.length > 0 || (matchedTerms.length >= 2 && lexical >= 0.6) || (typeof cosine === "number" && cosine >= 0.75);
    return { region, base, parts, matchedTerms, matchedNumbers, content, strong };
  });
  const currentContent = Math.max(0, ...rows.filter((row) => row.region.page === currentPage).map((row) => row.content));
  return rows.map(({ content, strong, ...row }) => {
    void content;
    let score = row.base;
    if (cues.pageHint !== null) score = row.region.page === cues.pageHint ? row.base + 0.15 : row.base * 0.2;
    else if (row.region.page === currentPage) score = row.base + (cues.deictic ? 0.28 : 0.18);
    // 현재 페이지에 맞는 내용이 없고 다른 페이지에 뚜렷한 근거가 있을 때만 전체 자료로 넘어간다.
    else score = cues.deictic ? row.base * 0.3 : strong && currentContent < 0.4 ? row.base + 0.12 : row.base * 0.55;
    return { ...row, score };
  }).sort((a, b) => b.score - a.score || a.region.id.localeCompare(b.region.id));
}

function clusterRows(lines: PlacementLine[]) {
  const bands: Array<{ y1: number; y2: number; lines: PlacementLine[] }> = [];
  for (const line of [...lines].sort((a, b) => a.box.y1 - b.box.y1)) {
    const band = bands.find((item) => line.box.y1 < item.y2 && line.box.y2 > item.y1);
    if (band) { band.lines.push(line); band.y1 = Math.min(band.y1, line.box.y1); band.y2 = Math.max(band.y2, line.box.y2); }
    else bands.push({ y1: line.box.y1, y2: line.box.y2, lines: [line] });
  }
  return bands.sort((a, b) => a.y1 - b.y1).map((band) => band.lines);
}

/** 영역 안에서 더 정확한 지점(수치가 적힌 줄, n번째 행)을 고르고, 없으면 영역 중앙을 쓴다. */
export function placementPoint(ranked: RankedRegion, cues: QuestionCues): Point {
  const { region } = ranked;
  let point = boxCenter(region.box);
  if (cues.ordinal && region.kind === "table" && region.lines.length) {
    if (cues.ordinal.axis === "row") {
      const rows = clusterRows(region.lines);
      const row = rows.length > cues.ordinal.n ? rows[cues.ordinal.n] : rows[Math.min(rows.length - 1, cues.ordinal.n - 1)];
      if (row) {
        const first = [...row].sort((a, b) => a.box.x1 - b.box.x1)[0];
        point = { x: boxCenter(first.box).x, y: boxCenter(first.box).y };
      }
    } else {
      const columns = [...region.lines].sort((a, b) => a.box.x1 - b.box.x1);
      const xs: number[] = [];
      for (const line of columns) if (!xs.some((x) => Math.abs(x - boxCenter(line.box).x) < 0.04)) xs.push(boxCenter(line.box).x);
      const x = xs[Math.min(xs.length - 1, cues.ordinal.n - 1)];
      if (typeof x === "number") point = { x, y: point.y };
    }
  } else if (ranked.matchedNumbers.length || ranked.matchedTerms.length) {
    const wanted = [...ranked.matchedNumbers.map(compact), ...ranked.matchedTerms];
    const best = region.lines
      .map((line) => ({ line, hits: wanted.filter((token) => compact(line.text).includes(token)).length }))
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits || area(a.line.box) - area(b.line.box))[0];
    if (best && region.lines.length > 1) point = boxCenter(best.line.box);
  }
  return { x: clamp(point.x, 0.02, 0.98), y: clamp(point.y, 0.02, 0.98) };
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["error", /오류|오타|틀린|틀렸|잘못|에러|안\s?맞|이상한|이상해|맞나요\?*$/],
  ["example", /예시|예를|사례|예로|예제|보여\s?줄/],
  ["why", /왜|이유|근거|원인|기준|어떻게\s*(?:판단|도출|측정|산출|계산|정해|나온|알|분류|선정)|어떻게\s*된|선정한|측정한/],
  ["important", /중요|시험|핵심|꼭\s?알아/],
  ["concept", /뭔가요|무엇|의미|뜻|정의|개념|차이|뭐예요|뭐에요|무슨|정확히|뭔지|란\s|이란/],
];

/** 질문 유형을 기존 강의 카테고리 중 하나로 고른다. 사용 중지된 카테고리는 고르지 않는다. */
export function inferQuestionCategory(text: string, enabled: readonly string[]) {
  const source = cleanText(text);
  for (const [key, pattern] of CATEGORY_RULES) if (enabled.includes(key) && pattern.test(source)) return key;
  return enabled.includes("concept") ? "concept" : enabled[0] ?? "concept";
}

export function findRelatedQuestions(
  text: string,
  target: { page: number; point: Point; box: Box },
  questions: readonly ExistingQuestion[],
  embeddingSimilarity?: ReadonlyMap<string, number>,
): RelatedQuestion[] {
  return questions.map((question) => {
    const similarity = textSimilarity(text, question.text);
    const semantic = embeddingSimilarity?.get(question.id) ?? 0;
    const sameArea = question.page === target.page && question.x !== null && question.y !== null
      && (boxContains(target.box, { x: question.x, y: question.y }, 0.02)
        || Math.hypot(question.x - target.point.x, question.y - target.point.y) < 0.08);
    const duplicate = similarity >= 0.72 || semantic >= 0.9 || ((similarity >= 0.45 || semantic >= 0.8) && sameArea);
    const related = duplicate || sameArea || similarity >= 0.35 || semantic >= 0.72;
    return related ? {
      id: question.id, text: question.text, page: question.page, relation: duplicate ? "duplicate" as const : "related" as const,
      similarity: Math.round(Math.max(similarity, semantic) * 100) / 100, sameArea, reactionCount: question.reactionCount, status: question.status,
    } : null;
  }).filter((item): item is RelatedQuestion => item !== null)
    .sort((a, b) => Number(b.relation === "duplicate") - Number(a.relation === "duplicate") || b.similarity - a.similarity || Number(b.sameArea) - Number(a.sameArea))
    .slice(0, 5);
}

const excerpt = (text: string) => [...text].slice(0, 80).join("") + ([...text].length > 80 ? "…" : "");

/** 순위 결과를 좌표·신뢰도·이유가 있는 배치 결정으로 바꾼다. */
export function decidePlacement(input: {
  text: string;
  cues: QuestionCues;
  ranked: RankedRegion[];
  currentPage: number;
  enabledCategories: readonly string[];
  embedding: "used" | "unavailable" | "warming";
}): PlacementDecision | null {
  const { text, cues, ranked, currentPage, enabledCategories } = input;
  const top = ranked[0];
  if (!top) return null;
  const second = ranked.slice(1).find((item) => item.region.page !== top.region.page || iou(item.region.box, top.region.box) < 0.5);
  const margin = top.score - (second?.score ?? 0);
  const embAbs = top.parts.embedding === null ? 0 : clamp(((input.embedding === "used" ? top.parts.embedding : 0) - 0.35) / 0.5);
  const content = Math.max(top.parts.lexical, top.parts.number ?? 0, embAbs);
  const cueParts = [top.parts.kind, top.parts.position].filter((value): value is number => value !== null);
  const cueFit = cueParts.length ? cueParts.reduce((sum, value) => sum + value, 0) / cueParts.length : 0;
  const sameKindOnPage = ranked.filter((item) => item.region.page === top.region.page && (item.parts.kind ?? 0) >= 0.99).length;
  const uniqueKind = cues.kinds.length > 0 && (top.parts.kind ?? 0) >= 0.99 && sameKindOnPage === 1;
  let confidence = 0.12 + 0.35 * clamp(margin / 0.18) + 0.3 * content + 0.15 * cueFit + (uniqueKind ? 0.1 : 0)
    + (cues.pageHint !== null && top.region.page === cues.pageHint ? 0.05 : 0);
  const informative = cues.terms.length > 0 || cues.numbers.length > 0 || cues.kinds.length > 0 || cues.horizontal !== null || cues.vertical !== null;
  if (!informative) confidence = Math.min(confidence, 0.35);
  if (cues.color && content < 0.5) confidence = Math.min(confidence, 0.68);
  if (cues.terms.length && !top.matchedTerms.length && !top.matchedNumbers.length && content < 0.4 && !uniqueKind) confidence = Math.min(confidence, 0.6);
  confidence = Math.round(clamp(confidence, 0.05, 0.97) * 100) / 100;

  const pageSource: PageSource = cues.pageHint !== null ? "explicit" : top.region.page === currentPage ? "current" : "search";
  const reasons: string[] = [];
  if (pageSource === "explicit") reasons.push(`질문에 적힌 ${cues.pageHint! + 1}페이지를 먼저 분석했어요.`);
  else if (pageSource === "current") reasons.push(`지금 보고 있는 ${currentPage + 1}페이지에서 찾았어요.`);
  else reasons.push(`${currentPage + 1}페이지에서 맞는 영역을 찾지 못해 전체 자료를 검색했어요 (${top.region.page + 1}페이지).`);
  if (top.matchedNumbers.length) reasons.push(`'${top.matchedNumbers.join("', '")}'가 이 영역에 있어요.`);
  if (top.matchedTerms.length) reasons.push(`'${top.matchedTerms.slice(0, 3).join("', '")}' 표현이 영역 글자와 일치해요.`);
  if ((top.parts.kind ?? 0) >= 0.99) reasons.push(`질문의 '${cues.kinds.map((kind) => REGION_KIND_LABEL[kind]).join("/")}'와 영역 종류가 같아요.`);
  if ((top.parts.position ?? 0) >= 0.99) reasons.push("질문에 나온 위치(좌우·위아래)와 맞아요.");
  if (input.embedding === "used" && (top.parts.embedding ?? 0) >= 0.8) reasons.push("의미 유사도(임베딩)가 높은 영역이에요.");
  if (cues.color) reasons.push(`색상(${cues.color})은 글자 분석으로 확인할 수 없어 위치를 한 번 확인해 주세요.`);
  if (!informative) reasons.push("질문에 위치를 특정할 단서가 적어요.");

  const candidates: PlacementDecision["candidates"] = [];
  for (const item of ranked) {
    if (candidates.length >= 3) break;
    if (candidates.some((candidate) => candidate.page === item.region.page && iou(candidate.box, item.region.box) >= 0.5)) continue;
    candidates.push({ page: item.region.page, point: placementPoint(item, cues), regionId: item.region.id, kind: item.region.kind, label: REGION_KIND_LABEL[item.region.kind], box: item.region.box, excerpt: excerpt(item.region.text), score: Math.round(item.score * 100) / 100 });
  }
  const point = placementPoint(top, cues);
  return {
    status: confidence >= AUTO_PLACEMENT_CONFIDENCE ? "auto" : "confirm",
    page: top.region.page,
    point,
    region: { id: top.region.id, kind: top.region.kind, label: REGION_KIND_LABEL[top.region.kind], box: top.region.box, excerpt: excerpt(top.region.text) },
    category: inferQuestionCategory(text, enabledCategories),
    confidence,
    pageSource,
    informative,
    reasons,
    candidates,
  };
}
