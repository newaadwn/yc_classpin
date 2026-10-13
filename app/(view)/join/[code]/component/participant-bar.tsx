"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, EllipsisVertical, LogOut, MapPin, Maximize2, MessageCirclePlus, MessageSquareText, Minimize2, PenLine, Smile, X } from "@/app/component/icons";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { useLanguage } from "@/app/_controller/language-context";
import { LECTURE_REACTION_EMOJIS, type LectureReactionEmoji } from "@/app/_model/lecture-reactions";
import styles from "./participant-bar.module.css";

type Tool = "pin" | "emoji";
type Menu = "ask" | "more" | null;
const PIN_HINT_MS = 4000;

/**
 * 화상회의 앱처럼 화면 아래에 모은 참여자 도구.
 * 가운데: 페이지·LIVE, 반응, 질문하기(PIN / 글), 더보기, 나가기 · 오른쪽: 질문 목록 + 새 답변 알림.
 */
export function ParticipantBar(props: {
  code: string;
  current: number;
  liveIndex: number;
  following: boolean;
  pageCount: number;
  activeTool: Tool;
  questionsVisible: boolean;
  questionCount: number;
  finalHref: string;
  emojiError: string | null;
  newAnswer: { id: string; text: string; count: number } | null;
  focusMode: boolean;
  onPage: (index: number) => void;
  onSync: () => void;
  onTool: (tool: Tool) => void;
  onEmoji: (emoji: LectureReactionEmoji) => void;
  onToggleQuestions: () => void;
  onWriteQuestion: () => void;
  onOpenAnswer: (questionId: string) => void;
  onDismissAnswer: (questionId: string) => void;
  onToggleFocus: () => void;
}) {
  const { code, current, liveIndex, following, pageCount, activeTool, questionsVisible, questionCount, finalHref, emojiError, newAnswer, focusMode, onTool } = props;
  const { t } = useLanguage();
  const [menu, setMenu] = useState<Menu>(null);
  const [pinHint, setPinHint] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const trayOpen = activeTool === "emoji";

  useEffect(() => {
    if (!pinHint) return;
    const timer = setTimeout(() => setPinHint(false), PIN_HINT_MS);
    return () => clearTimeout(timer);
  }, [pinHint]);

  // Escape: 열린 메뉴 → 이모지 트레이 순서로 닫는다. 메뉴 바깥을 누르면 메뉴만 닫는다.
  useEffect(() => {
    if (!trayOpen && !menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) setMenu(null);
      else onTool("pin");
    };
    const onPointer = (event: PointerEvent) => {
      const wrap = menu === "ask" ? askRef.current : menu === "more" ? moreRef.current : null;
      if (wrap && !wrap.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onPointer); };
  }, [menu, trayOpen, onTool]);

  const toggleMenu = (next: Exclude<Menu, null>) => { setPinHint(false); setMenu((open) => open === next ? null : next); };
  const choosePin = () => { setMenu(null); onTool("pin"); setPinHint(true); };
  const chooseText = () => { setMenu(null); setPinHint(false); props.onWriteQuestion(); };
  const liveLabel = following ? t("student.followingLive", { page: liveIndex + 1 }) : t("student.backToLive", { page: liveIndex + 1 });
  const questionsLabel = questionsVisible ? t("student.hideQuestions") : t("student.showQuestions", { count: questionCount });
  const notice = emojiError ?? (pinHint ? t("student.pinPrompt") : null);

  return (
    <nav className={styles.bar} aria-label={t("student.toolbar")}>
      <div className={styles.center} role="toolbar" aria-label={t("student.questionTools")}>
        {trayOpen && <div className={styles.tray} role="group" aria-label={t("student.chooseEmoji")}>
          {LECTURE_REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => props.onEmoji(emoji)} aria-label={t("student.sendReaction", { emoji })} title={t("student.sendReaction", { emoji })}>{emoji}</button>)}
        </div>}
        {notice && <p className={`${styles.toast} ${trayOpen ? styles.raised : ""} ${emojiError ? styles.error : ""}`} role={emojiError ? "alert" : "status"}>{notice}</p>}

        <div className={styles.group} aria-label={t("student.chooseQuestionSlide")}>
          <button type="button" disabled={current === 0} onClick={() => props.onPage(current - 1)} aria-label={t("session.previousSlide")} title={t("session.previousSlide")}><ChevronLeft /></button>
          <button type="button" className={`${styles.live} ${following ? styles.following : ""}`} aria-pressed={following} onClick={following ? undefined : props.onSync} aria-label={liveLabel} title={liveLabel}>
            <b>{current + 1}<span>/{pageCount}</span></b>
            <small>{following ? <><i aria-hidden="true" />LIVE</> : t("student.toLive")}</small>
          </button>
          <button type="button" disabled={current >= pageCount - 1} onClick={() => props.onPage(current + 1)} aria-label={t("session.nextSlide")} title={t("session.nextSlide")}><ChevronRight /></button>
        </div>

        <button type="button" className={styles.round} aria-pressed={trayOpen} onClick={() => { setMenu(null); onTool(trayOpen ? "pin" : "emoji"); }} aria-label={t("student.emojiTool")} title={t("student.emojiTool")}><Smile /></button>

        <div className={styles.menuWrap} ref={askRef}>
          <button type="button" className={styles.ask} aria-expanded={menu === "ask"} aria-haspopup="true" aria-controls="participant-ask-menu" onClick={() => toggleMenu("ask")} aria-label={t("student.ask")} title={t("student.ask")}>
            <MessageCirclePlus /><span>{t("student.ask")}</span>
          </button>
          {menu === "ask" && <div id="participant-ask-menu" className={`${styles.menu} ${styles.askMenu}`}>
            <button type="button" className={styles.option} onClick={choosePin}><MapPin /><span><b>{t("student.askPin")}</b><small>{t("student.askPinHint")}</small></span></button>
            <button type="button" className={styles.option} onClick={chooseText}><PenLine /><span><b>{t("student.writeQuestion")}</b><small>{t("student.askTextHint")}</small></span></button>
          </div>}
        </div>

        <div className={styles.menuWrap} ref={moreRef}>
          <button type="button" className={styles.round} aria-expanded={menu === "more"} aria-haspopup="true" aria-controls="participant-more-menu" onClick={() => toggleMenu("more")} aria-label={t("student.moreOptions")} title={t("student.moreOptions")}><EllipsisVertical /></button>
          {menu === "more" && <div id="participant-more-menu" className={`${styles.menu} ${styles.moreMenu}`}>
            <button type="button" className={styles.option} onClick={() => { setMenu(null); props.onToggleFocus(); }}>
              {focusMode ? <Minimize2 /> : <Maximize2 />}<span><b>{focusMode ? t("presentation.exitFullscreen") : t("presentation.startFullscreen")}</b></span>
            </button>
            <p><span>{t("student.joinCodeLabel")}</span><b>{code}</b></p>
            <div className={styles.menuRow}><span>{t("language.label")}</span><LanguageSwitcher /></div>
            <Link className={`${styles.option} ${styles.menuLeave}`} href={finalHref}><LogOut /><span><b>{t("student.leave")}</b></span></Link>
          </div>}
        </div>

        <Link className={styles.leave} href={finalHref} aria-label={t("student.leave")} title={t("student.leave")}><LogOut /></Link>
      </div>

      <div className={styles.side}>
        {newAnswer && <div className={styles.answer} role="status">
          <MessageSquareText aria-hidden="true" />
          <p><b>{newAnswer.count > 1 ? `${t("student.newAnswer")} · ${t("student.newAnswers", { count: newAnswer.count })}` : t("student.newAnswer")}</b><span>{newAnswer.text}</span></p>
          <button type="button" className={styles.view} onClick={() => props.onOpenAnswer(newAnswer.id)}>{t("student.viewAnswer")}</button>
          <button type="button" className={styles.dismiss} onClick={() => props.onDismissAnswer(newAnswer.id)} aria-label={t("student.dismissNotice")}><X /></button>
        </div>}
        <button type="button" className={styles.round} aria-pressed={questionsVisible} aria-controls="participant-questions" onClick={props.onToggleQuestions} aria-label={newAnswer ? `${questionsLabel}, ${t("student.newAnswers", { count: newAnswer.count })}` : questionsLabel} title={questionsLabel}>
          <MessageSquareText />
          {newAnswer ? <span className={`${styles.badge} ${styles.alert}`} aria-hidden="true">{newAnswer.count}</span>
            : questionCount > 0 && <span className={styles.badge} aria-hidden="true">{questionCount > 99 ? "99+" : questionCount}</span>}
        </button>
      </div>
    </nav>
  );
}
