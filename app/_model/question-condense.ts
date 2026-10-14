import type { Question } from "./types.ts";
import type { QuestionGroup, Triage } from "./question-groups.ts";
import {classifyQuestionRule} from './section-questions.ts';

/**
 * 질문 축약(condense): 같은 페이지의 질문을 규칙 → 의미 유사도 순서로 접어 "묶음"을 만든다.
 * 원문은 수정·삭제하지 않고 연결만 계산한다. 결과는 AI 요약이 아니라 표시용 제안이다.
 *
 * 1단계 규칙 접기 (모델 없음)
 *  - 같은 페이지, 정규화한 문구가 같으면 한 묶음. 데모 접두어 "[가상 청중 3 · 2번째 질문]"은 뗀다.
 *  - 내용 단어가 없는 일반 요청("이 부분이 잘 이해되지 않아요", "근거를 설명해 주세요")은
 *    같은 페이지 · 같은 영역 · 같은 의도(혼란/근거/예시/개념)면 문구가 달라도 한 묶음(신호)으로 접는다.
 *    영역 정보가 없으면 가까운 핀(0.06)끼리만 접는다.
 * 2단계 의미 묶기 (서버가 준 임베딩 유사도)
 *  - 내용이 있는 묶음끼리만, 모든 쌍이 임계값 이상일 때(완전 연결) 합친다. 연쇄 병합은 하지 않는다.
 *  - 같은 영역·질문 유형 안에서만 병합한다. 영역이 확정됐으면 0.82, 영역 미지정이면 0.90 이상.
 *  - 강사가 "따로 보기"(triage.separate)한 원문은 언제나 단독이다.
 */
export type SimilarityEdge = [a: string, b: string, similarity: number];
export type CondenseIntent = "confusion" | "why" | "example" | "concept" | "other";
export type CondenseKind = "single" | "exact" | "signal" | "semantic";
export type CondensedGroup = QuestionGroup & {
  page: number;
  /** 강사에게 먼저 보여 줄 문장. 의미 묶음은 다른 원문과 가장 비슷한 문장, 그 밖에는 가장 오래된 문장. */
  representative: Question;
  kind: CondenseKind;
  intent: CondenseIntent;
  /** 묶음 안에서 가장 낮은 쌍 유사도. 의미 묶음에만 있다. */
  minSimilarity?: number;
  region: string | null;
};
export type CondenseOptions = {
  triage?: readonly Triage[];
  edges?: readonly SimilarityEdge[];
  /** 핀이 속한 영역의 안정적인 키(섹션 id). 모르면 null. */
  regionOf?: (question: Question) => string | null;
  strong?: number;
  contextual?: number;
};

const DEMO_PREFIX = /^\[[^\]]{1,60}\]\s*/u;
const TRAILING = /[\s?!.。！？~…]+$/gu;
const PAGE_MENTION = /(\d+)\s*(?:페이지|쪽|page)/giu;
const NEAR_PIN = 0.06;

export const stripDemoPrefix = (text: string) => text.replace(DEMO_PREFIX, "");
/** 표시·비교용 정규화: 접두어·끝 문장부호 제거, NFKC, 소문자, 공백 정리. */
export const normalizeQuestionText = (text: string) => stripDemoPrefix(text).normalize("NFKC").toLowerCase().replace(TRAILING, "").replace(/\s+/gu, " ").trim();
/** 묶음 키: 띄어쓰기 차이("안돼요"/"안 돼요")까지 무시한다. */
export const questionKey = (text: string) => normalizeQuestionText(text).replace(/\s+/gu, "");

// 일반 요청에 흔히 쓰이는 낱말(어간)과 조사·어미. 한 낱말이 어간 + 조사/어미로만 이뤄지면 내용 단어가 아니라고 본다.
const STEMS = ["이거", "이것", "이건", "이게", "그거", "그것", "그게", "저거", "저게", "여기", "여긴", "거기", "이", "그", "저", "그런", "그렇", "이런", "저런", "부분", "내용", "개념", "주장", "근거", "이유", "예시", "예", "사례", "설명", "정의", "의미", "뜻", "결론", "앞", "뒤", "위", "아래", "다시", "한번", "한", "번", "더", "좀", "잘", "왜", "어떻게", "무엇", "뭐", "뭔가", "뭔지", "어떤", "무슨", "어느", "어디", "언제", "누가", "같", "모르", "이해", "안", "않", "못", "연결", "궁금", "알려", "알고", "알", "싶", "것", "거", "게", "건", "수", "번째", "가상", "청중", "질문", "구체적", "자세히", "정확히", "조금", "아직", "혹시", "그냥", "이렇게", "그렇게", "계속", "전체", "다", "또", "그리고", "근데", "그런데", "그럼", "그러면", "말", "말씀", "의도", "목적", "방법", "전", "후", "때", "경우", "차이", "관계", "부분", "쪽", "곳", "점"];
const PARTICLE = "은|는|이|가|을|를|의|에|에서|과|와|도|로|으로|만|들|요|께|한테|이라도|라도|인|적|적인|이란|란|이라는|라는";
const ENDING = "되지|되는지|되나요|되었나요|되었는지|됐는지|돼요|됩니다|되요|되면|해서|해요|해|하는|한|할|하나요|합니다|해주세요|주세요|주실|주시면|주시나요|드려요|드립니다|들어|있나요|있을까요|있는지|있어요|없나요|없는지|없어요|않아요|않나요|않는지|않아|겠어요|겠습니다|어요|아요|예요|에요|이에요|네요|나요|가요|까요|인가요|건가요|일까요|는지|는데|던데|죠|야|요|다|라|서|고";
const GENERIC_TOKEN = new RegExp(`^(?:${STEMS.join("|")})?(?:${PARTICLE}|${ENDING})*$`, "u");
const TOKEN_CLEAN = /[^a-z0-9가-힣%]/gu;

/** 내용 단어(고유 명사·숫자·주제어) 없이 요청만 있는 질문인지. */
export function isGenericQuestion(text: string) {
  const base = normalizeQuestionText(text);
  if (!base) return true;
  if (/\d/u.test(base) || /[a-z]{2,}/u.test(base)) return false;
  return base.split(" ").every((raw) => { const token = raw.replace(TOKEN_CLEAN, ""); return !token || GENERIC_TOKEN.test(token); });
}

/** 문구와 카테고리에서 요청 의도를 읽는다. 문구가 우선이고, 없으면 참여자가 고른 카테고리. */
export function questionIntent(question: Pick<Question, "text" | "category">): CondenseIntent {
  const base = normalizeQuestionText(question.text);
  if (/(근거|이유|왜|출처|증거)/u.test(base)) return "why";
  if (/(예시|사례|예를)/u.test(base)) return "example";
  if (/(개념|정의|의미|뜻|무엇|뭐예요|뭔가요)/u.test(base)) return "concept";
  if (/(모르겠|이해|어렵|헷갈|다시 설명|다시 한번|한 번 더|연결)/u.test(base)) return "confusion";
  if (question.category === "confusing") return "confusion";
  if (question.category === "why" || question.category === "example" || question.category === "concept") return question.category;
  return "other";
}

const INTENT_LABEL: Record<CondenseIntent, string> = { confusion: "이해 어려움 신호", why: "근거 요청", example: "예시 요청", concept: "개념 설명 요청", other: "일반 요청" };

const byAge = (a: Question, b: Question) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const hasPin = (q: Question) => q.x !== null && q.y !== null;
const near = (a: Question, b: Question) => hasPin(a) && hasPin(b) && Math.hypot(a.x! - b.x!, a.y! - b.y!) <= NEAR_PIN;
const pageConflict = (q: Question) => [...q.text.matchAll(PAGE_MENTION)].some((match) => Number(match[1]) - 1 !== q.slideIndex);
const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

type Draft = { questions: Question[]; kind: CondenseKind; intent: CondenseIntent; region: string | null; generic: boolean; locked: boolean; minSimilarity?: number };

export function condenseQuestions(questions: readonly Question[], options: CondenseOptions = {}): CondensedGroup[] {
  const { triage = [], edges = [], regionOf = () => null, strong = 0.9, contextual = 0.82 } = options;
  const separate = new Set(triage.filter((row) => row.separate).map((row) => row.question_id));
  const similarity = new Map(edges.map(([a, b, value]) => [pairKey(a, b), value]));
  const sim = (a: Question, b: Question) => similarity.get(pairKey(a.id, b.id)) ?? 0;
  const ordered = [...questions].sort(byAge);
  const drafts: Draft[] = [];

  // 1단계: 규칙 접기 — 같은 페이지 안에서 완전 연결로 묶는다.
  for (const question of ordered) {
    const generic = isGenericQuestion(question.text);
    const intent = questionIntent(question);
    const region = regionOf(question);
    const locked = separate.has(question.id) || !hasPin(question) || pageConflict(question);
    const key = questionKey(question.text);
    const compatible = (draft: Draft) => {
      if (draft.locked || locked || draft.questions[0].slideIndex !== question.slideIndex) return false;
      if (draft.region !== region || classifyQuestionRule(draft.questions[0].text) !== classifyQuestionRule(question.text)) return false;
      if (draft.generic !== generic) return false;
      if (generic) {
        if (draft.intent !== intent) return false;
        if (draft.region && region) return draft.region === region;
        if (draft.region || region) return false;
        return draft.questions.every((member) => near(member, question));
      }
      return draft.questions.every((member) => questionKey(member.text) === key);
    };
    const home = drafts.find(compatible);
    if (home) {
      home.questions.push(question);
      if (home.questions.length > 1) home.kind = generic ? "signal" : "exact";
      continue;
    }
    drafts.push({ questions: [question], kind: "single", intent, region, generic, locked });
  }

  // 2단계: 의미 묶기 — 내용이 있는 묶음끼리, 모든 쌍이 임계값 이상일 때만 합친다 (가장 비슷한 쌍부터).
  const mergeable = (a: Draft, b: Draft) => {
    if (a.locked || b.locked || a.generic || b.generic || a.questions[0].slideIndex !== b.questions[0].slideIndex) return null;
    if (a.region !== b.region || classifyQuestionRule(a.questions[0].text) !== classifyQuestionRule(b.questions[0].text)) return null;
    let min = Infinity;
    for (const x of a.questions) for (const y of b.questions) min = Math.min(min, sim(x, y));
    if (min >= strong) return min;
    if (min >= contextual && a.region && a.region === b.region) return min;
    return null;
  };
  for (;;) {
    let best: { a: number; b: number; min: number } | null = null;
    for (let i = 0; i < drafts.length; i += 1) for (let j = i + 1; j < drafts.length; j += 1) {
      const min = mergeable(drafts[i], drafts[j]);
      if (min !== null && (!best || min > best.min)) best = { a: i, b: j, min };
    }
    if (!best) break;
    const target = drafts[best.a], source = drafts[best.b];
    target.questions = [...target.questions, ...source.questions].sort(byAge);
    target.kind = "semantic";
    target.minSimilarity = Math.min(best.min, target.minSimilarity ?? Infinity, source.minSimilarity ?? Infinity);
    if (target.region !== source.region) target.region = null;
    drafts.splice(best.b, 1);
  }

  return drafts.map((draft) => {
    const members = draft.questions;
    let representative = members[0];
    if (draft.kind === "semantic") {
      const score = (q: Question) => members.reduce((sum, other) => sum + (other === q ? 0 : sim(q, other)), 0);
      representative = [...members].sort((a, b) => score(b) - score(a) || byAge(a, b))[0];
    }
    const first = members[0];
    const reason = draft.locked
      ? separate.has(first.id) ? "따로 보기" : !hasPin(first) ? "위치 미확정" : "질문에 적힌 페이지와 핀 위치가 달라 확인 필요"
      : draft.kind === "exact" ? "동일 문구"
      : draft.kind === "signal" ? `같은 영역 · ${INTENT_LABEL[draft.intent]} ${members.length}건`
      : draft.kind === "semantic" ? `의미 유사 · 최소 ${Math.round((draft.minSimilarity ?? 0) * 100)}%`
      : draft.generic ? `${INTENT_LABEL[draft.intent]} · 단독` : "단독";
    return {
      id: first.id, questions: members, reactions: members.reduce((sum, q) => sum + q.reactionCount, 0), reason,
      page: first.slideIndex, representative, kind: draft.kind, intent: draft.intent, minSimilarity: draft.minSimilarity, region: draft.region,
    };
  });
}

/** 서버에 임베딩을 맡길 문장: 내용 단어가 있는 질문만, 같은 문구는 한 번만. */
export function embeddingCandidates(questions: readonly Question[]) {
  const seen = new Set<string>();
  const rows: Array<{ id: string; text: string; page: number }> = [];
  for (const question of [...questions].sort(byAge)) {
    const text = normalizeQuestionText(question.text);
    if (!text || isGenericQuestion(question.text)) continue;
    const key = `${question.slideIndex}:${questionKey(question.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: question.id, text, page: question.slideIndex });
  }
  return rows;
}

/** 서버는 같은 문구 중 대표 id 하나만 비교하므로, 그 유사도를 같은 문구의 모든 원문 쌍에 펼친다. */
export function expandEdges(questions: readonly Question[], edges: readonly SimilarityEdge[]): SimilarityEdge[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const members = new Map<string, string[]>();
  for (const q of questions) {
    const key = `${q.slideIndex}:${questionKey(q.text)}`;
    members.set(key, [...(members.get(key) ?? []), q.id]);
  }
  const keyOf = (id: string) => { const q = byId.get(id); return q ? `${q.slideIndex}:${questionKey(q.text)}` : null; };
  const result: SimilarityEdge[] = [];
  for (const [a, b, value] of edges) {
    const ka = keyOf(a), kb = keyOf(b);
    if (!ka || !kb) continue;
    for (const x of members.get(ka) ?? []) for (const y of members.get(kb) ?? []) if (x !== y) result.push([x, y, value]);
  }
  return result;
}
