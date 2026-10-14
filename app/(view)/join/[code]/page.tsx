"use client";

import { useRef, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import selectedPinIcon from "@/assets/icons/pin_icon.svg";
import unselectedPinIcon from "@/assets/icons/pin_black_icon.svg";
import { Check, MapPin, Send, Trash2, X } from "@/app/component/icons";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { LoadingScreen } from "@/app/component/loading-screen";
import { PinLogo } from "@/app/component/pin-logo";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { StatusBadge } from "@/app/component/status-badge";
import { SessionRuntime } from "@/app/component/session-runtime";
import { QUESTION_MARKERS, questionMarkerEmoji } from "@/app/_model/types";
import { useJoinSessionController } from "./controller";
import styles from "./page.module.css";
import { PinComposer } from "@/app/component/pin-composer";
import { AiDraftPin, AiQuestionPanel } from "./component/ai-question";
import { ParticipantBar } from "./component/participant-bar";

export default function JoinSession() {
  const controller = useJoinSessionController();
  const canvasRef = useRef<HTMLDivElement>(null);

  if (controller.state === "loading") return <LoadingScreen />;
  if (controller.state === "missing") return <div className={`${styles.root} student-empty`}><PinLogo /><LanguageSwitcher /><h1>{controller.t("student.sessionNotFound")}</h1><p>{controller.t("student.checkLink")}</p></div>;
  if (controller.state === "ended") return <div className={`${styles.root} student-empty`}><PinLogo /><LanguageSwitcher /><h1>{controller.t("student.sessionEndedTitle")}</h1><p>{controller.t("student.sessionEndedDescription")}</p><Link className="btn primary" href={controller.finalHref}>{controller.t("experience.complete")}</Link></div>;

  const {
    t, timeAgo, finalHref, session, liveReactions, activeTool, slideIndex, current, slide,
    draftQuestion, draftText, editingQuestionId, viewingQuestion, submitted, submitting,
    submitError, composerOpen, selectedQuestionId, questionSort, slideQuestions, submittedQuestions, visibleQuestionIds,
    pendingReactionIds, reactionError, emojiError, categoryOptions, activeCategory, activeMarker,
    activeMarkerEmoji, categoryLabel, categoryClass, markerLabel, handleSlideWheel, placeDraftTag,
    selectCategory, selectMarker, startEditingQuestion, updateDraftText, startMovingDraftTag, moveDraftTag,
    finishMovingDraftTag, openDraftComposer, submit, closeComposer,
    deleteDraftQuestion, selectTool, changeSlide, syncToLiveSlide, selectQuestionSort, toggleQuestionReaction,
    sendEmojiReaction, questionsVisible, toggleQuestionsVisible, openTextQuestion, focusMode, toggleFocusMode,
    newAnswerIds, dismissAnswer, openAnswer, ai
  } = controller;
  const newAnswerQuestion = newAnswerIds.length ? session.questions.find((question) => question.id === newAnswerIds.at(-1)) : undefined;

  return (
    <main className={`${styles.root} ${focusMode ? styles.focusMode : ""} student-shell student-slide-shell`}>
      <div className="student-guide class-feedback-guide">
        <div><div className={styles.titleWithTimer}><b>{session.title}<em>LIVE</em></b><SessionRuntime session={session} /></div><span>{t("student.feedbackGuide")}</span></div>
      </div>
      <section className={`student-stage ${questionsVisible ? "" : styles.questionsHidden}`} aria-label={t("student.slideAria", { title: session.title })} onWheel={handleSlideWheel}>
        <div className="student-image-stage">
          <div className="student-image-viewport">
            <div ref={canvasRef} className={`student-canvas lecture-fit tool-${activeTool}`} style={{ "--student-image-width": focusMode ? "min(100%, calc((100dvh - 96px) * 16 / 9))" : "min(100%, calc((100dvh - 180px) * 16 / 9))" } as CSSProperties}>
              <SlideCanvas
                slide={slide}
                questions={ai.movingQuestionId ? slideQuestions.filter((question) => question.id !== ai.movingQuestionId) : slideQuestions}
                questionCategories={session.questionCategories}
                visibleQuestionIds={visibleQuestionIds}
                selectedId={selectedQuestionId}
                onSelectPin={startEditingQuestion}
                onCanvasClick={ai.canvasMode ? ai.placeAt : activeTool === "pin" ? placeDraftTag : undefined}
                showQuestionLabels
              >
                <AiDraftPin ai={ai} current={current} />
                {draftQuestion && !editingQuestionId && !submitted && !ai.canvasMode && <>
                  <button
                    className="draft-pin"
                    style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                    aria-label={t("student.movePin")}
                    onPointerDown={startMovingDraftTag}
                    onPointerMove={moveDraftTag}
                    onPointerUp={finishMovingDraftTag}
                    onPointerCancel={finishMovingDraftTag}
                    onClick={openDraftComposer}
                  >
                    <Image className="question-pin-icon" src={unselectedPinIcon} alt="" aria-hidden="true" draggable={false} />
                    {questionMarkerEmoji(draftQuestion.marker) && <span className="question-pin-marker emoji" aria-hidden="true">{questionMarkerEmoji(draftQuestion.marker)}</span>}
                  </button>
                  <span className={`draft-tag category ${categoryClass(draftQuestion.category)}`} style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}>{categoryLabel(draftQuestion.category)}</span>
                </>}
              </SlideCanvas>
            </div>
          </div>
        </div>
        <section id="participant-questions" className="student-feedback-panel" hidden={!questionsVisible} aria-labelledby="student-feedback-title">
          <header className="student-feedback-head">
            <h2 id="student-feedback-title">{t("student.feedbackListTitle")}</h2>
            <div className="student-feedback-head-actions">
              <span>{t("student.feedbackCount", { count: submittedQuestions.length })}</span>
              <select aria-label={t("student.sortQuestions")} value={questionSort} onChange={(event) => selectQuestionSort(event.target.value)}>
                <option value="empathy">{t("student.sortByEmpathy")}</option>
                <option value="newest">{t("student.sortByNewest")}</option>
              </select>
            </div>
          </header>
          <AiQuestionPanel ai={ai} questions={session.questions} categoryOptions={categoryOptions} categoryLabel={categoryLabel} />
          {submittedQuestions.length ? <ul className="student-feedback-list">
            {submittedQuestions.map((question) => {
              const reactionPending = pendingReactionIds.has(question.id);
              return <li key={question.id} className={`question-card ${selectedQuestionId === question.id ? "selected" : ""} ${question.reactionCount >= 5 ? "empathy-fire" : ""}`}>
                {question.reactionCount >= 5 && <span className="student-feedback-fire" aria-hidden="true">🔥🔥🔥</span>}
                <div className="student-feedback-row">
                  <button type="button" className="student-feedback-item" onClick={() => startEditingQuestion(question.id)} aria-pressed={selectedQuestionId === question.id}>
                    <span className="student-question-list-meta"><span className={`category ${categoryClass(question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{categoryLabel(question.category)}</span><StatusBadge status={question.status} /><time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time></span>
                    <p>{question.text}</p>
                    {question.x === null && <small>접수 완료 · 위치 미확정{question.isMine && question.status === "unanswered" ? " · 눌러서 위치 지정" : ""}</small>}
                    {question.answer && <span className="student-question-list-answer"><b>{t("question.instructorAnswer")}</b>{question.answer}</span>}
                  </button>
                  <button
                    type="button"
                    className={`question-empathy-button ${question.reactedByMe ? "active" : ""}`}
                    onClick={() => void toggleQuestionReaction(question)}
                    aria-pressed={question.reactedByMe}
                    aria-label={question.isMine ? t("student.empathyOwn") : t(question.reactedByMe ? "student.empathyRemove" : "student.empathyAdd", { count: question.reactionCount })}
                    aria-busy={reactionPending}
                    disabled={question.isMine || reactionPending}
                  ><span aria-hidden="true">👍</span><b>{question.reactionCount}</b></button>
                </div>
              </li>;
            })}
          </ul> : <p className="student-feedback-empty">{t("student.feedbackEmpty")}</p>}
          {reactionError && <p className="student-empathy-error" role="alert">{reactionError}</p>}
        </section>
      </section>
      <ParticipantBar
        code={session.code}
        current={current}
        liveIndex={session.currentSlide}
        following={slideIndex === null}
        pageCount={session.slides.length}
        activeTool={activeTool}
        questionsVisible={questionsVisible}
        questionCount={submittedQuestions.length}
        finalHref={finalHref}
        emojiError={emojiError}
        newAnswer={newAnswerQuestion?.answer ? { id: newAnswerQuestion.id, text: newAnswerQuestion.answer, count: newAnswerIds.length } : null}
        focusMode={focusMode}
        onPage={changeSlide}
        onSync={syncToLiveSlide}
        onTool={selectTool}
        onEmoji={(emoji) => void sendEmojiReaction(emoji)}
        onToggleQuestions={toggleQuestionsVisible}
        onWriteQuestion={openTextQuestion}
        onOpenAnswer={openAnswer}
        onDismissAnswer={dismissAnswer}
        onToggleFocus={toggleFocusMode}
      />
      <div className="participant-page-reactions" aria-hidden="true">
        {liveReactions.map((reaction) => <span key={reaction.id} className="slide-emoji-reaction lecture-live-reaction" style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}>{reaction.emoji}</span>)}
      </div>
      {composerOpen && <PinComposer canvasRef={canvasRef} x={viewingQuestion?.x ?? draftQuestion?.x ?? 0.5} y={viewingQuestion?.y ?? draftQuestion?.y ?? 0.5} onClose={closeComposer}>
          <button type="button" className="icon-btn modal-close" onClick={closeComposer} aria-label={t("student.closeComposer")}><X /></button>
          {viewingQuestion ? <div className="student-answer-view">
            <span className={`category ${categoryClass(viewingQuestion.category)}`}>{questionMarkerEmoji(viewingQuestion.marker) && <i aria-hidden="true">{questionMarkerEmoji(viewingQuestion.marker)}</i>}{categoryLabel(viewingQuestion.category)}</span>
            <h2 id="question-modal-title">{t("student.myQuestion")}</h2>
            <p className="student-answer-question">{viewingQuestion.text}</p>
            <div className={`student-answer-panel ${viewingQuestion.answer ? "" : "pending"}`}>
              <span>{t("question.instructorAnswer")}</span>
              <p>{viewingQuestion.answer ?? t("student.waitingAnswer")}</p>
            </div>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="question-modal-title">{editingQuestionId ? t("student.edited") : t("student.submitted")}</h2><p>{t("student.instructorCanSee")}</p><button className="btn primary" onClick={closeComposer}>{editingQuestionId ? t("common.confirm") : t("student.newQuestion")}</button></div> : <>
            <div className="student-modal-heading">
              <span className="question-pin-preview" aria-hidden="true"><Image src={selectedPinIcon} alt="" />{activeMarkerEmoji && <i>{activeMarkerEmoji}</i>}</span>
              <div><h2 id="question-modal-title">{editingQuestionId ? t("student.editPrompt") : t("student.pointPrompt")}</h2><p>{editingQuestionId ? t("student.editHint") : t("student.composeHint")}</p></div>
            </div>
            <fieldset className="question-marker-picker">
              <legend>{t("student.markerTitle")}</legend>
              <div>{QUESTION_MARKERS.map((marker) => {
                const emoji = questionMarkerEmoji(marker);
                return <button key={marker} type="button" className={activeMarker === marker ? "active" : ""} onClick={() => selectMarker(marker)} aria-pressed={activeMarker === marker} aria-label={markerLabel(marker)}>
                  <span className="question-pin-preview" aria-hidden="true"><Image src={activeMarker === marker ? selectedPinIcon : unselectedPinIcon} alt="" />{emoji && <i>{emoji}</i>}</span>
                  <b>{markerLabel(marker)}</b>
                </button>;
              })}</div>
            </fieldset>
            <div className="category-scroll">{categoryOptions.map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{categoryLabel(item)}</button>)}</div>
            <div className="textarea-wrap"><textarea value={draftText} onChange={(event) => updateDraftText(event.target.value)} maxLength={300} placeholder={t("student.optionalQuestion")} /><span>{draftText.length}/300</span></div>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <div className="student-composer-actions">
              <button className="btn primary large full" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send />}{editingQuestionId ? t("student.sendEdited") : t("student.sendQuestion")}</button>
              {editingQuestionId && <button className="btn secondary large full" onClick={() => { const id = editingQuestionId; closeComposer(); ai.startMoving(id); }} disabled={submitting}><MapPin />PIN 위치 옮기기</button>}
              {editingQuestionId
                ? <button className="btn secondary large full" onClick={closeComposer} disabled={submitting}>{t("student.cancelEdit")}</button>
                : <button className="btn destructive large full" onClick={deleteDraftQuestion}><Trash2 />{t("student.deletePin")}</button>}
            </div>
          </>}
      </PinComposer>}
    </main>
  );
}
