"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import unselectedPinIcon from "@/assets/icons/pin_black_icon.svg";
import { Check, MapPin, Send, Sparkles, X } from "@/app/component/icons";
import type { Question } from "@/app/_model/types";
import type { AiQuestionController } from "../use-ai-question";
import styles from "./ai-question.module.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Reasons({ reasons, label = "AI 판단 근거" }: { reasons: string[]; label?: string }) {
  if (!reasons.length) return null;
  return <details className={styles.reasons}><summary>{label}</summary><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>;
}

/** 슬라이드 위의 AI 추천 위치(끌어서 옮길 수 있는 PIN)와 추정 영역 표시. */
export function AiDraftPin({ ai, current }: { ai: AiQuestionController; current: number }) {
  if (!ai.draft || ai.draft.page !== current) return null;
  const moving = ai.phase.kind === "moving";
  return <>
    {ai.highlight && <span className={styles.regionHighlight} style={{ left: `${ai.highlight.x1 * 100}%`, top: `${ai.highlight.y1 * 100}%`, width: `${(ai.highlight.x2 - ai.highlight.x1) * 100}%`, height: `${(ai.highlight.y2 - ai.highlight.y1) * 100}%` }} aria-hidden="true" />}
    <button
      type="button"
      className={`draft-pin ${styles.aiPin}`}
      style={{ left: `${ai.draft.x * 100}%`, top: `${ai.draft.y * 100}%` }}
      aria-label={moving ? "옮길 PIN 위치. 끌어서 이동하세요" : "AI 추천 PIN 위치. 끌어서 이동하세요"}
      {...ai.dragHandlers}
      onPointerCancel={ai.dragHandlers.onPointerUp}
    >
      <Image className="question-pin-icon" src={unselectedPinIcon} alt="" aria-hidden="true" draggable={false} />
    </button>
    <span className={styles.pinTag} style={{ left: `${ai.draft.x * 100}%`, top: `${ai.draft.y * 100}%` }} aria-hidden="true">{moving ? "새 위치" : "AI 추천"}</span>
  </>;
}

export function AiQuestionPanel({ ai, questions, categoryOptions, categoryLabel }: {
  ai: AiQuestionController;
  questions: Question[];
  categoryOptions: readonly string[];
  categoryLabel: (category: string) => string;
}) {
  const { phase } = ai;
  const busy = phase.kind === "analyzing" || phase.kind === "receiving";
  const submit = (event: FormEvent) => { event.preventDefault(); void ai.submit(); };
  return (
    <section className={styles.root} aria-label="텍스트로 질문하기">
      {phase.kind !== "moving" && <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor="ai-question-input"><Sparkles aria-hidden="true" />글로 질문하면 AI가 슬라이드 위치를 찾아 PIN을 꽂아요</label>
        <div className={styles.inputRow}>
          <textarea
            id="ai-question-input"
            value={ai.input}
            maxLength={300}
            rows={1}
            placeholder="예: 3페이지 오른쪽 그래프의 67%는 어떻게 나온 건가요?"
            disabled={busy}
            onChange={(event) => ai.setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ai.submit(); } }}
          />
          <button type="submit" className="btn primary" disabled={busy || !ai.input.trim()} aria-label="AI로 질문 위치 찾기">{busy ? <span className="spinner" /> : <Send />}</button>
        </div>
      </form>}

      <div className={styles.status} role="status" aria-live="polite">
        {ai.notice && <p className={styles.notice}>{ai.notice}<button type="button" onClick={ai.dismissNotice} aria-label="알림 닫기"><X /></button></p>}

        {(phase.kind === "analyzing" || phase.kind === "receiving") && <div className={styles.card}><p className={styles.title}><span className="spinner" />{phase.kind === "receiving" ? "질문을 접수하고 있어요…" : "접수 완료 · AI가 위치를 찾고 있어요"}</p><p className={styles.quote}>“{phase.text}”</p></div>}

        {phase.kind === "created" && phase.result.decision && <div className={`${styles.card} ${styles.success}`}>
          <p className={styles.title}><Check aria-hidden="true" />{phase.page + 1}페이지 · {phase.result.decision.region.label} 영역에 PIN을 만들었어요</p>
          <p className={styles.meta}>
            <span>신뢰도 {percent(phase.result.decision.confidence)}</span>
            <span>카테고리 {categoryLabel(phase.category)}</span>
            <span>{phase.result.analysis.source === "llm" ? phase.result.analysis.llmModel : phase.result.analysis.embedding === "used" ? "검색 + 임베딩" : "글자 검색"}</span>
            {phase.result.related.length > 0 && <span>연관 질문 {phase.result.related.length}개</span>}
          </p>
          <p className={styles.quote}>“{phase.text}”</p>
          <Reasons reasons={phase.result.decision.reasons} />
          {phase.result.related.length > 0 && <RelatedList ai={ai} questions={questions} related={phase.result.related} />}
          <div className={styles.actions}>
            <button type="button" className="btn secondary" onClick={() => ai.startMoving(phase.questionId)}><MapPin />위치 옮기기</button>
            <button type="button" className="btn secondary" onClick={ai.cancel}>닫기</button>
          </div>
        </div>}

        {phase.kind === "confirm" && phase.result.decision && <div className={`${styles.card} ${styles.confirm}`}>
          <p className={styles.title}>이 위치가 맞나요?</p>
          <p className={styles.meta}>
            <span>{phase.draft.page + 1}페이지{phase.adjusted ? " · 직접 고른 위치" : ` · ${phase.result.decision.region.label}`}</span>
            {!phase.adjusted && <span>신뢰도 {percent(phase.result.decision.confidence)}</span>}
          </p>
          <label className={styles.categoryField}>
            <span>카테고리{phase.categoryChosen ? "" : " · AI 추천"}</span>
            <select value={phase.category} onChange={(event) => ai.chooseCategory(event.target.value)} disabled={phase.saving}>
              {(categoryOptions.includes(phase.category) ? categoryOptions : [phase.category, ...categoryOptions]).map((key) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
            </select>
          </label>
          <p className={styles.quote}>“{phase.text}”</p>
          <p className={styles.refine} data-state={phase.refine}>
            {phase.refine === "running" ? <><span className="spinner" />로컬 AI(Qwen3 4B)가 질문과 영역의 관계를 다시 확인하고 있어요 (최대 1~2분)</> : phase.refineMessage}
          </p>
          <Reasons reasons={phase.result.decision.reasons} />
          <p className={styles.hint}>PIN을 끌거나 슬라이드를 눌러 위치를 직접 고를 수 있어요. 다른 페이지로 옮기려면 페이지를 넘긴 뒤 누르세요.</p>
          {phase.error && <p className={styles.error} role="alert">{phase.error}</p>}
          <div className={styles.actions}>
            <button type="button" className="btn primary" onClick={() => void ai.confirm()} disabled={phase.saving}>{phase.saving ? <span className="spinner" /> : <Check />}접수한 질문을 이 위치로 지정</button>
            {phase.result.decision.candidates.length > 1 && <button type="button" className="btn secondary" onClick={ai.nextCandidate} disabled={phase.saving}>다른 후보 ({phase.candidate + 1}/{phase.result.decision.candidates.length})</button>}
            <button type="button" className="btn secondary" onClick={ai.cancel} disabled={phase.saving}>위치는 나중에 지정</button>
          </div>
        </div>}

        {phase.kind === "duplicate" && <div className={`${styles.card} ${styles.confirm}`}>
          <p className={styles.title}>비슷한 질문이 이미 있어요</p>
          <p className={styles.quote}>“{phase.text}”</p>
          <RelatedList ai={ai} questions={questions} related={phase.result.related} onlyDuplicates />
          <div className={styles.actions}>
            <button type="button" className="btn primary" onClick={ai.continueAnyway}>접수한 내 질문에 위치 지정</button>
            <button type="button" className="btn secondary" onClick={ai.cancel}>접수 상태로 닫기</button>
          </div>
        </div>}

        {phase.kind === "moving" && <div className={`${styles.card} ${styles.confirm}`}>
          <p className={styles.title}><MapPin aria-hidden="true" />PIN 위치 옮기기</p>
          <p className={styles.hint}>PIN을 끌거나 슬라이드를 눌러 새 위치를 정하세요. 다른 페이지로 옮기려면 페이지를 넘긴 뒤 누르세요. 현재 {phase.draft.page + 1}페이지</p>
          {phase.error && <p className={styles.error} role="alert">{phase.error}</p>}
          <div className={styles.actions}>
            <button type="button" className="btn primary" onClick={() => void ai.saveMove()} disabled={phase.saving}>{phase.saving ? <span className="spinner" /> : <Check />}이 위치로 저장</button>
            <button type="button" className="btn secondary" onClick={ai.cancel} disabled={phase.saving}>취소</button>
          </div>
        </div>}

        {(phase.kind === "unsupported" || phase.kind === "error") && <div className={`${styles.card} ${styles.warning}`}>
          <p className={styles.title}>{phase.kind === "unsupported" ? "AI 위치 찾기를 쓸 수 없어요" : "AI 위치 찾기에 실패했어요"}</p>
          <p className={styles.hint}>{phase.message}</p>
          {phase.kind === "unsupported" && <p className={styles.hint}>질문은 이미 접수되었습니다. 위치를 지정하지 않아도 강사가 볼 수 있습니다.</p>}
          <div className={styles.actions}>
            <button type="button" className="btn primary" onClick={ai.manualFallback}><MapPin />직접 PIN 찍기</button>
            {phase.kind === "error" && <button type="button" className="btn secondary" onClick={ai.retry}>다시 시도</button>}
            <button type="button" className="btn secondary" onClick={ai.cancel}>닫기</button>
          </div>
        </div>}
      </div>
    </section>
  );
}

function RelatedList({ ai, questions, related, onlyDuplicates = false }: {
  ai: AiQuestionController;
  questions: Question[];
  related: Array<{ id: string; text: string; page: number; relation: "duplicate" | "related"; similarity: number }>;
  onlyDuplicates?: boolean;
}) {
  const rows = related.filter((item) => !onlyDuplicates || item.relation === "duplicate").slice(0, 3);
  return <ul className={styles.related}>
    {rows.map((item) => {
      const question = questions.find((row) => row.id === item.id);
      return <li key={item.id}>
        <span className={styles.relation}>{item.relation === "duplicate" ? "같은 질문" : "연관"} · {item.page + 1}p{question?.isMine ? " · 내 질문" : ""}{question && question.status !== "unanswered" ? " · 답변 완료" : ""}</span>
        <span className={styles.relatedText}>{item.text}</span>
        {question && !question.isMine && <button type="button" className={`btn secondary ${question.reactedByMe ? styles.reacted : ""}`} onClick={() => void ai.react(question)} aria-label={`이 질문에 공감하기: ${item.text}`}>👍 {question.reactionCount}</button>}
      </li>;
    })}
  </ul>;
}
