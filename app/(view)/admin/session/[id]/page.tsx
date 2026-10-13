"use client";

import Link from "next/link";
import { SessionRuntime } from "@/app/component/session-runtime";
import { QRCodeSVG } from "qrcode.react";
import deleteIcon from "@/assets/icons/delete_icon.svg";
import fileListIcon from "@/assets/icons/file_list_icon.svg";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, FileText, GripVertical, Link2, ListFilter, MessageCircleQuestion, MonitorUp, PanelLeftClose, PanelLeftOpen, Pause, Play, QrCode, Search, Share2, Trash2, Users, X } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { QuestionCard } from "./component/question-card";
import { QuestionCategoryManager } from "./component/question-category-manager";
import { QuestionDetailDialog } from "./component/question-detail-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { StatusBadge } from "@/app/component/status-badge";
import { MAX_QUESTION_PANEL, MIN_QUESTION_PANEL, useSessionAdminController } from "./controller";
import styles from "./page.module.css";
import { questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type QuestionCategory } from "@/app/_model/types";

function SessionToggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button
    type="button"
    className={`session-toggle ${checked ? "on" : ""}`}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onClick}
  >
    <span className="session-toggle-thumb" />
    <span className="session-toggle-state">{checked ? "ON" : "OFF"}</span>
  </button>;
}

export default function SessionAdmin() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const {
    ready, session, slide, folder, folderAccentIndex, folderHref, folderSessions, questionsBySlide, questionCounts, slideQuestions,
    selected, detailQuestion, visibleQuestions, tab, filter, query, shareOpen, mobileQuestionsOpen, answer, copied,
    actionError, lectureSaving, presentationError, folderRailOpen, questionPanelWidth, noteDraft,
    noteDirty, noteSavingSlideId, noteSavedSlideId, deleteTarget, deletingSlide,
    deleteSlideError, deleteTargetQuestionCount, joinUrl, playerWorkspaceRef, filmstripRef,
    handleSlideWheel, showLive, showQuestions, toggleFolderRail, openShare,
    closeShare, openMobileQuestions, closeMobileQuestions, changeAnswer, changeQuery, changeFilter, selectQuestion, openQuestionDetail, closeQuestionDetail,
    selectQuestionFromList, changeSlide, handleSlidePageKeyDown, resetSlidePageInput,
    toggleStatus, togglePresentationAutoplay, toggleQuestionPins,
    changePresentationQrPlacement,
    saveQuestionCategories, reportActionError, submitAnswer, resolveDetailQuestion,
    changeNoteDraft, saveNoteOnBlur, openDeleteSlide,
    closeDeleteSlide, confirmDeleteSlide, startQuestionPanelResize, resizeQuestionPanel,
    finishQuestionPanelResize, cancelQuestionPanelResize, resizeQuestionPanelByKeyboard,
    openPresentation, copyJoinLink, goHome
  } = useSessionAdminController();

  if (!ready) return <LoadingScreen />;
  if (!session || !slide) return <div className={`${styles.root} empty-state`}><h1>{t("session.notFound")}</h1><button className="btn primary" onClick={goHome}>{t("common.home")}</button></div>;

  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(session.questionCategories, category, defaultCategoryLabel);
  const categoryClass = (category: QuestionCategory) => questionCategoryClass(session.questionCategories, category);
  const noteStatus = noteSavingSlideId === slide.id
    ? t("session.speakerNotesSaving")
    : noteDirty
      ? t("session.speakerNotesPending")
      : noteSavedSlideId === slide.id
        ? t("session.speakerNotesSaved")
        : t("session.speakerNotesAutosaveHint");
  return <>
    <div
      className={`${styles.root} session-admin-shell ${folderRailOpen ? "" : "folder-rail-collapsed"}`}
      style={{ "--question-panel-width": `${questionPanelWidth}px` } as React.CSSProperties}
      inert={lectureSaving}
      aria-busy={lectureSaving}
    >
      <aside className={`session-folder-rail folder-accent-${folderAccentIndex}`}>
        <div className="folder-rail-head">
          {folderRailOpen && <Link href={folderHref}><ArrowLeft />{t("session.backToFolder")}</Link>}
          <button type="button" onClick={toggleFolderRail} aria-label={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")} title={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")}>{folderRailOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
        </div>
        {folderRailOpen && <>
          <div className="folder-rail-title"><span className="folder-rail-file-icon" style={{ "--folder-file-list-icon": `url(${fileListIcon.src})` } as React.CSSProperties} aria-hidden="true" /><span><small>{t("session.folderMaterials")}</small><b>{folder?.name ?? t("folders.unfiled")}</b></span></div>
          <nav aria-label={t("session.folderMaterials")}>
            {folderSessions.map((item) => <Link key={item.id} href={`/admin/session/${item.id}`} className={item.id === session.id ? "active" : ""} aria-current={item.id === session.id ? "page" : undefined}><span className="folder-rail-thumb"><SlideCanvas slide={item.slides[0]} compact /></span><span><b>{item.title}</b><small>{item.slides.length} {t("common.slide")}</small></span></Link>)}
          </nav>
        </>}
      </aside>
      <main className="session-admin-main">
        <div className="workspace-tabs">
          <button className={tab === "live" ? "active" : ""} onClick={showLive}><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.803a1 1 0 0 1 1.5-.865l9 5.195a1 1 0 0 1 0 1.733l-9 5.196a1 1 0 0 1-1.5-.866z" /></svg>{t("session.livePlayer")}<span>{questionCounts.unanswered}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={showQuestions}><MessageCircleQuestion />{t("session.questionList")}<span>{questionCounts.total}</span></button>
          <div className="top-actions"><Link className="btn secondary" href={`/admin/session/${session.id}/qa-studio`}>QA Studio</Link><Link className="btn secondary" href={`/admin/session/${session.id}/report`}>결과보고서</Link><SessionRuntime session={session} /><span className={`session-state-badge ${session.status}`}><i />{t(session.status === "live" ? "session.liveLabel" : "session.stoppedLabel")}</span><button className="btn secondary" onClick={toggleStatus}>{session.status === "live" ? <><Pause />{t("session.end")}</> : <><Play />{t("session.restart")}</>}</button><button className="btn secondary" onClick={openShare}><Share2 />{t("session.joinLink")}</button><button className="btn primary presentation-launch" onClick={openPresentation} title={t("session.openSlideshow")}><MonitorUp />{t("session.slideshow")}</button></div>
        </div>
        {presentationError
          ? <div className="login-error" role="alert">{presentationError}</div>
          : actionError && <div className="login-error" role="alert">{actionError} {t("common.tryAgain")}</div>}

        {tab === "live" ? (
          <div className="player-workspace" ref={playerWorkspaceRef}>
            <section className="player-stage">
              <header className="mobile-remote-heading">
                <h1>{t("session.mobileRemote")}</h1>
                <p>{session.title}</p>
              </header>
              <div className="stage-toolbar">
                <div className="stage-toolbar-status"><span className={`status-dot ${session.status}`} /><b title={session.title}>{session.title}</b></div>
                <div className="stage-toolbar-actions">
                  <div className="stage-qr-placement">
                    <QrCode aria-hidden="true" />
                    <label className="sr-only" htmlFor="stage-qr-placement">{t("session.qrPosition")}</label>
                    <select
                      id="stage-qr-placement"
                      value={session.showPresentationQr ? session.presentationQrPosition : "hidden"}
                      onChange={(event) => changePresentationQrPlacement(event.target.value)}
                    >
                      <option value="hidden">{t("session.qrHidden")}</option>
                      <option value="top-right">{t("session.qrTopRight")}</option>
                      <option value="top-left">{t("session.qrTopLeft")}</option>
                      <option value="bottom-right">{t("session.qrBottomRight")}</option>
                      <option value="bottom-left">{t("session.qrBottomLeft")}</option>
                    </select>
                  </div>
                  <span className="stage-autoplay-control">
                    <span>{t("session.presentationAutoplay")}</span>
                    <SessionToggle
                      checked={session.presentationAutoplay}
                      label={t(session.presentationAutoplay ? "session.turnAutoplayOff" : "session.turnAutoplayOn")}
                      onClick={togglePresentationAutoplay}
                    />
                  </span>
                  <button type="button" className="stage-slide-action stage-delete-slide" disabled={session.slides.length <= 1} onClick={() => openDeleteSlide(slide.id)} title={t(session.slides.length <= 1 ? "session.deleteLastSlideHint" : "session.deleteSlideHint")}>
                    <span className="stage-delete-icon" style={{ "--stage-delete-icon": `url(${deleteIcon.src})` } as React.CSSProperties} aria-hidden="true" />
                    <span>{t("session.deleteSlide")}</span>
                  </button>
                </div>
              </div>
              <div className="stage-canvas-wrap" onWheel={handleSlideWheel}><SlideCanvas slide={slide} questions={slideQuestions} questionCategories={session.questionCategories} selectedId={selected?.id} onSelectPin={openQuestionDetail} showPins={session.showQuestionPins} /></div>
              <nav className="player-controls" aria-label={t("session.slideNavigation")}>
                <button type="button" className="slide-nav-button" disabled={session.currentSlide === 0} onClick={() => changeSlide(session.currentSlide - 1)} aria-label={t("session.previousSlide")}><ChevronLeft /><span>{t("session.previous")}</span></button>
                <label className="slide-page-picker">
                  <span className="sr-only">{t("session.slideNumberInput", { count: session.slides.length })}</span>
                  <input key={slide.id} type="number" inputMode="numeric" min={1} max={session.slides.length} defaultValue={session.currentSlide + 1} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} onKeyDown={handleSlidePageKeyDown} onBlur={(event) => resetSlidePageInput(event.currentTarget)} />
                  <span aria-hidden="true">/ {session.slides.length}</span>
                </label>
                <button type="button" className="slide-nav-button" disabled={session.currentSlide === session.slides.length - 1} onClick={() => changeSlide(session.currentSlide + 1)} aria-label={t("session.nextSlide")}><span>{t("session.next")}</span><ChevronRight /></button>
              </nav>
              <button type="button" className="mobile-remote-questions" onClick={openMobileQuestions}>
                <MessageCircleQuestion aria-hidden="true" />
                <span>{t("session.questionList")}</span>
                <b>{slideQuestions.length}</b>
              </button>
              <section className="mobile-remote-settings" aria-label={t("session.mobileRemoteSettings")}>
                <div className="mobile-remote-setting">
                  <span>{t("session.pinLive")}</span>
                  <SessionToggle
                    checked={session.showQuestionPins}
                    label={t(session.showQuestionPins ? "session.turnPinsOff" : "session.turnPinsOn")}
                    onClick={toggleQuestionPins}
                  />
                </div>
                <div className="mobile-remote-setting">
                  <span>{t("session.presentationAutoplay")}</span>
                  <SessionToggle
                    checked={session.presentationAutoplay}
                    label={t(session.presentationAutoplay ? "session.turnAutoplayOff" : "session.turnAutoplayOn")}
                    onClick={togglePresentationAutoplay}
                  />
                </div>
                <div className="mobile-remote-setting">
                  <label htmlFor="mobile-remote-qr-placement">{t("session.qrPosition")}</label>
                  <select
                    id="mobile-remote-qr-placement"
                    value={session.showPresentationQr ? session.presentationQrPosition : "hidden"}
                    onChange={(event) => changePresentationQrPlacement(event.target.value)}
                  >
                    <option value="hidden">{t("session.qrHidden")}</option>
                    <option value="top-right">{t("session.qrTopRight")}</option>
                    <option value="top-left">{t("session.qrTopLeft")}</option>
                    <option value="bottom-right">{t("session.qrBottomRight")}</option>
                    <option value="bottom-left">{t("session.qrBottomLeft")}</option>
                  </select>
                </div>
              </section>
              <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => {
                const questionCount = questionsBySlide.get(index)?.length ?? 0;
                return <button key={item.id} className={index === session.currentSlide ? "active" : ""} aria-current={index === session.currentSlide ? "page" : undefined} onClick={() => changeSlide(index)}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{questionCount > 0 && <i>{questionCount}</i>}</button>;
              })}</div>
              <section className="stage-speaker-note" aria-labelledby="speaker-note-label">
                <div className="stage-speaker-note-head"><span><FileText /><b id="speaker-note-label">{t("session.speakerNotesSlide", { number: session.currentSlide + 1 })}</b></span><small><Check />{t("session.speakerNotesPrivate")}</small></div>
                <textarea
                  id="speaker-note"
                  aria-labelledby="speaker-note-label"
                  value={noteDraft}
                  maxLength={10000}
                  placeholder={t("session.speakerNotesHint")}
                  onChange={(event) => changeNoteDraft(event.target.value)}
                  onBlur={saveNoteOnBlur}
                />
                <div className="stage-speaker-note-actions"><span>{noteDraft.length.toLocaleString()} / 10,000</span><span role="status" aria-live="polite">{noteStatus}</span></div>
              </section>
            </section>
            <aside className="live-questions">
              <div
                className="question-panel-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={t("session.resizeQuestions")}
                aria-valuemin={MIN_QUESTION_PANEL}
                aria-valuemax={MAX_QUESTION_PANEL}
                aria-valuenow={questionPanelWidth}
                tabIndex={0}
                onPointerDown={startQuestionPanelResize}
                onPointerMove={resizeQuestionPanel}
                onPointerUp={finishQuestionPanelResize}
                onPointerCancel={cancelQuestionPanelResize}
                onKeyDown={resizeQuestionPanelByKeyboard}
              ><GripVertical /></div>
                <div className="panel-heading">
                <div><h2>{t("session.liveQuestions")}</h2><p>{t("common.currentQuestionsCount", { count: slideQuestions.length })}</p></div>
                <div className="panel-heading-actions">
                  <span className="pulse-dot" aria-hidden="true" />
                  <SessionToggle
                    checked={session.showQuestionPins}
                    label={t(session.showQuestionPins ? "session.turnPinsOff" : "session.turnPinsOn")}
                    onClick={toggleQuestionPins}
                  />
                </div>
                </div>
                <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} questionCategories={session.questionCategories} onClick={() => selectQuestion(q.id)} />) : <div className="no-questions"><MessageCircleQuestion /><b>{t("session.noQuestions")}</b><span>{t("session.noQuestionsHint1")}<br />{t("session.noQuestionsHint2")}</span></div>}</div>
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>{t("session.questionList")}</h1><p>{t("session.questionsDescription")}</p></div><div className="kpi-inline"><span><b>{questionCounts.total}</b>{t("session.totalQuestions")}</span><span><b>{questionCounts.unanswered}</b>{t("status.unanswered")}</span><span><b>{questionCounts.resolved}</b>{t("status.resolved")}</span></div></div>
            <QuestionCategoryManager
              key={JSON.stringify(session.questionCategories)}
              initialSettings={session.questionCategories}
              usedCategories={session.questions.map((question) => question.category)}
              onSave={saveQuestionCategories}
              onError={reportActionError}
            />
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={t("session.searchQuestions")} /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => changeFilter(item)}>{item === "all" ? t("common.all") : item === "unanswered" ? t("status.unanswered") : item === "answered" ? t("status.answered") : t("status.resolved")}</button>)}</div><button className="btn secondary"><ListFilter />{t("common.filter")}</button></div>
            <div className="question-table"><div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.category")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => selectQuestionFromList(q.id, q.slideIndex)}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><em className={`category ${categoryClass(q.category)}`}>{questionMarkerEmoji(q.marker) && <i aria-hidden="true">{questionMarkerEmoji(q.marker)}</i>}{categoryLabel(q.category)}</em></span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {detailQuestion && <QuestionDetailDialog
        question={detailQuestion}
        questionCategories={session.questionCategories}
        onClose={closeQuestionDetail}
        answerEditor={<div><label htmlFor="instructor-answer">강사 답변</label><textarea id="instructor-answer" value={answer} onChange={event=>changeAnswer(event.target.value)} placeholder="답변을 입력하세요" rows={3} style={{width:'100%'}} />{actionError&&<p role="alert">{actionError}</p>}<button type="button" className="btn secondary" onClick={resolveDetailQuestion}>해결 처리</button><button type="button" className="btn primary" disabled={!answer.trim()} onClick={submitAnswer}>답변 전송</button></div>}
      />}
      {deleteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeleteSlide(); }}>
        <section className="delete-slide-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-slide-title" aria-describedby="delete-slide-description">
          <button type="button" className="modal-close" disabled={deletingSlide} onClick={closeDeleteSlide} aria-label={t("common.cancel")}><X /></button>
          <span className="delete-slide-icon"><Trash2 /></span>
          <h2 id="delete-slide-title">{t("session.deleteSlideTitle")}</h2>
          <p id="delete-slide-description">{t("session.deleteSlideDescription", { number: deleteTarget.pageIndex + 1 })}</p>
          <div className="delete-slide-preview"><SlideCanvas slide={deleteTarget} compact /><span>{deleteTarget.pageIndex + 1}</span></div>
          <div className="delete-slide-warning"><b>{t("session.deleteSlideWarning")}</b>{deleteTargetQuestionCount > 0 && <span>{t("session.deleteSlideQuestions", { count: deleteTargetQuestionCount })}</span>}</div>
          {deleteSlideError && <div className="login-error" role="alert">{deleteSlideError} {t("common.tryAgain")}</div>}
          <div className="delete-slide-actions">
            <button type="button" className="btn secondary" disabled={deletingSlide} onClick={closeDeleteSlide}>{t("common.cancel")}</button>
            <button type="button" className="btn destructive" disabled={deletingSlide} onClick={confirmDeleteSlide}>{deletingSlide ? <><span className="spinner" />{t("session.deletingSlide")}</> : <><Trash2 />{t("session.deleteSlideConfirm")}</>}</button>
          </div>
        </section>
      </div>}
      {shareOpen && <div className="modal-backdrop" onMouseDown={closeShare}><div className="share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={closeShare} aria-label={t("question.closeDetail")}><X /></button><div className="modal-icon"><Users /></div><h2>{t("session.inviteTitle")}</h2><p>{t("session.inviteDescription1")}<br />{t("session.inviteDescription2")}</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>{t("session.joinCode")}</span><b>{session.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copyJoinLink} aria-label={t("session.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copyJoinLink}>{copied ? <><Check />{t("session.copied")}</> : <><Copy />{t("session.copyJoinLink")}</>}</button></div></div>}
      {mobileQuestionsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMobileQuestions(); }}>
        <section className="mobile-questions-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-questions-title">
          <button type="button" className="modal-close" onClick={closeMobileQuestions} aria-label={t("session.closeQuestions")}><X /></button>
          <div className="panel-heading"><div><h2 id="mobile-questions-title">{t("session.liveQuestions")}</h2><p>{t("common.currentQuestionsCount", { count: slideQuestions.length })}</p></div></div>
          <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} questionCategories={session.questionCategories} onClick={() => { selectQuestion(q.id); closeMobileQuestions(); }} />) : <div className="no-questions"><MessageCircleQuestion /><b>{t("session.noQuestions")}</b><span>{t("session.noQuestionsHint1")}<br />{t("session.noQuestionsHint2")}</span></div>}</div>
        </section>
      </div>}
    </div>
  </>;
}
