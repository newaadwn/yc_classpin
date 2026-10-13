"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { LECTURE_REACTION_EVENT, lectureReactionTopic, type LectureReactionEmoji } from "@/app/_model/lecture-reactions";
import { questionsByEmpathy, questionsByNewest } from "@/app/_model/question-reactions";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { publishRealtimeReaction } from "@/app/_service/realtime-reaction-service";
import { useAiQuestion } from "./use-ai-question";
import { useAnswerNotices } from "./use-answer-notices";
import { acceptsQuestionCategory, enabledQuestionCategories, questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type Question, type QuestionCategory, type QuestionMarker } from "@/app/_model/types";

type StudentTool = "pin" | "emoji";
type QuestionSort = "empathy" | "newest";

type DraftQuestion = {
  x: number;
  y: number;
  category: QuestionCategory;
  marker: QuestionMarker;
  text: string;
};
const EMPTY_QUESTIONS: Question[] = [];

export function useJoinSessionController() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const finalHref = `/join/${encodeURIComponent(params.code)}/final`;
  const { sessions, ready, addQuestion, updateQuestion, moveQuestionPin, reactToQuestion, loadSessionByCode, setActiveSession } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const { reactions: liveReactions, addReaction } = useLectureReactions(session?.id ?? null);
  const [activeTool, setActiveTool] = useState<StudentTool>("pin");
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionSort, setQuestionSort] = useState<QuestionSort>("empathy");
  const [questionsVisible, setQuestionsVisible] = useState(true);
  const [pendingReactionIds, setPendingReactionIds] = useState<Set<string>>(new Set());
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [pendingManualText, setPendingManualText] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  const panelBeforeFocus = useRef(true);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code).finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);

  useEffect(() => {
    setActiveSession(session?.id ?? null);
    return () => setActiveSession(null);
  }, [session?.id, setActiveSession]);

  const current = slideIndex ?? session?.currentSlide ?? 0;
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const slideQuestions = useMemo(() => questionsBySlide.get(current) ?? EMPTY_QUESTIONS, [current, questionsBySlide]);
  const submittedQuestions = useMemo(() => questionSort === "empathy"
    ? questionsByEmpathy(slideQuestions)
    : questionsByNewest(slideQuestions), [questionSort, slideQuestions]);
  const visibleQuestionIds = useMemo(() => slideQuestions
    .filter((question) => question.isMine || question.id === selectedQuestionId)
    .map((question) => question.id), [selectedQuestionId, slideQuestions]);
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: current,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: (index) => {
      setSlideIndex(index);
      setComposerOpen(false);
      setEditingQuestionId(null);
      setViewingQuestionId(null);
    }
  });

  const answerNotices = useAnswerNotices(session?.questions, session?.id);

  // 전체 화면(집중 보기): 헤더와 질문 목록을 접고 슬라이드를 최대한 크게 보여 준다.
  // 브라우저 전체 화면을 지원하면 함께 켜고, 사용자가 Esc 로 빠져나오면 집중 보기도 끝낸다.
  const exitFocusMode = () => {
    if (!focusModeRef.current) return;
    focusModeRef.current = false;
    setFocusMode(false);
    setQuestionsVisible(panelBeforeFocus.current);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  const exitFocusModeRef = useRef(exitFocusMode);
  useEffect(() => { exitFocusModeRef.current = exitFocusMode; });
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) exitFocusModeRef.current(); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const ai = useAiQuestion({
    session,
    current,
    goToPage: (page) => {
      setSlideIndex(page);
      setComposerOpen(false);
      setEditingQuestionId(null);
      setViewingQuestionId(null);
    },
    selectQuestion: setSelectedQuestionId,
    addQuestion,
    updateQuestion,
    moveQuestionPin,
    reactToQuestion,
    onManualFallback: (text) => {
      setPendingManualText(text);
      setActiveTool("pin");
    }
  });

  if (!ready || (!session && !lookupDone)) return { state: "loading" as const };
  if (!session) return { state: "missing" as const, t };
  if (session.status !== "live") return { state: "ended" as const, finalHref, t };

  const slide = session.slides[current];
  const draftQuestion = draftQuestions[slide.id];
  const viewingQuestion = viewingQuestionId ? slideQuestions.find((question) => question.id === viewingQuestionId) : null;
  const categoryOptions = enabledQuestionCategories(session.questionCategories);
  const defaultCategory = categoryOptions[0] ?? "concept";
  const activeCategory = draftQuestion?.category ?? defaultCategory;
  const activeMarker = draftQuestion?.marker ?? "pin";
  const activeMarkerEmoji = questionMarkerEmoji(activeMarker);
  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(session.questionCategories, category, defaultCategoryLabel);
  const categoryClass = (category: QuestionCategory) => questionCategoryClass(session.questionCategories, category);
  const markerLabel = (marker: QuestionMarker) => t(marker === "pin"
    ? "student.markerPin"
    : marker === "question"
      ? "student.markerQuestion"
      : marker === "smile"
        ? "student.markerSmile"
        : "student.markerIdea");
  const draftText = draftQuestion?.text ?? "";

  const placeDraftTag = (x: number, y: number, nextCategory = activeCategory) => {
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      return {
        ...currentDrafts,
        [slide.id]: {
          x,
          y,
          category: currentDraft?.category ?? nextCategory,
          marker: currentDraft?.marker ?? "pin",
          text: currentDraft?.text ?? pendingManualText
        }
      };
    });
    setSubmitted(false);
    setComposerOpen(true);
  };

  const selectCategory = (nextCategory: QuestionCategory) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, category: nextCategory } };
    });
  };

  const selectMarker = (marker: QuestionMarker) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, marker } };
    });
  };

  const startEditingQuestion = (questionId: string) => {
    const question = slideQuestions.find((item) => item.id === questionId);
    if (!question) return;
    setSelectedQuestionId(question.id);
    if (!question.isMine) return;
    if (question.status !== "unanswered" || question.answer) {
      setEditingQuestionId(null);
      setViewingQuestionId(question.id);
      setSubmitted(false);
      setSubmitError(null);
      setComposerOpen(true);
      return;
    }
    if (question.x === null || question.y === null) { ai.startMoving(question.id); return; }
    setDraftQuestions((currentDrafts) => ({
      ...currentDrafts,
      [slide.id]: {
        x: question.x!,
        y: question.y!,
        category: acceptsQuestionCategory(session.questionCategories, question.category) ? question.category : defaultCategory,
        marker: question.marker,
        text: question.text
      }
    }));
    setEditingQuestionId(question.id);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(true);
  };

  const updateDraftText = (text: string) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, text } };
    });
  };

  const clearDraftQuestion = () => {
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slide.id]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slide.id];
      return nextDrafts;
    });
  };

  const startMovingDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    pinDragged.current = false;
    pinDragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const canvas = event.currentTarget.closest(".slide-canvas")?.getBoundingClientRect();
    if (!canvas) return;
    const start = pinDragStart.current;
    if (!pinDragged.current && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    pinDragged.current = true;
    const x = Math.min(1, Math.max(0, (event.clientX - canvas.left) / canvas.width));
    const y = Math.min(1, Math.max(0, (event.clientY - canvas.top) / canvas.height));
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, x, y } };
    });
  };

  const finishMovingDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    moveDraftTag(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pinDragStart.current = null;
  };

  const openDraftComposer = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!pinDragged.current) setComposerOpen(true);
    pinDragged.current = false;
  };

  const submit = async () => {
    if (!draftQuestion || submitting) return;
    const values = {
      category: draftQuestion.category,
      marker: draftQuestion.marker,
      text: draftQuestion.text.trim() || categoryLabel(draftQuestion.category)
    };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(session.id, editingQuestionId, values);
      } else {
        await addQuestion(session.id, {
          slideIndex: current,
          anchorKind: "point",
          x: draftQuestion.x,
          y: draftQuestion.y,
          width: null,
          height: null,
          path: null,
          ...values
        });
        setPendingManualText("");
      }
      setSubmitted(true);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Question save failed: ${detail}`, error);
      setSubmitError(editingQuestionId ? t("student.editError") : t("student.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const closeComposer = () => {
    if (submitted || editingQuestionId) {
      clearDraftQuestion();
      setSubmitted(false);
    }
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setComposerOpen(false);
  };

  const deleteDraftQuestion = () => {
    clearDraftQuestion();
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };

  const selectTool = (tool: StudentTool) => {
    if (tool !== activeTool) {
      clearDraftQuestion();
      setEditingQuestionId(null);
      setViewingQuestionId(null);
      setSubmitError(null);
      setSubmitted(false);
      setComposerOpen(false);
    }
    setActiveTool(tool);
  };

  const changeSlide = (index: number) => {
    setSlideIndex(index);
    setSelectedQuestionId(null);
    closeComposer();
  };

  const syncToLiveSlide = () => {
    setSlideIndex(null);
    setSelectedQuestionId(null);
    closeComposer();
  };

  const selectQuestionSort = (sort: string) => {
    if (sort === "empathy" || sort === "newest") setQuestionSort(sort);
  };

  const toggleQuestionReaction = async (question: Question) => {
    if (question.isMine || pendingReactionIds.has(question.id)) return;
    setReactionError(null);
    setPendingReactionIds((currentIds) => new Set(currentIds).add(question.id));
    try {
      await reactToQuestion(session.id, question.id, !question.reactedByMe);
    } catch (error) {
      console.error("Question empathy update failed", error);
      setReactionError(t("student.empathyError"));
    } finally {
      setPendingReactionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(question.id);
        return nextIds;
      });
    }
  };

  const sendEmojiReaction = async (emoji: LectureReactionEmoji) => {
    setEmojiError(null);
    const reaction = { id: crypto.randomUUID(), emoji };
    addReaction(reaction);
    try {
      await publishRealtimeReaction(lectureReactionTopic(session.id), LECTURE_REACTION_EVENT, reaction);
    } catch (error) {
      console.error("Lecture emoji reaction failed", error);
      setEmojiError(t("student.reactionError"));
    }
  };

  return {
    state: "live" as const,
    ai,
    t,
    timeAgo,
    finalHref,
    session,
    liveReactions,
    activeTool,
    slideIndex,
    current,
    slide,
    draftQuestion,
    draftText,
    editingQuestionId,
    viewingQuestion,
    submitted,
    submitting,
    submitError,
    composerOpen,
    selectedQuestionId,
    questionSort,
    questionsVisible,
    toggleQuestionsVisible: () => setQuestionsVisible(visible => !visible),
    focusMode,
    toggleFocusMode: () => {
      if (focusModeRef.current) { exitFocusMode(); return; }
      focusModeRef.current = true;
      panelBeforeFocus.current = questionsVisible;
      setFocusMode(true);
      setQuestionsVisible(false);
      const root = document.documentElement;
      if (typeof root.requestFullscreen === "function" && !document.fullscreenElement) void root.requestFullscreen().catch(() => undefined);
    },
    newAnswerIds: answerNotices.unseen,
    dismissAnswer: answerNotices.dismiss,
    // 새 답변 알림의 "보기": 그 질문이 있는 페이지로 가서 답변을 연다 (LIVE 페이지면 계속 따라간다).
    openAnswer: (questionId: string) => {
      const question = session.questions.find((item) => item.id === questionId);
      answerNotices.dismiss(questionId);
      if (!question) return;
      exitFocusMode();
      setSlideIndex(question.slideIndex === session.currentSlide ? null : question.slideIndex);
      setSelectedQuestionId(question.id);
      setEditingQuestionId(null);
      setViewingQuestionId(question.id);
      setSubmitted(false);
      setSubmitError(null);
      setComposerOpen(true);
    },
    // 하단 막대의 "글로 질문하기": 숨긴 질문 목록을 다시 열고 AI 입력칸에 커서를 둔다.
    openTextQuestion: () => {
      exitFocusMode();
      setQuestionsVisible(true);
      setTimeout(() => {
        const input = document.getElementById("ai-question-input");
        if (!(input instanceof HTMLTextAreaElement)) return;
        input.scrollIntoView({ block: "nearest" });
        input.focus();
      }, 0);
    },
    slideQuestions,
    submittedQuestions,
    visibleQuestionIds,
    pendingReactionIds,
    reactionError,
    emojiError,
    categoryOptions,
    activeCategory,
    activeMarker,
    activeMarkerEmoji,
    categoryLabel,
    categoryClass,
    markerLabel,
    handleSlideWheel,
    placeDraftTag,
    selectCategory,
    selectMarker,
    startEditingQuestion,
    updateDraftText,
    startMovingDraftTag,
    moveDraftTag,
    finishMovingDraftTag,
    openDraftComposer,
    submit,
    closeComposer,
    deleteDraftQuestion,
    selectTool,
    changeSlide,
    syncToLiveSlide,
    selectQuestionSort,
    toggleQuestionReaction,
    sendEmojiReaction
  };
}
