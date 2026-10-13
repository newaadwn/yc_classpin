const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,name=>load(path.resolve(path.dirname(file),name.endsWith('.ts')?name:name+'.ts')));return exports;}
const {condenseQuestions}=load('app/_model/question-condense.ts');
const q=(id,text)=>({id,sessionId:'s',slideIndex:0,x:.2,y:.2,text,category:'why',createdAt:id,status:'unanswered',reactionCount:0});
const a=q('1','이 기술은 무엇인가요?'),b=q('2','이 기술의 정의는 무엇인가요?');
assert.equal(condenseQuestions([a,b],{edges:[['1','2',.83]],regionOf:()=> 'section'}).length,1);
assert.equal(condenseQuestions([a,b],{edges:[['1','2',.99]],regionOf:q=>q.id}).length,2);
assert.equal(condenseQuestions([a,b],{edges:[['1','2',.99]],regionOf:()=> 'section',triage:[{question_id:'1',separate:true,deferred:false}]}).length,2);
assert.equal(condenseQuestions([a,q('2','이 기술을 왜 사용하나요?')],{edges:[['1','2',.99]],regionOf:()=> 'section'}).length,2);
assert.equal(condenseQuestions([a,{...a,id:'2'}],{regionOf:()=> 'section'}).length,1);
console.log('PASS shared thresholds, section/type boundary, explicit separation, identical text');
