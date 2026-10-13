import {useEffect,useState} from 'react';
import type {ClassSession} from '@/app/_model/types';
import type {CondensedGroup} from '@/app/_model/question-condense';
import {useAuth} from '@/app/_controller/auth-context';
import {summarizeScope} from '@/app/_service/scope-summary';
function TypedSummary({text}:{text:string}){
 const [visible,setVisible]=useState(0);
 useEffect(()=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const started=performance.now();
  const timer=window.setInterval(()=>{
   const count=Math.min(text.length,Math.floor((performance.now()-started)/18));
   setVisible(count);
   if(count===text.length)window.clearInterval(timer);
  },36);
  return()=>window.clearInterval(timer);
 },[text]);
 const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const done=reduced||visible>=text.length;
 return <p aria-label={text} data-typing={!done}><span aria-hidden="true">{reduced?text:text.slice(0,visible)}{!done&&<span style={{color:'var(--color-brand)',marginLeft:2}}>▍</span>}</span></p>;
}
export function ScopeSummary({session,material,name}:{session:ClassSession;material:ClassSession;name:string;groups:CondensedGroup[]}){
 const {user}=useAuth();const [example,setExample]=useState(true);const [result,setResult]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(example)return;let active=true;void summarizeScope(session,material,name,user?.id??'demo').then(text=>{if(active){setResult(text);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[session,material,name,user?.id,attempt,example]);
 if(example){
 const examples:Record<string,string>={
 '미답변':'수강생들은 제안한 서비스가 기존 방식과 어떻게 다른지, 실제 사용 상황에서 어떤 이점이 있는지에 관심을 보였습니다. 특히 기능 설명과 기대 효과 사이의 연결을 더 구체적으로 알고 싶어 하는 질문이 이어졌습니다. 다음 설명에서는 하나의 사용자 사례를 중심으로 사용 전후의 흐름을 비교하고, 효과를 뒷받침하는 근거와 아직 검증이 필요한 가정을 구분해 제시하면 좋겠습니다.',
 '답변됨':'질문은 핵심 개념의 의미와 서비스 이용 흐름을 확인하는 데 집중되었습니다. 답변에서 다룬 내용을 자료에 짧은 정의와 단계별 예시로 정리하면 같은 내용을 다시 찾기 쉬워집니다. 서로 비슷한 개념은 비교표로 묶고, 적용 조건이 다른 사례를 함께 보여주는 방향으로 보완할 수 있습니다.',
 '해결됨':'핵심 개념과 적용 방법을 연결하는 질문을 중심으로 설명이 진행된 상황을 가정한 예시입니다. 설명 내용을 한 장의 정리 자료로 제공하고, 다른 상황에도 적용할 수 있는지 확인하는 짧은 연습 문제를 덧붙이면 좋겠습니다. 질문 처리 여부와 실제 이해 여부는 구분해서 확인할 필요가 있습니다.',
 '근거·이유':'수강생들은 제시된 결론 자체보다 그 결론에 도달한 이유와 근거를 궁금해했습니다. 비교 대상의 선정 기준, 수치의 출처, 해석 과정이 연결되어 보이도록 설명을 보완하면 좋겠습니다. 주장과 근거를 나란히 배치하고, 다른 해석이 가능한 지점과 적용 한계를 함께 짚어주는 방식이 도움이 될 수 있습니다.',
 '개념':'수강생들은 주요 용어의 정의와 서로 비슷한 개념의 차이를 확인하고 싶어 했습니다. 용어 설명만으로 끝내기보다 일상적인 사례와 해당하지 않는 반례를 함께 보여주면 개념의 경계를 더 명확히 전달할 수 있습니다. 다음 자료에는 핵심 용어 요약과 비교표를 추가하는 방향을 제안합니다.',
 '예시·적용':'수강생들은 배운 내용을 실제 상황에 어떻게 적용하는지에 관심을 보였습니다. 하나의 사례를 처음부터 끝까지 따라가며 판단 기준과 결과를 보여주고, 조건이 달라졌을 때 선택이 어떻게 바뀌는지도 설명하면 좋겠습니다. 강의 후에는 직접 풀어볼 수 있는 짧은 적용 과제를 제공할 수 있습니다.',
 '이해 어려움':'수강생들은 설명 단계 사이의 연결과 처음 등장한 용어를 다시 확인하고 싶어 했습니다. 전제 개념을 짧게 복습한 뒤 과정을 작은 단계로 나누고, 각 단계가 다음 단계로 이어지는 이유를 시각적으로 보여주면 좋겠습니다. 구체적으로 어느 지점이 어려웠는지 추가로 확인한 후 설명의 속도와 예시를 조정하는 방향을 제안합니다.',
 '질문 없음':'이 묶음은 아직 질문이 수집되지 않은 상황의 예시입니다. 질문이 없다는 사실만으로 수강생이 내용을 이해했다고 판단하기는 어렵습니다. 핵심 개념을 적용하는 짧은 확인 질문이나 간단한 사례 선택 활동을 제공해, 추가 설명이 필요한 부분을 확인하는 방식으로 보완할 수 있습니다.'
 };
 const paragraph=examples[name]??'수강생들은 이 내용이 전체 강의에서 어떤 역할을 하며 실제 사례에 어떻게 연결되는지 궁금해했습니다. 자료의 핵심 주장과 질문의 맥락을 함께 살펴보면, 개념 설명에 더해 적용 과정과 판단 근거를 보여주는 방향으로 보완할 수 있습니다. 다음 설명에서는 대표적인 활용 사례와 주의할 조건을 함께 제시하고, 관련 내용을 한 장으로 정리해 제공하면 좋겠습니다.';
 return <div><small style={{color:'var(--color-brand)',fontWeight:600}}>예시 요약 · 실제 AI 분석 결과 아님</small><TypedSummary key={paragraph} text={paragraph}/><button onClick={e=>{e.stopPropagation();setExample(false);setError('');}}>실제 AI 분석 실행</button></div>;
 }
 if(error)return <div><p role="alert">{error}</p><button onClick={e=>{e.stopPropagation();setError('');setAttempt(n=>n+1);}}>AI 요약 다시 시도</button><button onClick={e=>{e.stopPropagation();setExample(true);}}>예시 요약 보기</button></div>;
 return result?<TypedSummary key={result} text={result}/>:<p role="status">묶음의 전체 자료와 질문을 AI가 분석하고 있습니다. 관심 주제와 보완할 설명을 한 문단으로 정리합니다…</p>;
}
