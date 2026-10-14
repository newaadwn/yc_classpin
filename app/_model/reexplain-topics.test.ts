import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reexplainTopics} from './reexplain-topics.ts';
import type {ClassSession,Question} from './types.ts';
import type {CondensedGroup} from './question-condense.ts';
const q=(id:string,page:number,status='unanswered')=>({id,slideIndex:page,status,text:id,reactionCount:0} as Question);
const group=(rows:Question[],region:string|null=null)=>({id:rows[0].id,page:rows[0].slideIndex,questions:rows,representative:rows[0],region} as CondensedGroup);
test('TOP 3 orders by unanswered then repetition; excludes answered singleton and invalid evidence',()=>{
 const rows=[q('a',0),q('b',1),q('c',1),q('d',2,'answered'),q('e',3,'answered'),q('f',3,'answered'),q('g',4)];
 const session={slides:rows.map((_,i)=>({id:String(i)})),questions:rows} as ClassSession;
 const result=reexplainTopics(session,[group([rows[0]]),group(rows.slice(1,3)),group([rows[3]]),group(rows.slice(4,6)),group([rows[6]]),group([q('phantom',0)])],{});
 assert.deepEqual(result.map(t=>t.page),[1,0,4]);assert.equal(result[0].repeated,1);assert.equal(result[0].pending,2);
 assert.deepEqual(reexplainTopics({...session,questions:[]},[group(rows)],{}),[]);
});
test('unlabelled groups are not falsely combined; duplicate source questions count once',()=>{
 const rows=[q('a',0),q('b',0)];const session={slides:[{id:'s'}],questions:rows} as ClassSession;
 assert.equal(reexplainTopics(session,[group([rows[0]]),group([rows[1]])],{}).length,2);
 const ranked=reexplainTopics(session,[group(rows,'region'),group(rows,'region')],{s:[{id:'region',name:'핵심 개념',x:0,y:0,w:1,h:1}]});
 assert.equal(ranked.length,1);assert.equal(ranked[0].questions.length,2);assert.equal(ranked[0].label,'핵심 개념');
});
