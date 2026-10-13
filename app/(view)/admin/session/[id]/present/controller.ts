"use client";
/* eslint-disable react-hooks/preserve-manual-memoization -- Existing timer callbacks rely on stable identities; React Compiler skips this controller when the live autoplay effect is active. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, nextPresentationSlide, presentationAutoplayDelay, resolvePinDisplayPositions, resolveVisiblePresentationLabelIds } from "@/app/_model/class/presentation-rotation";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import type { Question } from "@/app/_model/types";

const CONTROLS_HIDE_DELAY = 2600;
const PIN_REVEAL_DELAY = 1000; // PIN을 하나씩 드러내는 간격(ms)
const LIVE_PIN_HIGHLIGHT_DELAY = 1000;
const PIN_MILESTONE_DISPLAY_DELAY = 3000;
const EMPTY_PLAYBACK = { slideIndex: null as number | null, shownPinIds: [] as string[], activePinId: null as string | null };
type PositionedQuestion = Question & { x: number; y: number };
const EMPTY_POSITIONED_QUESTIONS: PositionedQuestion[] = [];

export function useSessionPresentationController() {
  const { t, locale } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, ready, setActiveSession, setCurrentSlide } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const sessionId = session?.id ?? null;
  const showQuestionPins = session?.showQuestionPins ?? false;
  const slideCount = session?.slides.length ?? 0;
  const presentationAutoplay = session?.presentationAutoplay ?? false;
  const { reactions: liveReactions } = useLectureReactions(sessionId);
  const sessionTitle = session?.title;
  const currentSlide = session?.currentSlide;
  const { positionedQuestions, questionsBySlide } = useMemo(() => {
    const questions = (session?.questions ?? []).filter((question): question is PositionedQuestion => question.x !== null && question.y !== null);
    return { positionedQuestions: questions, questionsBySlide: groupQuestionsBySlide(questions) };
  }, [session]);
  const positionedQuestionIds = useMemo(() => positionedQuestions.map((question) => question.id), [positionedQuestions]);
  const positionedQuestionKey = positionedQuestionIds.join("|");
  const pageQuestions = useMemo(
    () => questionsBySlide.get(currentSlide ?? -1) ?? EMPTY_POSITIONED_QUESTIONS,
    [currentSlide, questionsBySlide]
  );
  const stageRef = useRef<HTMLElement>(null);
  const presentationCanvasRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageQuestionsRef = useRef<PositionedQuestion[]>([]);
  const previousQuestionIdsRef = useRef<string[]>([]);
  const questionSessionIdRef = useRef<string | null>(null);
  const milestoneSessionIdRef = useRef<string | null>(null);
  const highestQuestionCountRef = useRef<number | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [liveQuestionId, setLiveQuestionId] = useState<string | null>(null);
  const [storedPlayback, setStoredPlayback] = useState(EMPTY_PLAYBACK);
  const [pinMilestone, setPinMilestone] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setActiveSession(params.id);
    return () => setActiveSession(null);
  }, [params.id, setActiveSession]);

  const playback = useMemo(() => {
    if (!showQuestionPins) return EMPTY_PLAYBACK;
    const validIds = new Set(pageQuestions.map((question) => question.id));
    const shownPinIds = storedPlayback.slideIndex === currentSlide
      ? storedPlayback.shownPinIds.filter((id) => validIds.has(id))
      : [];
    if (shownPinIds.length) return {
      shownPinIds,
      activePinId: shownPinIds.includes(storedPlayback.activePinId ?? "") ? storedPlayback.activePinId : shownPinIds.at(-1) ?? null
    };
    const firstPinId = pageQuestions[0]?.id ?? null;
    return { shownPinIds: firstPinId ? [firstPinId] : [], activePinId: firstPinId };
  }, [currentSlide, pageQuestions, showQuestionPins, storedPlayback]);
  const visibleQuestionIds = useMemo(() => liveQuestionId && !playback.shownPinIds.includes(liveQuestionId)
    ? [...playback.shownPinIds, liveQuestionId]
    : playback.shownPinIds, [liveQuestionId, playback.shownPinIds]);
  const pinDisplayPositions = useMemo(() => {
    if (!canvasSize) return undefined;
    return resolvePinDisplayPositions(pageQuestions.filter((question) => question.anchorKind !== "box" && question.anchorKind !== "path"), canvasSize.width, canvasSize.height);
  }, [canvasSize, pageQuestions]);
  const activeQuestionId = liveQuestionId ?? (pageQuestions.some((question) => question.id === detailQuestionId) ? detailQuestionId : playback.activePinId);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);


  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentSlide == null) return;
    currentIndexRef.current = currentSlide;
  }, [currentSlide]);

  useEffect(() => {
    pageQuestionsRef.current = pageQuestions;
  }, [pageQuestions]);

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current?.querySelector<HTMLElement>(".slide-canvas");
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setCanvasSize((current) => current?.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sessionId]);

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current?.querySelector<HTMLElement>(".slide-canvas");
    if (!canvas || !showQuestionPins) return;
    const labels = Array.from(canvas.querySelectorAll<HTMLElement>("[data-presentation-label-id]"));
    const pins = Array.from(canvas.querySelectorAll<HTMLElement>("[data-presentation-pin-id]"));
    labels.forEach((label) => { label.hidden = false; });
    const visibleLabelIds = new Set(resolveVisiblePresentationLabelIds(
      labels.map((label) => ({ id: label.dataset.presentationLabelId!, bounds: label.getBoundingClientRect() })),
      pins.map((pin) => ({ id: pin.dataset.presentationPinId!, bounds: pin.getBoundingClientRect() })),
      activeQuestionId
    ));
    labels.forEach((label) => { label.hidden = !visibleLabelIds.has(label.dataset.presentationLabelId!); });
  }, [activeQuestionId, isFullscreen, pinDisplayPositions, showQuestionPins, visibleQuestionIds]);

  // 첫 스냅샷은 새 PIN으로 보지 않는다. 이후 현재 슬라이드에 들어온 PIN만 즉시 빨강으로 강조한다.
  useEffect(() => {
    if (!session) return;
    const previousIds = previousQuestionIdsRef.current;
    previousQuestionIdsRef.current = positionedQuestionIds;
    const firstSnapshot = questionSessionIdRef.current !== session.id;
    questionSessionIdRef.current = session.id;
    if (firstSnapshot || !session.showQuestionPins) return;
    const incoming = positionedQuestions.find((question) => !previousIds.includes(question.id) && question.slideIndex === session.currentSlide);
    if (!incoming) return;
    setLiveQuestionId(incoming.id);
    setStoredPlayback((current) => ({
      slideIndex: incoming.slideIndex,
      shownPinIds: current.slideIndex === incoming.slideIndex && current.shownPinIds.includes(incoming.id)
        ? current.shownPinIds
        : current.slideIndex === incoming.slideIndex ? [...current.shownPinIds, incoming.id] : [incoming.id],
      activePinId: incoming.id
    }));
    // id 집합이 같으면 질문 본문·답변·공감 변경만으로 강조를 재생하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionedQuestionKey, session?.id, session?.showQuestionPins]);

  useEffect(() => {
    if (!liveQuestionId) return;
    const timeout = window.setTimeout(() => setLiveQuestionId(null), LIVE_PIN_HIGHLIGHT_DELAY);
    return () => window.clearTimeout(timeout);
  }, [liveQuestionId]);

  const rotateQuestions = useCallback(() => {
    setStoredPlayback((current) => ({
      slideIndex: currentSlide ?? null,
      ...advancePinPlayback(pageQuestionsRef.current, current.slideIndex === currentSlide ? current.shownPinIds : [])
    }));
  }, [currentSlide]);

  useEffect(() => {
    if (!canRotatePinPlayback(showQuestionPins, pageQuestions.length, playback.shownPinIds.length, detailQuestionId)) return;
    const interval = window.setInterval(rotateQuestions, PIN_REVEAL_DELAY);
    return () => window.clearInterval(interval);
  }, [detailQuestionId, pageQuestions.length, playback.shownPinIds.length, rotateQuestions, showQuestionPins]);

  useEffect(() => {
    if (!sessionId) return;
    if (!showQuestionPins) {
      highestQuestionCountRef.current = positionedQuestions.length;
      return;
    }
    if (milestoneSessionIdRef.current !== sessionId) {
      milestoneSessionIdRef.current = sessionId;
      highestQuestionCountRef.current = positionedQuestions.length;
      return;
    }
    const highestCount = highestQuestionCountRef.current;
    if (highestCount === null) return;
    highestQuestionCountRef.current = Math.max(highestCount, positionedQuestions.length);
    const milestone = crossedPinMilestone(highestCount, positionedQuestions.length);
    if (milestone === null) return;
    setPinMilestone(milestone);
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
    milestoneTimerRef.current = window.setTimeout(() => {
      setPinMilestone((current) => current === milestone ? null : current);
      milestoneTimerRef.current = null;
    }, PIN_MILESTONE_DISPLAY_DELAY);
  }, [positionedQuestions.length, sessionId, showQuestionPins]);

  useEffect(() => () => {
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
  }, []);

  useEffect(() => {
    if (!sessionTitle) return;
    const previousTitle = document.title;
    document.title = `${sessionTitle} — ${t("presentation.title")}`;
    return () => { document.title = previousTitle; };
  }, [locale, sessionTitle, t]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      revealControls();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [revealControls]);

  const goToSlide = useCallback((requestedIndex: number) => {
    if (!session || session.slides.length === 0) return;
    const nextIndex = Math.min(Math.max(0, requestedIndex), session.slides.length - 1);
    if (nextIndex === currentIndexRef.current) return;
    currentIndexRef.current = nextIndex;
    setActionError(null);
    revealControls();
    void setCurrentSlide(session.id, nextIndex).catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Slide state save failed: ${detail}`, error);
      setActionError(t("presentation.syncDelay"));
      revealControls();
    });
  }, [revealControls, session, setCurrentSlide, t]);

  const autoplayDelay = presentationAutoplayDelay(
    presentationAutoplay,
    showQuestionPins,
    pageQuestions.length,
    playback.shownPinIds.length,
    slideCount,
    detailQuestionId !== null
  );
  useEffect(() => {
    if (autoplayDelay === null) return;
    const timeout = window.setTimeout(() => goToSlide(nextPresentationSlide(currentSlide ?? 0, slideCount)), autoplayDelay);
    return () => window.clearTimeout(timeout);
  }, [autoplayDelay, currentSlide, goToSlide, positionedQuestionKey, slideCount]);

  const toggleFullscreen = useCallback(async () => {
    setActionError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Fullscreen start failed: ${detail}`, error);
      setActionError(t("presentation.fullscreenError"));
      revealControls();
    }
  }, [revealControls, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!session || detailQuestionId) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button") && (event.key === " " || event.key === "Enter")) return;
      const isNavigationKey = ["ArrowRight", "PageDown", " ", "ArrowLeft", "PageUp", "Home", "End"].includes(event.key);
      if (event.repeat && isNavigationKey) {
        event.preventDefault();
        return;
      }
      const current = currentIndexRef.current;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        goToSlide(current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToSlide(current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goToSlide(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToSlide(session.slides.length - 1);
      } else if (event.key.toLowerCase() === "f") {
        if (event.repeat) return;
        event.preventDefault();
        revealControls();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailQuestionId, goToSlide, revealControls, session, toggleFullscreen]);

  const slide = session?.slides[session.currentSlide];
  const detailQuestion = session?.questions.find((question) => question.id === detailQuestionId && question.slideIndex === session.currentSlide);
  const joinUrl = typeof window === "undefined" || !session ? "" : `${window.location.origin}/join/${session.code}`;
  const openQuestionDetail = (questionId: string) => {
    setDetailQuestionId(questionId);
    revealControls();
  };
  const closePresentation = () => {
    if (window.opener) window.close();
    else if (session) router.push(`/admin/session/${session.id}`);
  };

  return {
    t,
    ready,
    session,
    slide,
    detailQuestion,
    joinUrl,
    pageQuestions,
    visibleQuestionIds,
    pinDisplayPositions,
    activeQuestionId,
    liveQuestionId,
    liveReactions,
    pinMilestone,
    positionedQuestionCount: positionedQuestions.length,
    controlsVisible,
    isFullscreen,
    actionError,
    stageRef,
    presentationCanvasRef,
    revealControls,
    openQuestionDetail,
    closeQuestionDetail: () => setDetailQuestionId(null),
    toggleFullscreen,
    previousSlide: () => goToSlide(currentIndexRef.current - 1),
    nextSlide: () => goToSlide(currentIndexRef.current + 1),
    goHome: () => router.push("/"),
    goBackToAdmin: () => session && router.push(`/admin/session/${session.id}`),
    closePresentation
  };
}
