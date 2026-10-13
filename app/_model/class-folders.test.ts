import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASS_FOLDER_NAME_MAX,
  CLASS_FOLDER_DEFAULT_COLOR_INDEX,
  CLASS_FOLDER_COLOR_OPTIONS,
  CLASS_FOLDER_PURPOSES,
  classFolderColorIndexForOrder,
  normalizeClassFolderColorIndex,
  normalizeClassFolderName,
  normalizeClassFolderPurpose,
  normalizeClassFolderPurposeLabel,
  CLASS_FOLDER_PURPOSE_LABEL_MAX,
} from "./types.ts";

test("강의 폴더 이름을 trim하고 1~80자로 제한한다", () => {
  assert.equal(normalizeClassFolderName("  1주차  "), "1주차");
  assert.equal(normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX)), "가".repeat(CLASS_FOLDER_NAME_MAX));
  assert.throws(() => normalizeClassFolderName("   "));
  assert.throws(() => normalizeClassFolderName("가".repeat(CLASS_FOLDER_NAME_MAX + 1)));
});

test("저장된 폴더 색상을 유지하고 기존 무색 데이터만 순서로 보정한다", () => {
  assert.deepEqual(CLASS_FOLDER_COLOR_OPTIONS, [2, 3, 1, 5, 0]);
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => classFolderColorIndexForOrder(index)), [0, 1, 2, 3, 4, 5, 0, 1]);
  assert.equal(normalizeClassFolderColorIndex(4, 0), 4);
  assert.equal(normalizeClassFolderColorIndex(undefined, 7), 1);
  assert.equal(normalizeClassFolderColorIndex(undefined), CLASS_FOLDER_DEFAULT_COLOR_INDEX);
});

test("폴더 사용 목적은 허용값만 유지하고 기존 데이터는 Q&A로 정규화한다", () => {
  assert.deepEqual(CLASS_FOLDER_PURPOSES, ["qa", "feedback", "education", "brainstorming", "other"]);
  assert.equal(normalizeClassFolderPurpose("education"), "education");
  assert.equal(normalizeClassFolderPurpose(undefined), "qa");
  assert.equal(normalizeClassFolderPurpose("campaign"), "qa");
});

test("직접 입력한 카테고리 이름은 기타 목적에서만 trim해서 유지한다", () => {
  assert.equal(normalizeClassFolderPurposeLabel("other", "  사내 워크숍  "), "사내 워크숍");
  assert.equal(normalizeClassFolderPurposeLabel("other", "   "), null);
  assert.equal(normalizeClassFolderPurposeLabel("other", undefined), null);
  assert.equal(normalizeClassFolderPurposeLabel("education", "사내 워크숍"), null);
  assert.equal(
    normalizeClassFolderPurposeLabel("other", "가".repeat(CLASS_FOLDER_PURPOSE_LABEL_MAX + 5)),
    "가".repeat(CLASS_FOLDER_PURPOSE_LABEL_MAX)
  );
});
