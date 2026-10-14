import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportScopes,contentCanvasRows} from './report-scopes.ts';
import type {ClassSession} from './types.ts';
const session={id:'test',slides:[{id:'p0',pageIndex:0},{id:'p1',pageIndex:1},{id:'p2',pageIndex:2}],questions:[{id:'a',slideIndex:1,category:'why',status:'unanswered',text:'이유',x:.2,y:.2},{id:'b',slideIndex:1,category:'concept',status:'answered',text:'개념',x:.8,y:.8}]} as unknown as ClassSession;
test('one page appears in each question type with disjoint evidence',()=>{const scopes=reportScopes(session,[],{},'type');const why=scopes.find(s=>s.name==='근거·이유')!,concept=scopes.find(s=>s.name==='개념')!;assert.deepEqual(why.session.slides.map(s=>s.id),['p1']);assert.deepEqual(concept.session.slides.map(s=>s.id),['p1']);assert.deepEqual(why.session.questions.map(q=>q.id),['a']);assert.equal(why.session.questions[0].slideIndex,0);assert.deepEqual(concept.session.questions.map(q=>q.id),['b']);assert.equal(session.questions[0].slideIndex,1);});
test('status is question-level and includes empty pages',()=>{const scopes=reportScopes(session,[],{},'status');assert.equal(scopes.find(s=>s.name==='미답변')!.session.questions.length,1);assert.equal(scopes.find(s=>s.name==='질문 없음')!.session.slides.length,2);});
test('content scopes preserve unmatched questions without attributing them to a region',()=>{const scopes=reportScopes(session,[],{p1:[{id:'r',name:'시장',x:0,y:0,w:.5,h:.5}]},'content');assert.deepEqual(scopes.find(s=>s.name==='시장')!.session.questions.map(q=>q.id),['a']);assert.deepEqual(scopes.find(s=>s.name==='내용 미분류')!.session.questions.map(q=>q.id),['b']);});

test('preserves categories and evidence while rendering each page once',()=>{
 const scopes=reportScopes(session,[],{p1:[{id:'r1',name:'A',x:0,y:0,w:.5,h:.5},{id:'r2',name:'B',x:.5,y:.5,w:.5,h:.5}]},'content');
 const before=JSON.stringify(scopes),rows=contentCanvasRows(scopes);
 assert.equal(new Set(rows.map(r=>r.bucket)).size,scopes.length);
 const slides=rows.filter(r=>r.slideId).map(r=>r.slideId);
 assert.equal(slides.length,3);assert.equal(new Set(slides).size,3);assert.equal(JSON.stringify(scopes),before);
 assert.deepEqual(scopes.flatMap(s=>s.session.questions.map(q=>q.id)).sort(),['a','b']);
});

test('SOI slides use broad page topics, preserving all 15 pages and questions once',()=>{
 const demo={...session,id:'soi-demo',slides:Array.from({length:15},(_,i)=>({id:`p${i}`,pageIndex:i}))} as ClassSession;
 const sectors=Object.fromEntries(demo.slides.map(s=>[s.id,Array.from({length:3},(_,i)=>({id:`r${i}`,name:`${s.id}-region-${i}`,x:0,y:0,w:1,h:1}))]));
 const scopes=reportScopes(demo,[],sectors,'content');assert.equal(scopes.length,4);
 assert.equal(scopes.flatMap(s=>s.session.slides).length,15);assert.equal(new Set(contentCanvasRows(scopes).map(r=>r.slideId)).size,15);
 assert.deepEqual(scopes.flatMap(s=>s.session.questions.map(q=>q.id)).sort(),['a','b']);
});
