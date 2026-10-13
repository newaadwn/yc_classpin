import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionInsights, groupQuestionsBySlide, summarizeFolders } from "./stats.ts";
import type { ClassFolder, ClassSession, Question } from "./types.ts";

const question = (id: string, slideIndex: number, status: Question["status"], createdAt: string): Question => ({
  id,
  sessionId: "session-1",
  slideIndex,
  x: slideIndex === 0 ? 0.5 : null,
  y: slideIndex === 0 ? 0.5 : null,
  category: slideIndex === 0 ? "concept" : "custom-speed",
  marker: "pin",
  text: id,
  status,
  isMine: false,
  reactionCount: 0,
  reactedByMe: false,
  createdAt
});

const sessions = [{
  id: "session-1",
  folderId: "folder-1",
  code: "PIN001",
  title: "React",
  fileName: "react.pdf",
  status: "live",
  currentSlide: 0,
  presentationInteractions: true, presentationAutoplay: false,
  showQuestionPins: true,
  showPresentationQr: true,
  presentationQrPosition: "bottom-right",
  createdAt: "2026-08-03T00:00:00.000Z",
  slides: [
    { id: "slide-1", pageIndex: 0, title: "첫 장" },
    { id: "slide-2", pageIndex: 1, title: "둘째 장" }
  ],
  questions: [
    question("old", 0, "resolved", "2026-08-01T00:00:00.000Z"),
    question("new", 1, "unanswered", "2026-08-02T00:00:00.000Z")
  ],
  questionCategories: {
    concept: { label: "개념", enabled: true, archived: false },
    "custom-speed": { label: "속도", enabled: true, archived: false }
  }
}] as ClassSession[];

test("폴더·슬라이드·인사이트를 반환량에 선형인 단일 인덱스로 집계한다", () => {
  const folders = [{ id: "folder-1", name: "프런트엔드", createdAt: "2026-08-01T00:00:00.000Z", purpose: "qa", colorIndex: 1 }] satisfies ClassFolder[];
  const unfiled = { id: "unfiled", name: "미분류", createdAt: "", purpose: "qa", colorIndex: 2 } satisfies ClassFolder;

  assert.deepEqual(groupQuestionsBySlide(sessions[0].questions).get(0)?.map(({ id }) => id), ["old"]);
  assert.deepEqual(summarizeFolders(folders, sessions, unfiled), [{
    ...folders[0],
    materialCount: 1,
    slideCount: 2,
    questionCount: 2,
    cover: sessions[0].slides[0],
    updatedAt: sessions[0].createdAt
  }, {
    ...unfiled,
    materialCount: 0,
    slideCount: 0,
    questionCount: 0,
    updatedAt: null
  }]);

  const insights = buildSessionInsights(sessions, (category) => category);
  assert.equal(insights.unanswered, 1);
  assert.equal(insights.resolved, 1);
  assert.equal(insights.pinRate, 50);
  assert.equal(insights.resolveRate, 50);
  assert.deepEqual(insights.hotspots.map(({ slideIndex, count }) => [slideIndex, count]), [[0, 1], [1, 1]]);
  assert.deepEqual(insights.categories.map(({ key, label, count }) => [key, label, count]), [
    ["concept", "개념", 1],
    ["custom-speed", "속도", 1]
  ]);
  assert.deepEqual(insights.openQuestions.map(({ question: item }) => item.id), ["new"]);
});
