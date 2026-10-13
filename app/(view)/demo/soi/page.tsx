'use client';

import {useEffect,useState} from 'react';
import {useSessions} from '@/app/_controller/session-store';
import {createSoiDemoSession,type SoiDemoSource} from '@/app/_model/soi-demo';

const SESSION_STORAGE_KEY='pin-class-sessions-v1';
const SESSION_ID='soi-demo';
const LIVE_EVENT_PREFIX=`classpin-qa-live-v1:${SESSION_ID}:`;

export default function SoiDemoEntry(){
  const [error,setError]=useState('');
  const {ready}=useSessions();
  useEffect(()=>{
    if(!ready)return;
    let active=true;
    void fetch('/demo/soi/demo-data.json',{cache:'force-cache'})
      .then(async response=>{
        if(!response.ok)throw new Error('SOI 데모 데이터를 불러오지 못했습니다.');
        return await response.json() as SoiDemoSource;
      })
      .then(source=>{
        if(!active)return;
        const session=createSoiDemoSession(source);
        const params = new URLSearchParams(window.location.search);
        if (params.get('sample') === 'clusters') {
          session.id = 'soi-pin-groups-demo';
          session.code = 'PIN6QA';
          session.title = '[가상 질문 테스트] SOI 핀 묶음';
          session.currentSlide = 0;
          session.showQuestionPins = true;
          const texts = ['모르겠어요', '이해가 안 돼요', '모르겠어요', '안녕하세요', '시장 규모 산출 방법이 궁금합니다', '시장 크기는 어떻게 계산했나요'];
          session.questions = texts.map((text, index) => ({
            ...session.questions[0], id: `spatial-demo-${index}`, sessionId: session.id,
            slideIndex: 0, x: .3 + index * .004, y: .45, text,
            status: 'unanswered', answer: undefined, category: 'confusing', anchorKind: 'point',
            createdAt: new Date(2026, 9, 6, 0, 0, index).toISOString(),
          }));
        }
        const stored=window.localStorage.getItem(SESSION_STORAGE_KEY);
        const sessions=stored?JSON.parse(stored) as Array<{id?:string}>:[];
        if(!Array.isArray(sessions))throw new Error('브라우저의 강의 자료 저장 형식이 올바르지 않습니다.');
        window.localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify([session,...sessions.filter(item=>item.id!==session.id)]));
        for(let index=window.localStorage.length-1;index>=0;index--){
          const key=window.localStorage.key(index);
          if(key?.startsWith(LIVE_EVENT_PREFIX))window.localStorage.removeItem(key);
        }
        const liveView = params.get('view') === 'live';
        window.location.replace(`/admin/session/${session.id}${liveView ? '' : '/qa-studio'}`);
      })
      .catch(reason=>{
        if(!active)return;
        const detail=reason instanceof Error?reason.message:'알 수 없는 오류가 발생했습니다.';
        setError(detail);
      });
    return()=>{active=false;};
  },[ready]);

  return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#f6f5f9',color:'#20212a',fontFamily:'inherit'}}>
    <section role={error?'alert':'status'} style={{width:'min(100%,520px)',padding:32,borderRadius:24,background:'#fff',boxShadow:'0 18px 60px rgba(37,31,65,.12)'}}>
      <small style={{letterSpacing:'.16em',color:'#7654dc'}}>CLASS PIN / SOI DEMO</small>
      <h1 style={{fontSize:24,margin:'14px 0 8px'}}>슬라이드와 질문을 준비하고 있어요</h1>
      <p style={{lineHeight:1.65,color:'#686b78'}}>{error||'SOI 강의 자료와 질문을 불러오고 있습니다…'}</p>
      {error&&<p style={{fontSize:14,color:'#686b78'}}>이 페이지는 원본 데이터베이스를 사용하지 않습니다. 다시 시도하려면 새로고침하세요.</p>}
    </section>
  </main>;
}
