"use client";

import { useEffect, useId, useRef, type RefObject, type ReactNode } from "react";
import { PinComposer } from "@/app/component/pin-composer";
import { X } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { StatusBadge } from "@/app/component/status-badge";
import { questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type Question, type QuestionCategorySettings } from "@/app/_model/types";
import styles from "./question-detail-dialog.module.css";

export function QuestionDetailDialog({ question, questionCategories, onClose, canvasRef, answerEditor }: {
  answerEditor?: ReactNode;
  canvasRef?: RefObject<HTMLDivElement | null>;
  question: Question;
  questionCategories: QuestionCategorySettings;
  onClose: () => void;
}) {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const categoryLabel = questionCategoryLabel(questionCategories, question.category, defaultCategoryLabel);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (canvasRef) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [question.id, canvasRef]);

  const content = (
      <section
        ref={dialogRef}
        className="question-detail-dialog"
        role={canvasRef ? undefined : "dialog"}
        aria-modal={canvasRef ? undefined : true}
        aria-labelledby={canvasRef ? undefined : titleId}
        tabIndex={-1}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("question.closeDetail")}><X /></button>
        <div className="question-detail-heading">
          <span className={`category ${questionCategoryClass(questionCategories, question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{categoryLabel}</span>
          <span>{t("common.slideLabel", { number: question.slideIndex + 1 })}</span>
        </div>
        <h2 id={canvasRef ? "question-modal-title" : titleId}>{t("question.questionAndAnswer")}</h2>
        <p className="question-detail-question">{question.text}</p>
        <div className="question-detail-meta">
          <StatusBadge status={question.status} />
          <time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
        </div>
        <div className={`question-detail-answer ${question.answer ? "" : "pending"}`}>
          <span>{t("question.instructorAnswer")}</span>
          <p>{question.answer ?? t("question.noAnswer")}</p>
        </div>
        {answerEditor ?? <button type="button" className="btn primary large full" onClick={onClose}>{t("common.confirm")}</button>}
      </section>
  );
  if (canvasRef) return <div className={`${styles.root} ${styles.anchored}`}><PinComposer canvasRef={canvasRef} x={question.x ?? 0.5} y={question.y ?? 0.5} onClose={onClose}>{content}</PinComposer></div>;
  return <div className={`${styles.root} question-detail-backdrop`} onMouseDown={event => { if(event.target === event.currentTarget) onClose(); }}>{content}</div>;
}
