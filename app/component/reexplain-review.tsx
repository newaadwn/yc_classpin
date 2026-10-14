'use client';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {ClassSession} from '@/app/_model/types';
import type {ReviewTopic} from '@/app/_model/reexplain-topics';
import {useAuth} from '@/app/_controller/auth-context';
import {SlideCanvas} from './slide-canvas';
import s from './reexplain-review.module.css';
const actions=['추가 설명 준비','예시 보강','자료 수정','추가 답변 작성','조치 불필요'] as const;
type Draft={actions:string[];note:string;evidence:string[]};
function readDrafts(raw:string|null){
 const clean:Record<string,Draft>={};
 try{const value=JSON.parse(raw??'{}');if(value&&typeof value==='object')for(const [id,d] of Object.entries(value)){const draft=d as Draft;if(Array.isArray(draft?.actions)&&draft.actions.every(a=>actions.includes(a as typeof actions[number]))&&typeof draft.note==='string'&&Array.isArray(draft.evidence)&&draft.evidence.every(id=>typeof id==='string'))clean[id]=draft;}}catch{}
 return clean;
}
const subscribe=(notify:()=>void)=>{window.addEventListener('storage',notify);window.addEventListener('ohpin-followup-change',notify);return()=>{window.removeEventListener('storage',notify);window.removeEventListener('ohpin-followup-change',notify);};};
export function ReexplainReview({session,topics,scope}:{session:ClassSession;topics:ReviewTopic[];scope:'studio'|'report'}){
 const {user}=useAuth();
 const [active,setActive]=useState<ReviewTopic|null>(null);
 const key=`ohpin-followup-v1:${user?.id??'demo'}:${scope}:${session.id}`;
 const raw=useSyncExternalStore(subscribe,()=>{try{return localStorage.getItem(key);}catch{return null;}},()=>null);
 const drafts=useMemo(()=>readDrafts(raw),[raw]);
 const save=(id:string,draft:Draft)=>{const next={...readDrafts(localStorage.getItem(key)),[id]:draft};localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event('ohpin-followup-change'));};
 return <section className={s.root} aria-label="다시 설명할 내용 TOP 3"><header><div><h2>다시 설명할 내용 TOP 3</h2><p>미답변 수 → 반복 질문 수 순서의 검토 제안입니다. 이해도 평가는 아닙니다.</p></div><small>후속 조치 · 브라우저 초안</small></header>
 <div className={s.cards}>{topics.map((topic,i)=>{const draft=drafts[topic.id];return <button key={topic.id} onClick={()=>setActive(structuredClone(topic))}><small>검토 {i+1} · {(session.slides[topic.page]?.pageIndex??topic.page)+1}페이지</small><strong>{topic.label}</strong><span>미답변 {topic.pending}건 · 원문 {topic.questions.length}건 · 반복 추가분 {topic.repeated}건</span><em>{draft?.actions.length?draft.actions.join(' · '):'근거 확인 → 후속 조치 선택'}</em></button>;})}</div>
 {!topics.length&&<p>현재 미답변 또는 반복 질문이 있는 검토 후보가 없습니다.</p>}
 <p className={s.notice}>{scope==='studio'?'Studio 입력 기준이며 가상 질문이 포함될 수 있습니다. 실제 보고서의 조치와 분리 저장됩니다.':'이 계정·자료의 초안을 이 브라우저에 저장합니다. 다른 기기와 동기화하거나 학생에게 전송하지 않습니다.'}</p>
 {active&&<ReviewDialog key={`${key}:${active.id}`} session={session} topic={active} draft={drafts[active.id]} save={d=>save(active.id,d)} close={()=>setActive(null)}/>}
 </section>;
}
function ReviewDialog({session,topic,draft,save,close}:{session:ClassSession;topic:ReviewTopic;draft?:Draft;save:(d:Draft)=>void;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState(draft?.actions??[]),[note,setNote]=useState(draft?.note??''),[message,setMessage]=useState('');
 const [pin,setPin]=useState<string|null>(topic.questions[0]?.id??null);
 const [reviewed,setReviewed]=useState(false);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>previous?.focus();},[]);
 const ids=topic.questions.map(q=>q.id).sort();
 const changed=draft&&JSON.stringify([...draft.evidence].sort())!==JSON.stringify(ids);
 const slide=session.slides[topic.page];
 return <dialog ref={dialog} className={s.dialog} aria-labelledby="followup-title" onCancel={close} onClick={e=>e.stopPropagation()}><header><div><small>{(session.slides[topic.page]?.pageIndex??topic.page)+1}페이지 · 미답변 {topic.pending}건</small><h2 id="followup-title">{topic.label}</h2></div><button autoFocus onClick={close}>닫기</button></header><p>질문이 많다는 사실만으로 설명 부족이나 이해도 저하를 단정하지 않습니다.</p>
 <div className={s.evidence}><div>{slide?<SlideCanvas slide={slide} questions={topic.questions} selectedId={pin??undefined} onSelectPin={setPin} statusColoredPins/>:<p>연결된 슬라이드가 없습니다. 질문 원문을 확인하세요.</p>}</div><div className={s.originals}>{topic.questions.map(q=><button key={q.id} aria-pressed={pin===q.id} onClick={()=>setPin(q.id)}><small>{q.status==='unanswered'?'미답변':q.status==='answered'?'답변됨':'해결됨'} · 공감 {q.reactionCount} · {q.x==null||q.y==null?'좌표 없음':'핀 위치 있음'}</small><span>{q.text}</span>{q.answer&&<p>기존 답변: {q.answer}</p>}</button>)}</div></div>
 <label className={s.confirm}><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>질문 원문과 자료 근거를 확인했습니다.</label>
 {changed&&<p role="status">이전 초안 이후 질문 구성이 달라졌습니다. 근거를 다시 검토해 주세요.</p>}
 <fieldset disabled={!reviewed}><legend>후속 조치 선택</legend><div className={s.options}>{actions.map(action=><label key={action}><input type="checkbox" checked={selected.includes(action)} onChange={e=>{setMessage('');setSelected(current=>e.target.checked?action==='조치 불필요'?[action]:[...current.filter(x=>x!=='조치 불필요'),action]:current.filter(x=>x!==action));}}/>{action}</label>)}</div><label className={s.note}>구체적인 실행 메모<textarea maxLength={2000} value={note} onChange={e=>{setNote(e.target.value);setMessage('');}} placeholder="예: 다음 강의 시작에 비교 사례를 추가해 설명"/></label></fieldset>
 <footer><span role="status">{message}</span><button disabled={!reviewed} onClick={()=>{try{save({actions:selected,note:note.trim(),evidence:ids});setMessage('후속 조치 초안을 이 브라우저에 저장했습니다.');}catch{setMessage('저장하지 못했습니다. 브라우저 저장 공간을 확인하고 다시 시도하세요.');}}}>{selected.length?'후속 조치 저장':'선택 해제 저장'}</button></footer></dialog>;
}
