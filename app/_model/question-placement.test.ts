import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlacementRegions, decidePlacement, findRelatedQuestions, inferQuestionCategory, parseQuestionCues, placementPoint, rankPlacementRegions,
  type PlacementRegion,
} from "./question-placement.ts";

const box = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });
const categories = ["concept", "why", "example", "error", "important"];

// page 0: title + text / page 2: title, left text, right chart with 67% / page 4: table with header and rows
const deck: PlacementRegion[] = [
  ...buildPlacementRegions(0, [
    { alias: "O1", bboxNorm: box(0.05, 0.05, 0.3, 0.1), textRedacted: "서비스 소개" },
    { alias: "O2", bboxNorm: box(0.1, 0.4, 0.6, 0.45), textRedacted: "친구들과 사진으로 대화하는 앱" },
  ], [
    { alias: "R1", label: "paragraph_title", bboxNorm: box(0.04, 0.04, 0.32, 0.11) },
    { alias: "R2", label: "text", bboxNorm: box(0.08, 0.38, 0.62, 0.47) },
  ]),
  ...buildPlacementRegions(2, [
    { alias: "O1", bboxNorm: box(0.05, 0.05, 0.3, 0.1), textRedacted: "사용자 Pain Point" },
    { alias: "O2", bboxNorm: box(0.9, 0.02, 0.97, 0.06), textRedacted: "soi" },
    { alias: "O3", bboxNorm: box(0.1, 0.3, 0.4, 0.35), textRedacted: "관계 스트레스 증가" },
    { alias: "O4", bboxNorm: box(0.7, 0.3, 0.8, 0.34), textRedacted: "33% 넓은 인간관계" },
    { alias: "O5", bboxNorm: box(0.7, 0.45, 0.8, 0.5), textRedacted: "67% 깊은 인간관계" },
    { alias: "O6", bboxNorm: box(0.94, 0.94, 0.96, 0.97), textRedacted: "3" },
  ], [
    { alias: "R1", label: "paragraph_title", bboxNorm: box(0.04, 0.04, 0.32, 0.11) },
    { alias: "R2", label: "header", bboxNorm: box(0.04, 0.04, 0.32, 0.11) },
    { alias: "R3", label: "header", bboxNorm: box(0.88, 0.01, 0.98, 0.07) },
    { alias: "R4", label: "text", bboxNorm: box(0.08, 0.28, 0.42, 0.37) },
    { alias: "R5", label: "chart", bboxNorm: box(0.6, 0.25, 0.95, 0.6) },
    { alias: "R6", label: "number", bboxNorm: box(0.93, 0.93, 0.97, 0.98) },
  ]),
  ...buildPlacementRegions(4, [
    { alias: "O1", bboxNorm: box(0.5, 0.2, 0.6, 0.24), textRedacted: "A사" },
    { alias: "O2", bboxNorm: box(0.7, 0.21, 0.8, 0.25), textRedacted: "B사" },
    { alias: "O3", bboxNorm: box(0.3, 0.3, 0.45, 0.34), textRedacted: "가격 정책" },
    { alias: "O4", bboxNorm: box(0.3, 0.4, 0.45, 0.44), textRedacted: "사용자 규모" },
    { alias: "O5", bboxNorm: box(0.3, 0.5, 0.45, 0.54), textRedacted: "지원 언어" },
  ], [
    { alias: "R1", label: "table", bboxNorm: box(0.28, 0.18, 0.9, 0.6) },
  ]),
];

const decide = (text: string, currentPage: number) => {
  const cues = parseQuestionCues(text, 6);
  const ranked = rankPlacementRegions({ cues, regions: deck, currentPage });
  return { cues, ranked, decision: decidePlacement({ text, cues, ranked, currentPage, enabledCategories: categories, embedding: "unavailable" })! };
};

test("question cues read explicit pages, element types, positions, ordinals, numbers and keep only content terms", () => {
  assert.equal(parseQuestionCues("3페이지의 오른쪽 그래프에서 67%가 나온 이유가 궁금합니다.", 15).pageHint, 2);
  assert.equal(parseQuestionCues("p.4 에 있는 내용", 15).pageHint, 3);
  assert.equal(parseQuestionCues("세 번째 페이지 표", 15).pageHint, 2);
  assert.equal(parseQuestionCues("슬라이드 12 제목", 15).pageHint, 11);
  assert.equal(parseQuestionCues("30페이지 그래프", 15).pageHint, null, "pages outside the deck are ignored");
  const cues = parseQuestionCues("3페이지의 오른쪽 그래프에서 67 퍼센트가 나온 이유가 궁금합니다.", 15);
  assert.deepEqual([cues.kinds, cues.horizontal, cues.numbers, cues.terms], [["chart"], "right", ["67%"], []]);
  const table = parseQuestionCues("이 표의 두 번째 행은 어떤 기준으로 분류된 건가요?", 15);
  assert.deepEqual([table.kinds, table.ordinal, table.deictic, table.terms], [["table"], { n: 2, axis: "row" }, true, []]);
  const painPoint = parseQuestionCues("여기서 말하는 사용자 Pain Point가 정확히 뭔가요?", 15);
  assert.deepEqual([painPoint.terms, painPoint.deictic], [["사용자", "pain", "point"], true]);
  assert.equal(parseQuestionCues("이 그래프에서 파란색 부분이 의미하는 게 뭔가요?", 15).color, "파란");
  assert.deepEqual(parseQuestionCues("깊은 인간관계와 넓은 인간관계의 차이가 무엇일까요?", 15).terms, ["깊은", "인간관계", "넓은", "차이"]);
});

test("regions merge OCR lines into the smallest layout block and drop headers, page numbers and duplicate boxes", () => {
  const page = deck.filter((region) => region.page === 2);
  assert.deepEqual(page.map((region) => [region.id, region.kind]), [["P3-R5", "chart"], ["P3-R1", "title"], ["P3-R4", "text"]]);
  assert.equal(page.find((region) => region.kind === "chart")!.text, "33% 넓은 인간관계 67% 깊은 인간관계");
  assert.ok(!page.some((region) => region.text.includes("soi") || region.text === "3"));
  const loose = buildPlacementRegions(0, [{ alias: "X", bboxNorm: box(0.1, 0.8, 0.3, 0.85), textRedacted: "각주 문장" }], []);
  assert.deepEqual(loose.map((region) => [region.id, region.kind, region.text]), [["P1-OX", "text", "각주 문장"]]);
});

test("explicit page numbers override the current page and numbers pin the exact line", () => {
  const { decision } = decide("3페이지의 오른쪽 그래프에서 67%가 나온 이유가 궁금합니다.", 0);
  assert.equal(decision.status, "auto");
  assert.deepEqual([decision.page, decision.region.id, decision.pageSource, decision.category], [2, "P3-R5", "explicit", "why"]);
  assert.ok(Math.abs(decision.point.y - 0.475) < 0.01, "point moves to the line that contains 67%");
  assert.ok(decision.confidence >= 0.9);
});

test("the current page wins without a page number; other pages need strong evidence and a weak current page", () => {
  const here = decide("여기서 말하는 사용자 Pain Point가 정확히 뭔가요?", 2);
  assert.deepEqual([here.decision.page, here.decision.region.id, here.decision.category], [2, "P3-R1", "concept"]);
  const vagueElsewhere = decide("사용자 규모가 궁금해요", 0);
  assert.equal(vagueElsewhere.decision.page, 4, "two matching words find the table on another page");
  assert.equal(vagueElsewhere.decision.pageSource, "search");
  const deictic = decide("이 부분의 사용자 규모가 궁금해요", 0);
  assert.equal(deictic.decision.page, 0, "'이 부분' keeps the question on the current page");
});

test("questions without location clues ask for confirmation instead of guessing", () => {
  const { decision } = decide("근거가 부족한 거 같아요", 2);
  assert.equal(decision.status, "confirm");
  assert.ok(decision.confidence <= 0.35);
  assert.ok(decision.reasons.some((reason) => reason.includes("단서가 적어요")));
  assert.equal(decision.informative, false, "no clue → the LLM refine step is skipped");
  const color = decide("이 그래프에서 파란색 부분이 의미하는 게 뭔가요?", 2).decision;
  assert.equal(color.region.kind, "chart");
  assert.equal(color.status, "confirm", "colors cannot be verified from OCR text");
  assert.equal(color.informative, true, "an element type is a clue worth a second look");
});

test("table ordinals point to the n-th data row below the header", () => {
  const { ranked, cues, decision } = decide("이 표의 두 번째 행은 어떤 기준으로 분류된 건가요?", 4);
  assert.equal(decision.region.kind, "table");
  const point = placementPoint(ranked[0], cues);
  assert.ok(Math.abs(point.y - 0.42) < 0.01, `expected the '사용자 규모' row, got ${point.y}`);
});

test("categories follow question intent but only among enabled categories", () => {
  assert.equal(inferQuestionCategory("67%가 나온 이유가 궁금합니다", categories), "why");
  assert.equal(inferQuestionCategory("예시를 보여줄 수 있나요", categories), "example");
  assert.equal(inferQuestionCategory("숫자가 틀린 것 같아요", categories), "error");
  assert.equal(inferQuestionCategory("67%가 나온 이유가 궁금합니다", ["concept", "example"]), "concept");
  assert.equal(inferQuestionCategory("그냥 의견", ["custom-a"]), "custom-a");
});

test("related questions separate duplicates from same-area questions", () => {
  const related = findRelatedQuestions("67%는 어떻게 나온 건가요?", { page: 2, point: { x: 0.75, y: 0.47 }, box: box(0.6, 0.25, 0.95, 0.6) }, [
    { id: "a", text: "67%는 어떻게 나온 건가요?", page: 2, x: 0.2, y: 0.9, status: "unanswered", reactionCount: 3 },
    { id: "b", text: "표본은 몇 명인가요", page: 2, x: 0.7, y: 0.4, status: "unanswered", reactionCount: 0 },
    { id: "c", text: "팀 소개 부탁드려요", page: 0, x: 0.5, y: 0.5, status: "answered", reactionCount: 0 },
  ]);
  assert.deepEqual(related.map((item) => [item.id, item.relation]), [["a", "duplicate"], ["b", "related"]]);
});
