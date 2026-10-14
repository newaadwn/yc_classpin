/* eslint-disable @typescript-eslint/no-require-imports -- standalone model test */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
function load(path){const out={};new Function('exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out);return out;}
const m=load('app/_model/section-pin-explorer.ts'),s=load('app/_model/section-questions.ts');
const sections=Array.from({length:4},(_,i)=>({id:'s'+i,pageId:'p',title:'섹션'+i,x:i%2*.5,y:Math.floor(i/2)*.5,width:.45,height:.45}));
const questions=[2,5,0,9].flatMap((n,i)=>Array.from({length:n},(_,j)=>({id:i+'-'+j,sessionId:'test',slideIndex:0,text:j%2?'왜 필요한가요?':'무엇인가요?',x:sections[i].x+.2,y:sections[i].y+.2,status:j%3?'unanswered':'resolved',createdAt:String(j)})));
const before=JSON.stringify(questions),clusters=s.clusterSectionQuestions(questions.map(q=>s.enrichQuestion(q,'p',sections)),()=>undefined);
const rows=m.summarizeSections(sections,clusters);assert.deepEqual(rows.map(r=>r.count),[2,5,0,9]);
const filtered=m.filterPinClusters(clusters,{status:'open',type:'why'});assert.ok(filtered.every(c=>c.questions.every(q=>q.original.status==='unanswered'&&q.questionType==='why')));
assert.equal(m.summarizeSections(sections,filtered).reduce((a,r)=>a+r.count,0),filtered.reduce((a,c)=>a+c.questionCount,0));
const centroid=m.getClusterMarkerPosition([{x:.1,y:.1},{x:.3,y:.3}],sections[0]);assert.equal(centroid.x,.2);assert.equal(centroid.y,.2);
const edge=m.getClusterMarkerPosition([{x:.99,y:.99}],sections[0]);assert.ok(edge.x<=.45&&edge.y<=.45);
assert.ok(Number.isFinite(m.getClusterMarkerPosition([{x:null,y:null}],sections[0]).x));
const coincident=Array.from({length:3},(_,i)=>({...clusters[0],id:'collision'+i}));const placed=m.placeClusterMarkers(coincident,sections[0],1000,563);assert.equal(new Set(placed.map(p=>[p.x,p.y].join(','))).size,3);
assert.ok(placed.every(p=>p.x>=0&&p.x<=.45&&p.y>=0&&p.y<=.45));
const twenty=Array.from({length:20},(_,i)=>({...questions[0],id:'raw'+i}));assert.equal(twenty.filter(m.isPoint).length,20);assert.equal(new Set(twenty.map(q=>[q.x,q.y].join(','))).size,1);
assert.equal(JSON.stringify(questions),before);assert.equal(m.shortCount(100),'99+');assert.equal(m.isPoint({x:NaN,y:.5}),false);
console.log('PASS: section counts 2/5/0/9, status/type filters, centroid/clamp/collision, null anchors, 20 original overlapping anchors, immutability');
