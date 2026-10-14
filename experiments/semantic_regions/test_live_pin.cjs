const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const m={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/_model/live-pin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m});
const q=(id,slideIndex,reactionCount,category='why',status='unanswered')=>({id,slideIndex,reactionCount,category,status,createdAt:`2026-09-11T00:00:0${id}Z`,text:'test',x:.2,y:.3});
test('importance respects explicit mark, unanswered, empathy and age without losing other slides',()=>{
 const rows=[q('1',8,0,'important','answered'),q('2',0,0,'important'),q('3',0,10),q('4',0,99,'why','answered'),q('5',0,10)];
 const before=JSON.stringify(rows);
 assert.equal(m.sortedLivePins(rows,0,'all','importance').map(x=>x.id).join(','),'2,1,3,5,4');
 assert.equal(JSON.stringify(rows),before);
 assert.equal(m.sortedLivePins(rows,0,'why','importance').map(x=>x.id).join(','),'3,5,4');
});
test('top five excludes answered, future slides and other categories without mutating source',()=>{
 const rows=[q('1',0,3),q('2',0,5),q('3',1,5),q('4',1,2),q('5',1,1),q('6',1,1),q('7',2,100),q('8',0,100,'why','answered'),q('9',0,100,'example')];
 const before=JSON.stringify(rows);const result=m.topLivePins(rows,1,'why','popular');
 assert.equal(result.map(x=>x.id).join(','),'2,3,1,4,5');assert.equal(JSON.stringify(rows),before);
});
test('all four orders, empty category, deterministic ties and fingerprint invalidation',()=>{
 const rows=[q('1',0,3),q('2',1,2),q('3',0,1)];
 assert.equal(m.topLivePins(rows,1,'all','oldest')[0].id,'1');
 assert.equal(m.topLivePins(rows,1,'all','newest')[0].id,'3');
 assert.equal(m.topLivePins(rows,1,'all','current')[0].id,'2');
 assert.equal(m.topLivePins(rows,1,'missing','popular').length,0);
 assert.notEqual(m.pinFingerprint(rows[0]),m.pinFingerprint({...rows[0],text:'changed'}));
});
