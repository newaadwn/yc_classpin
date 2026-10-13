/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node CommonJS test runner */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
  return exports;
}
const { spatialPinGroups } = load('app/_model/spatial-pin-groups.ts');
const { condenseQuestions } = load('app/_model/question-condense.ts');
const q = (id, x, text = '모르겠어요', extra = {}) => ({id, x, y:.5, text, slideIndex:0, category:'confusing', createdAt:id, reactionCount:0, ...extra});
const input = [q('a',.1),q('b',.15),q('c',.2),q('d',null),q('e',.1,'다른 페이지',{slideIndex:1})];
const before = JSON.stringify(input);
const groups = spatialPinGroups(input,1000,500);
assert.deepEqual(groups.map(g=>g.questions.map(q=>q.id)),[['a','b'],['c'],['e']]);
assert.equal(JSON.stringify(input),before);
assert.equal(spatialPinGroups(input,2000,1000).length,4);
assert.equal(spatialPinGroups([q('a',.2,'x',{anchorKind:'box'}),q('b',NaN)],1000,500).length,0);
const mixed = [q('a',.1),q('b',.11,'이해가 안 돼요'),q('c',.12,'안녕하세요')];
const summaries = condenseQuestions(mixed,{regionOf:()=> 'cluster'});
assert.equal(summaries.length,2);
assert.deepEqual(summaries.map(g=>g.questions.length),[2,1]);
const semantic = [q('a',.1,'시장 규모 산출 방법이 궁금합니다'),q('b',.12,'시장 크기는 어떻게 계산했나요'),q('c',.13,'데이터 출처가 어디인가요')];
const result = condenseQuestions(semantic,{regionOf:()=> 'cluster',edges:[['a','b',.95],['b','c',.4],['a','c',.3]]});
assert.deepEqual(result.map(g=>g.questions.length),[2,1]);
assert.equal(result.flatMap(g=>g.questions).length,3);
console.log('PASS: proximity, no chaining, page isolation, resizing, immutable anchors, mixed meanings, semantic edges');
