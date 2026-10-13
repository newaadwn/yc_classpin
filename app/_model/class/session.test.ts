import assert from "node:assert/strict";
import test from "node:test";
import { defaultQuestionCategorySettings, type ClassSession } from "../types.ts";
import { normalizeSessions } from "./session.ts";

const session = (id: string): ClassSession => ({
  id,
  folderId: null,
  code: id,
  title: id,
  fileName: `${id}.pdf`,
  status: "live",
  currentSlide: 0,
  presentationInteractions: true, presentationAutoplay: false,
  showQuestionPins: true,
  showPresentationQr: true,
  presentationQrPosition: "bottom-right",
  questionCategories: defaultQuestionCategorySettings(),
  createdAt: "2026-08-29T00:00:00.000Z",
  slides: [],
  questions: []
});

test("세션 중복을 제거하고 이미 정규화된 배열은 그대로 반환한다", () => {
  const list = [session("one")];
  assert.equal(normalizeSessions(list), list);
  assert.deepEqual(normalizeSessions([list[0], session("one"), session("two")]).map(({ id }) => id), ["one", "two"]);
});
