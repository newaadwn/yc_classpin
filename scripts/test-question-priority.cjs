const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const m={};new Function('exports',ts.transpileModule(fs.readFileSync('app/_model/question-priority.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m);
const make=(id,n,reactions,time,status='unanswered')=>({id,questions:Array.from({length:n},()=>({original:{status,reactionCount:reactions,createdAt:time}}))});
const groups=[make('a',2,0,'2026-01-01'),make('b',2,1,'2026-01-02'),make('c',1,10,'2026-01-03'),make('done',8,30,'2026-01-01','resolved')];
assert.deepEqual(m.rankQuestionClusters(groups,'priority').map(r=>r.group.id),['b','a','c']);
assert.equal(m.rankQuestionClusters(groups,'reactions')[0].group.id,'c');
assert.equal(m.rankQuestionClusters(groups,'latest')[0].group.id,'c');
assert.equal(m.rankQuestionClusters(groups,'count')[0].group.id,'a');
assert.equal(m.rankQuestionClusters([],'priority').length,0);console.log('PASS ranking, tie breaks, completed exclusion, empty state');
