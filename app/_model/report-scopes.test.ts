import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportScopes} from './report-scopes.ts';
import type {ClassSession} from './types.ts';
const session={id:'test',slides:[{id:'p0',pageIndex:0},{id:'p1',pageIndex:1},{id:'p2',pageIndex:2}],questions:[{id:'a',slideIndex:1,category:'why',status:'unanswered',text:'이유',x:.2,y:.2},{id:'b',slideIndex:1,category:'concept',status:'answered',text:'개념',x:.8,y:.8}]} as unknown as ClassSession;
test('one page appears in each question type with disjoint evidence',()=>{const scopes=reportScopes(session,[],{},'type');const why=scopes.find(s=>s.name==='근거·이유')!,concept=scopes.find(s=>s.name==='개념')!;assert.deepEqual(why.session.slides.map(s=>s.id),['p1']);assert.deepEqual(concept.session.slides.map(s=>s.id),['p1']);assert.deepEqual(why.session.questions.map(q=>q.id),['a']);assert.equal(why.session.questions[0].slideIndex,0);assert.deepEqual(concept.session.questions.map(q=>q.id),['b']);assert.equal(session.questions[0].slideIndex,1);});
test('status is question-level and includes empty pages',()=>{const scopes=reportScopes(session,[],{},'status');assert.equal(scopes.find(s=>s.name==='미답변')!.session.questions.length,1);assert.equal(scopes.find(s=>s.name==='질문 없음')!.session.slides.length,2);});
test('content scopes preserve unmatched questions without attributing them to a region',()=>{const scopes=reportScopes(session,[],{p1:[{id:'r',name:'시장',x:0,y:0,w:.5,h:.5}]},'content');assert.deepEqual(scopes.find(s=>s.name==='시장')!.session.questions.map(q=>q.id),['a']);assert.deepEqual(scopes.find(s=>s.name==='내용 미분류')!.session.questions.map(q=>q.id),['b']);});

test('SOI content grouping has four page-level scopes without duplicated slides or questions',()=>{
 const demo={...session,id:'soi-demo',slides:Array.from({length:15},(_,i)=>({id:`p${i}`,pageIndex:i})),questions:session.questions} as ClassSession;
 const regions=Object.fromEntries(demo.slides.map(slide=>[slide.id,Array.from({length:3},(_,i)=>({id:`${slide.id}-${i}`,name:`region ${slide.id} ${i}`,x:0,y:0,w:1,h:1}))]));
 const scopes=reportScopes(demo,[],regions,'content');assert.equal(scopes.length,4);
 const ids=scopes.flatMap(s=>s.session.slides.map(p=>p.id));assert.equal(ids.length,15);assert.equal(new Set(ids).size,15);
 assert.deepEqual(scopes.flatMap(s=>s.session.questions.map(q=>q.id)).sort(),['a','b']);
});
