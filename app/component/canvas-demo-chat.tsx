import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import s from './canvas-demo-chat.module.css';
export function CanvasDemoChat({at,onClose,onCreate}:{at:{x:number;y:number};onClose:()=>void;onCreate:(pages:number[])=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [text,setText]=useState('2, 4, 6페이지 섹션 모아서 분석해'),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>previous?.focus();},[]);
 function send(){const pages=[...new Set((text.match(/\d+/g)??[]).map(Number))];if(!pages.length){setError('모을 페이지 번호를 입력해 주세요. 예: 2, 4, 6');return;}try{onCreate(pages);onClose();}catch(e){setError(e instanceof Error?e.message:'페이지를 확인해 주세요.');}}
 return createPortal(<dialog ref={dialog} className={s.dialog} style={{left:Math.max(12,Math.min(at.x,window.innerWidth-390)),top:Math.max(12,Math.min(at.y,window.innerHeight-360))}} aria-label="AI 채팅 예시" onCancel={onClose}><header><strong>✳ AI 채팅</strong><button onClick={onClose} aria-label="AI 채팅 닫기">×</button></header><small>기능 시연 · 실제 AI 호출 없음</small><p>함께 살펴볼 페이지를 알려주세요.<br/>새 묶음과 예시 요약을 캔버스에 추가할게요.</p><button className={s.suggestion} onClick={()=>setText('2, 4, 6페이지 섹션 모아서 분석해')}>2, 4, 6페이지 모아 분석하기</button><form onSubmit={e=>{e.preventDefault();send();}}><textarea autoFocus aria-label="AI에게 요청" value={text} onChange={e=>setText(e.target.value)} rows={3}/>{error&&<p role="alert">{error}</p>}<button className={s.submit} type="submit">예시 실행 →</button></form></dialog>,document.body);
}
