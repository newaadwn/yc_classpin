'use client';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {useSessions} from '@/app/_controller/session-store';
import type {ClassSession,Question} from '@/app/_model/types';
import {SlideCanvas} from '@/app/component/slide-canvas';
import {PinComposer} from '@/app/component/pin-composer';
import {useDemoLive} from './live-controller';
import s from './live-demo.module.css';
export function LiveDemo({role}:{role:'presenter'|'student'}){
 const {id}=useParams<{id:string}>(),{sessions,ready}=useSessions();const session=sessions.find(x=>x.id===id);
 if(!ready)return <main className={s.root}>자료 로딩 중…</main>;
 if(!session)return <main className={s.root}>자료를 찾을 수 없습니다. <Link href="/admin/dashboard">돌아가기</Link></main>;
 return <Room key={`${id}:${role}`} role={role} session={session}/>;
}
function Room({role,session}:{role:'presenter'|'student';session:ClassSession}){
 const live=useDemoLive(session.id,session.slides.length,session.questions,session.currentSlide),teacher=role==='presenter';
 const canvas=useRef<HTMLDivElement>(null),root=useRef<HTMLElement>(null);
 const [follow,setFollow]=useState(true),[ownPage,setOwnPage]=useState(0),[showPins,setShowPins]=useState(true),[list,setList]=useState(teacher);
 const [draft,setDraft]=useState<{page:number;x:number;y:number}|null>(null),[text,setText]=useState(''),[category,setCategory]=useState('confusing');
 const [selected,setSelected]=useState<string|null>(null),[notice,setNotice]=useState('');
 const page=draft?.page??(teacher||follow?live.page:ownPage),slide=session.slides[page];
 const question=live.questions.find(q=>q.id===selected);
 const base=`/admin/session/${session.id}/qa-studio`;
 // Called only by keyboard, select and click handlers; timestamp belongs to the interaction, not render.
 // eslint-disable-next-line react-hooks/purity
 function handleNavigate(next:number){if(next<0||next>=session.slides.length)return;setSelected(null);if(teacher)live.send({kind:'page',id:crypto.randomUUID(),at:Date.now(),page:next});else{setFollow(false);setOwnPage(next);}}
 function submit(){if(!draft||!text.trim())return;const id=crypto.randomUUID();const q:Question={id,sessionId:session.id,slideIndex:draft.page,x:draft.x,y:draft.y,anchorKind:'point',text:text.trim(),category,marker:'question',status:'unanswered',isMine:false,reactionCount:0,reactedByMe:false,createdAt:new Date().toISOString()};if(live.send({kind:'question',id,at:Date.now(),question:q})){setDraft(null);setText('');setNotice('질문을 보냈습니다. 강사 창에도 표시됩니다.');}}
 function openQuestion(q:Question){if(q.slideIndex!==page)handleNavigate(q.slideIndex);setSelected(q.id);}
 return <main className={s.root} ref={root} onKeyDown={e=>{if((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')||draft||selected)return;if(e.key==='ArrowRight'){e.preventDefault();handleNavigate(page+1);}if(e.key==='ArrowLeft'){e.preventDefault();handleNavigate(page-1);}}}>
  <header className={s.header}><Link href={base}>← Q&A Studio</Link><strong>{teacher?'강사 슬라이드쇼':'학생 질문 화면'}</strong><span className={s.live}>● LOCAL LIVE</span><a href={`${base}/${teacher?'student':'presenter'}`} target="_blank" rel="noopener noreferrer">{teacher?'학생 창 열기 ↗':'강사 창 열기 ↗'}</a>{teacher&&<button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void root.current?.requestFullscreen().catch(()=>setNotice('브라우저 전체화면을 사용할 수 없습니다.'));}}>전체화면</button>}</header>
  <div className={s.disclaimer}>프론트엔드 데모 · 같은 브라우저/주소의 탭끼리만 연결 · 운영 DB 저장 없음 · 실제 학생 배포용 링크가 아닙니다.</div>
  {live.error&&<p role="alert" className={s.error}>{live.error}</p>}{notice&&<p role="status" className={s.notice}>{notice}</p>}
  <div className={`${s.workspace} ${list?s.withList:''}`}><section className={s.main}>
   <div className={s.toolbar}><span>{session.title}</span><button aria-pressed={showPins} onClick={()=>setShowPins(!showPins)}>핀 {showPins?'보이기':'숨김'}</button><button aria-expanded={list} onClick={()=>setList(!list)}>질문 {live.questions.length}개</button>{!teacher&&<button aria-pressed={follow} disabled={!!draft} onClick={()=>{setFollow(!follow);setOwnPage(page);}}>{follow?'강사 페이지 따라가는 중':'강사 따라가기'}</button>}</div>
   <div className={s.stage} ref={canvas}>{slide?<SlideCanvas slide={slide} questions={live.questions.filter(q=>q.slideIndex===page)} showPins={showPins} selectedId={selected} onSelectPin={setSelected} statusColoredPins onCanvasClick={!teacher?(x,y)=>{setDraft({page,x,y});setSelected(null);setNotice('');}:undefined}/>:<p>슬라이드가 없습니다.</p>}</div>
   <div className={s.navigation}><button disabled={!live.ready||page===0||!!draft} onClick={()=>handleNavigate(page-1)}>← 이전</button><label>페이지 <select disabled={!!draft||!live.ready} value={page} onChange={e=>handleNavigate(Number(e.target.value))}>{session.slides.map((slide,i)=><option key={slide.id} value={i}>{i+1} / {session.slides.length}</option>)}</select></label><button disabled={!live.ready||page>=session.slides.length-1||!!draft} onClick={()=>handleNavigate(page+1)}>다음 →</button></div>
   <p className={s.hint}>{teacher?'페이지를 넘기면 따라가는 학생 창도 이동합니다. 질문 핀을 눌러 확인하세요.':'궁금한 위치를 눌러 질문하세요. 작성 중에는 페이지를 고정합니다.'}</p>{!teacher&&<button disabled={!slide||!live.ready} onClick={()=>setDraft({page,x:.5,y:.5})}>키보드로 질문 작성 (페이지 중앙)</button>}
  </section>{list&&<aside className={s.questions}><h2>전체 질문 <small>{live.questions.filter(q=>q.status==='unanswered').length}개 미처리</small></h2>{live.questions.length===0&&<p>학생 창에서 핀을 찍고 질문을 보내보세요.</p>}{live.questions.map(q=><button key={q.id} onClick={()=>openQuestion(q)}><small>{q.slideIndex+1}페이지 · {q.status==='unanswered'?'미처리':'✓ 설명 완료'}</small><p>{q.text}</p></button>)}</aside>}</div>
  {draft&&<PinComposer canvasRef={canvas} x={draft.x} y={draft.y} duration={180} onClose={()=>setDraft(null)}><div className={s.composer}><h2 id="question-modal-title">{draft.page+1}페이지 질문</h2><label>유형<select value={category} onChange={e=>setCategory(e.target.value)}><option value="confusing">모르겠어요</option><option value="why">왜 그런가요?</option><option value="example">예시 요청</option><option value="concept">개념 질문</option></select></label><label>질문<textarea autoFocus value={text} onChange={e=>setText(e.target.value)} maxLength={500} placeholder="이 위치에서 궁금한 점을 적어주세요"/></label><small>{text.length}/500 · 작성 중 강사가 넘겨도 이 페이지에 제출됩니다.</small><button disabled={!live.ready||!text.trim()} onClick={submit}>질문 보내기</button><button onClick={()=>setDraft(null)}>취소</button></div></PinComposer>}
  {question&&question.slideIndex===page&&<PinComposer key={question.id} canvasRef={canvas} x={question.x??.5} y={question.y??.5} duration={180} onClose={()=>setSelected(null)}><div className={s.composer}><h2 id="question-modal-title">질문</h2><p>{question.text}</p><small>{question.status==='unanswered'?'미처리':'✓ 강사가 설명 완료로 표시했습니다.'}</small>{teacher&&<button disabled={question.status!=='unanswered'} onClick={()=>live.send({kind:'done',id:crypto.randomUUID(),at:Date.now(),questionId:question.id})}>설명 완료</button>}<button onClick={()=>setSelected(null)}>닫기</button></div></PinComposer>}
 </main>;
}
