"use client";
import { useState } from "react";
import type { ClassSession } from "@/app/_model/types";
import { useQuestionGroups } from "../question-groups-controller";
import { stripDemoPrefix, type CondensedGroup } from "@/app/_model/question-condense";
import styles from "./question-groups.module.css";

export function QuestionGroups({session,onSelect}:{session:ClassSession;onSelect:(id:string)=>void}) {
  const state=useQuestionGroups(session);
  const [all,setAll]=useState(false);
  const visible=all?state.groups:(state.fixed??state.top);
  return <section className={styles.root} aria-label="질문 묶음 처리">
    <h3>지금 답할 질문</h3>
    <p>{state.deferred?"나중에 볼":"대기 중인"} 질문 {state.groups.reduce((sum,g)=>sum+g.questions.length,0)}건 · {state.groups.length}묶음</p>
    <p>오래 기다린 질문과 여러 페이지의 질문을 최대 5묶음씩 확인하세요. 원문은 모두 보존됩니다.</p>
    <small role="status">{state.condenseStatus}</small>
    <div className={styles.actions}>
      <button className="btn primary" disabled={state.busy} onClick={()=>{setAll(false);state.nextBatch();}}>{state.fixed?"다음 5묶음 불러오기":"5묶음 고정해서 답변하기"}</button>
      {state.fixed&&<button className="btn secondary" onClick={state.releaseBatch}>고정 해제</button>}
    </div>
    {state.fixed&&!all&&<p role="status">목록 고정 중 · 새 질문 {state.newCount}건. 새 질문은 다음 목록에 반영합니다. 완료한 자리는 자동으로 채우지 않습니다.</p>}
    <div className={styles.actions}>
      <button className="btn secondary" aria-pressed={!state.deferred} onClick={()=>state.setDeferred(false)}>대기</button>
      <button className="btn secondary" aria-pressed={state.deferred} onClick={()=>state.setDeferred(true)}>보류함</button>
      <button className="btn secondary" onClick={()=>setAll(!all)}>{all?"답변 목록으로":"모든 묶음 보기"}</button>
    </div>
    {state.error&&<p role="alert">저장/조회 실패: {state.error}</p>}
    {state.notice&&<p role="status">{state.notice}</p>}
    {state.reply&&<section className={styles.card} aria-label="묶음 답변 작성">
      <h4>확인한 {state.reply.targets.length}개 질문에 같은 답변 보내기</h4>
      <p>아래 원문만 대상입니다. 이후 들어온 질문은 포함하지 않습니다.</p>
      <ul>{state.reply.targets.map((target,index)=><li key={target.id}>{index+1}. {target.text}</li>)}</ul>
      <label htmlFor="group-answer-body">공통 답변</label>
      <textarea id="group-answer-body" value={state.reply.body} maxLength={2000} readOnly={state.reply.submitted} disabled={state.busy} onChange={event=>state.editReply({body:event.target.value})} />
      <label><input type="checkbox" checked={state.reply.confirmed} disabled={state.busy||state.reply.submitted} onChange={event=>state.editReply({confirmed:event.target.checked})} /> 원문을 확인했고 이 답변을 모두에게 전달하겠습니다.</label>
      {state.reply.submitted&&<small>중복 전송 방지를 위해 재시도 내용과 대상은 고정됩니다.</small>}
      <div className={styles.actions}>
        <button className="btn primary" disabled={state.busy||!state.reply.confirmed||!state.reply.body.trim()} onClick={()=>void state.sendReply()}>{state.busy?"전송 중…":state.reply.submitted?"같은 요청 재시도":`${state.reply.targets.length}개 질문에 답변 전송`}</button>
        <button className="btn secondary" disabled={state.busy} onClick={state.closeReply}>작성창 닫기</button>
      </div>
    </section>}
    {state.lastAction&&<button className="btn secondary" disabled={state.busy} onClick={()=>void state.undo()}>방금 묶음 완료 되돌리기</button>}
    {!visible.length&&<p>이 목록에 미답변 질문이 없습니다.</p>}
    {visible.map(group=>{const representative=group.questions.find(q=>q.id===(group as Partial<CondensedGroup>).representative?.id)??group.questions[0];return <article key={group.id} className={styles.card}>
      <b>{stripDemoPrefix(representative.text)}</b>
      <p>{group.questions[0].slideIndex+1}페이지 · 원문 {group.questions.length}개 · 공감 합계 {group.reactions}회</p>
      <small>질문 건수와 공감 횟수는 인원 수가 아닙니다.{group.questions.length>1?` · 대표 문장은 ${(group as Partial<CondensedGroup>).kind==="semantic"?"다른 원문과 가장 비슷한 문장":"가장 오래된 원문"}입니다.`:""}</small>
      <details><summary>원문 확인 ({group.questions.length})</summary>
        <small>{group.reason} · 문구·영역 규칙과 의미 유사도 기준 묶음 · AI 요약 아님</small>
        <ul>{group.questions.map(q=><li key={q.id}>
          <button className="btn secondary" onClick={()=>onSelect(q.id)}>{q.text} · 질문 열기</button>
          {group.questions.length>1&&<button className="btn secondary" disabled={state.busy} onClick={()=>void state.change([q.id],{separate:true})}>따로 보기</button>}
          <button className="btn secondary" disabled={state.busy} onClick={()=>void state.change([q.id],{separate:false})}>묶음 기준 재적용</button>
        </li>)}</ul>
      </details>
      <div className={styles.actions}>
        <button className="btn primary" onClick={()=>onSelect(representative.id)}>대표 질문 답변</button>
        {group.questions.length>1&&<button className="btn secondary" disabled={state.busy||Boolean(state.reply)} onClick={()=>state.openReply(group.questions)}>묶음 전체에 답변</button>}
        <button className="btn secondary" disabled={state.busy} onClick={()=>void state.change(group.questions.map(q=>q.id),{deferred:!state.deferred})}>{state.deferred?"대기로 복귀":"이 원문들 보류"}</button>
        <button className="btn secondary" disabled={state.busy} onClick={()=>{if(window.confirm(`표시된 원문 ${group.questions.length}개를 처리 완료로 표시할까요? 답변은 전송되지 않습니다.`))void state.complete(group.questions);}}>이 원문들 처리 완료</button>
      </div>
      <small>대표 질문 답변은 해당 원문에만 전송됩니다. 함께 보내려면 ‘묶음 전체에 답변’을 사용하세요.</small>
    </article>;})}
  </section>;
}
