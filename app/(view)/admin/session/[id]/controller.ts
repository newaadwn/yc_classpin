"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { slideIndexFromPageNumber } from "@/app/_model/class/presentation-rotation";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { CLASS_UNFILED_COLOR_INDEX, type PresentationQrPosition, type QuestionCategorySettings, type QuestionStatus } from "@/app/_model/types";

type Tab = "live" | "questions";
const PRESENTATION_QR_POSITIONS: readonly PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const MOBILE_REMOTE_MEDIA = "(max-width: 600px)";

export const MIN_QUESTION_PANEL = 300;
export const MAX_QUESTION_PANEL = 560;
const MIN_STAGE_WIDTH = 400;
const NOTE_AUTOSAVE_DELAY = 10_000;

const clampQuestionPanel = (width: number, workspaceWidth = MIN_STAGE_WIDTH + MAX_QUESTION_PANEL) =>
  Math.min(MAX_QUESTION_PANEL, Math.max(MIN_QUESTION_PANEL, Math.min(width, workspaceWidth - MIN_STAGE_WIDTH)));

const errorDetail = (error: unknown) => error && typeof error === "object" && "message" in error
  ? String(error.message)
  : String(error);

export function useSessionAdminController() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const {
    folders,
    sessions,
    ready,
    deleteSlide,
    answerQuestion,
    resolveQuestion,
    setCurrentSlide,
    setStatus,
    setPresentationAutoplay,
    setShowQuestionPins,
    setPresentationQrPlacement,
    setQuestionCategories,
    setActiveSession,
    updateSlideNote
  } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "questions" ? "questions" : "live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string,string>>({});
  const [mobileQuestionsOpen, setMobileQuestionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lectureSaving, setLectureSaving] = useState(false);
  const lectureSavingRef = useRef(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [folderRailOpen, setFolderRailOpen] = useState(true);
  const [questionPanelWidth, setQuestionPanelWidth] = useState(380);
  const playerWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingSlideId, setNoteSavingSlideId] = useState<string | null>(null);
  const [noteSavedSlideId, setNoteSavedSlideId] = useState<string | null>(null);
  const pendingNotesRef = useRef(new Map<string, { sessionId: string; body: string }>());
  const noteSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const noteSavingBodiesRef = useRef(new Map<string, string>());
  const noteSaveQueueRef = useRef(Promise.resolve());
  const activeNoteSlideIdRef = useRef<string | null>(null);
  const presentationWindowRef = useRef<Window | null>(null);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [deletingSlide, setDeletingSlide] = useState(false);
  const [deleteSlideError, setDeleteSlideError] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_REMOTE_MEDIA);
    const showMobileRemote = () => {
      if (media.matches) setTab("live");
    };
    showMobileRemote();
    media.addEventListener("change", showMobileRemote);
    return () => media.removeEventListener("change", showMobileRemote);
  }, []);

  useEffect(() => {
    setActiveSession(params.id);
    return () => setActiveSession(null);
  }, [params.id, setActiveSession]);

  useEffect(() => () => {
    noteSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    noteSaveTimersRef.current.clear();
  }, []);

  const visibleQuestions = useMemo(() => session?.questions.filter((question) =>
    (filter === "all" || question.status === filter) && question.text.toLowerCase().includes(query.toLowerCase())) ?? [], [filter, query, session]);

  const runAction = (action: Promise<void>, message: string) => {
    setActionError(null);
    void action.catch((error) => {
      console.error(`${message}: ${errorDetail(error)}`, error);
      setActionError(message);
    });
  };

  const runLectureAction = (action: () => Promise<void>, message: string) => {
    if (lectureSavingRef.current) return;
    lectureSavingRef.current = true;
    setActionError(null);
    setLectureSaving(true);
    void action()
      .catch((error) => {
        console.error(`${message}: ${errorDetail(error)}`, error);
        setActionError(message);
      })
      .finally(() => {
        lectureSavingRef.current = false;
        setLectureSaving(false);
      });
  };

  const filmstripRef = useRef<HTMLDivElement>(null);
  const currentSlide = session?.currentSlide;
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip || currentSlide == null) return;
    const active = strip.children[currentSlide] as HTMLElement | undefined;
    if (!active) return;
    const stripBox = strip.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const offset = (activeBox.left - stripBox.left) - (stripBox.width - activeBox.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + offset, behavior: "smooth" });
  }, [currentSlide]);

  const saveSlideNote = useCallback((slideId: string) => {
    const timer = noteSaveTimersRef.current.get(slideId);
    if (timer) clearTimeout(timer);
    noteSaveTimersRef.current.delete(slideId);
    const pending = pendingNotesRef.current.get(slideId);
    if (!pending || noteSavingBodiesRef.current.get(slideId) === pending.body) return;

    noteSavingBodiesRef.current.set(slideId, pending.body);
    const write = noteSaveQueueRef.current.then(async () => {
      setActionError(null);
      setNoteSavingSlideId(slideId);
      setNoteSavedSlideId(null);
      try {
        await updateSlideNote(pending.sessionId, slideId, pending.body);
        if (pendingNotesRef.current.get(slideId)?.body === pending.body) pendingNotesRef.current.delete(slideId);
        setNoteSavedSlideId(slideId);
      } catch (error) {
        console.error(`Speaker note save failed: ${errorDetail(error)}`, error);
        setActionError(t("session.saveSpeakerNotesError"));
      } finally {
        if (noteSavingBodiesRef.current.get(slideId) === pending.body) noteSavingBodiesRef.current.delete(slideId);
        setNoteSavingSlideId((current) => current === slideId ? null : current);
      }
    });
    noteSaveQueueRef.current = write;
  }, [t, updateSlideNote]);

  const changeSlide = (index: number) => {
    if (!session) return;
    const currentSlideId = session.slides[session.currentSlide]?.id;
    if (currentSlideId) saveSlideNote(currentSlideId);
    runAction(setCurrentSlide(session.id, index), t("session.saveSlideError"));
  };
  const resetSlidePageInput = (input: HTMLInputElement) => {
    if (session) input.value = String(session.currentSlide + 1);
  };
  const handleSlidePageKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!session) return;
      const index = slideIndexFromPageNumber(event.currentTarget.value, session.slides.length);
      if (index === null) return resetSlidePageInput(event.currentTarget);
      event.currentTarget.value = String(index + 1);
      if (index !== session.currentSlide) changeSlide(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetSlidePageInput(event.currentTarget);
    }
  };
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: session?.currentSlide ?? 0,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: changeSlide
  });

  const slideParamApplied = useRef(false);
  useEffect(() => {
    if (slideParamApplied.current || !session) return;
    slideParamApplied.current = true;
    const param = search.get("slide");
    if (param === null) return;
    const index = Number(param);
    if (Number.isInteger(index) && index >= 0 && index < session.slides.length) void setCurrentSlide(session.id, index);
  }, [search, session, setCurrentSlide]);

  useEffect(() => {
    if (!session || tab !== "live" || detailQuestionId || shareOpen || deleteSlideId || mobileQuestionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog, [role='dialog'], [role='alertdialog'], [role='separator']")) return;
      const next = session.currentSlide + (event.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= session.slides.length) return;
      event.preventDefault();
      void setCurrentSlide(session.id, next).catch((error) => {
        console.error("Keyboard slide navigation failed", error);
        setActionError(t("session.saveSlideError"));
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSlideId, detailQuestionId, mobileQuestionsOpen, session, setCurrentSlide, shareOpen, t, tab]);

  useEffect(() => {
    if (tab !== "live") return;
    const fitQuestionPanel = () => {
      if (window.innerWidth <= 900 || !playerWorkspaceRef.current) return;
      setQuestionPanelWidth((width) => clampQuestionPanel(width, playerWorkspaceRef.current?.clientWidth));
    };
    fitQuestionPanel();
    window.addEventListener("resize", fitQuestionPanel);
    return () => window.removeEventListener("resize", fitQuestionPanel);
  }, [tab]);

  const slide = session?.slides[session.currentSlide];
  const folder = folders.find((item) => item.id === session?.folderId);
  const folderAccentIndex = folder?.colorIndex ?? CLASS_UNFILED_COLOR_INDEX;
  const folderHref = `/admin/folders/${folder?.id ?? "unfiled"}`;
  const folderSessions = sessions.filter((item) => item.folderId === (session?.folderId ?? null));
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const questionCounts = useMemo(() => (session?.questions ?? []).reduce((counts, question) => {
    if (question.status === "unanswered") counts.unanswered += 1;
    if (question.status === "resolved") counts.resolved += 1;
    return counts;
  }, { total: session?.questions.length ?? 0, unanswered: 0, resolved: 0 }), [session?.questions]);
  const slideQuestions = questionsBySlide.get(session?.currentSlide ?? -1) ?? [];
  const selected = session?.questions.find((question) => question.id === selectedId);
  const answer = selected ? answerDrafts[selected.id] ?? "" : "";
  const setAnswer = (body: string) => { if (selected) setAnswerDrafts(drafts => ({...drafts,[selected.id]:body})); };
  const detailQuestion = session?.questions.find((question) => question.id === detailQuestionId);
  const noteDraft = slide ? noteDrafts[slide.id] ?? slide.speakerNote ?? "" : "";
  const noteDirty = Boolean(slide && noteDraft !== (slide.speakerNote ?? ""));
  const deleteTarget = deleteSlideId ? session?.slides.find((item) => item.id === deleteSlideId) : null;
  const deleteTargetQuestionCount = deleteTarget ? questionsBySlide.get(deleteTarget.pageIndex)?.length ?? 0 : 0;
  const joinUrl = typeof window === "undefined" || !session ? "" : `${window.location.origin}/join/${session.code}`;

  const openQuestionDetail = (questionId: string) => {
    setSelectedId(questionId);
    setDetailQuestionId(questionId);
  };
  const selectQuestionFromList = (questionId: string, slideIndex: number) => {
    if (!session) return;
    if (session.currentSlide !== slideIndex) changeSlide(slideIndex);
    setSelectedId(questionId);
    setDetailQuestionId(null);
    setTab("live");
  };
  const copyJoinLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const submitAnswer = () => {
    if (!session || !selected || !answer.trim()) return;
    const body = answer.trim();
    setActionError(null);
    void answerQuestion(session.id, selected.id, body)
      .then(() => setAnswer(""))
      .catch((error) => {
        console.error(`Answer save failed: ${errorDetail(error)}`, error);
        setActionError(t("session.saveAnswerError"));
      });
  };
  const resolveSelectedQuestion = () => {
    if (session && selected) runAction(resolveQuestion(session.id, selected.id), t("session.saveQuestionError"));
  };
  const changeNoteDraft = (value: string) => {
    if (!session || !slide) return;
    setNoteDrafts((current) => ({ ...current, [slide.id]: value }));
    setNoteSavedSlideId(null);
    pendingNotesRef.current.set(slide.id, { sessionId: session.id, body: value });
    const timer = noteSaveTimersRef.current.get(slide.id);
    if (timer) clearTimeout(timer);
    noteSaveTimersRef.current.set(slide.id, setTimeout(() => saveSlideNote(slide.id), NOTE_AUTOSAVE_DELAY));
  };

  useEffect(() => {
    const previousSlideId = activeNoteSlideIdRef.current;
    activeNoteSlideIdRef.current = slide?.id ?? null;
    if (previousSlideId && previousSlideId !== slide?.id) saveSlideNote(previousSlideId);
  }, [saveSlideNote, slide?.id]);
  const closeDeleteSlide = () => {
    if (deletingSlide) return;
    setDeleteSlideId(null);
    setDeleteSlideError(null);
  };
  const confirmDeleteSlide = async () => {
    if (!session || !deleteTarget || deletingSlide) return;
    setDeleteSlideError(null);
    setDeletingSlide(true);
    try {
      await deleteSlide(session.id, deleteTarget.id);
      setDeleteSlideId(null);
    } catch (error) {
      console.error(`Slide deletion failed: ${errorDetail(error)}`, error);
      setDeleteSlideError(t("session.deleteSlideError"));
    } finally {
      setDeletingSlide(false);
    }
  };
  const startQuestionPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStart.current = { x: event.clientX, width: event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizeQuestionPanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    setQuestionPanelWidth(clampQuestionPanel(resizeStart.current.width + resizeStart.current.x - event.clientX, playerWorkspaceRef.current?.clientWidth));
  };
  const finishQuestionPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeQuestionPanelByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const renderedWidth = event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth;
    setQuestionPanelWidth(clampQuestionPanel(renderedWidth + (event.key === "ArrowLeft" ? 20 : -20), playerWorkspaceRef.current?.clientWidth));
  };
  const openPresentation = () => {
    if (!session) return;
    setActionError(null);
    setPresentationError(null);
    const existing = presentationWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const popup = window.open(
      `/admin/session/${session.id}/present`,
      `pin-class-present-${session.id}`,
      `popup=yes,width=${window.screen.availWidth},height=${window.screen.availHeight}`
    );
    if (!popup) {
      setPresentationError(t("session.popupBlocked"));
      return;
    }
    presentationWindowRef.current = popup;
    popup.focus();
  };

  return {
    ready,
    session,
    slide,
    folder,
    folderAccentIndex,
    folderHref,
    folderSessions,
    questionsBySlide,
    questionCounts,
    slideQuestions,
    selected,
    detailQuestion,
    visibleQuestions,
    tab,
    filter,
    query,
    shareOpen,
    mobileQuestionsOpen,
    answer,
    copied,
    actionError,
    lectureSaving,
    presentationError,
    folderRailOpen,
    questionPanelWidth,
    noteDraft,
    noteDirty,
    noteSavingSlideId,
    noteSavedSlideId,
    deleteTarget,
    deletingSlide,
    deleteSlideError,
    deleteTargetQuestionCount,
    joinUrl,
    playerWorkspaceRef,
    filmstripRef,
    handleSlideWheel,
    showLive: () => setTab("live"),
    showQuestions: () => setTab("questions"),
    toggleFolderRail: () => setFolderRailOpen((open) => !open),
    openShare: () => setShareOpen(true),
    closeShare: () => setShareOpen(false),
    openMobileQuestions: () => setMobileQuestionsOpen(true),
    closeMobileQuestions: () => setMobileQuestionsOpen(false),
    changeAnswer: setAnswer,
    changeQuery: setQuery,
    changeFilter: setFilter,
    openQuestionDetail,
    selectQuestion: openQuestionDetail,
    selectForAnswer: (questionId: string) => {
      const question = session?.questions.find(item => item.id === questionId);
      if (question) selectQuestionFromList(question.id, question.slideIndex);
    },
    closeAnswer: () => { setSelectedId(null); setDetailQuestionId(null); },
    closeQuestionDetail: () => setDetailQuestionId(null),
    selectQuestionFromList,
    changeSlide,
    handleSlidePageKeyDown,
    resetSlidePageInput,
    toggleStatus: () => session && runLectureAction(() => setStatus(session.id, session.status === "live" ? "ended" : "live"), t("session.saveLectureError")),
    togglePresentationAutoplay: () => session && runLectureAction(() => setPresentationAutoplay(session.id, !session.presentationAutoplay), t("session.saveAutoplayError")),
    toggleQuestionPins: () => session && runLectureAction(() => setShowQuestionPins(session.id, !session.showQuestionPins), t("session.savePinSettingError")),
    changePresentationQrPlacement: (value: string) => {
      if (!session) return;
      const position = PRESENTATION_QR_POSITIONS.find((candidate) => candidate === value) ?? null;
      if (value !== "hidden" && position === null) return;
      runLectureAction(() => setPresentationQrPlacement(session.id, position), t("session.saveQrPositionError"));
    },
    saveQuestionCategories: (settings: QuestionCategorySettings) => session ? setQuestionCategories(session.id, settings) : Promise.resolve(),
    reportActionError: setActionError,
    submitAnswer,
    resolveDetailQuestion: resolveSelectedQuestion,
    changeNoteDraft,
    saveNoteOnBlur: () => slide && saveSlideNote(slide.id),
    openDeleteSlide: (slideId: string) => {
      setDeleteSlideError(null);
      setDeleteSlideId(slideId);
    },
    closeDeleteSlide,
    confirmDeleteSlide,
    startQuestionPanelResize,
    resizeQuestionPanel,
    finishQuestionPanelResize,
    cancelQuestionPanelResize: () => { resizeStart.current = null; },
    resizeQuestionPanelByKeyboard,
    openPresentation,
    copyJoinLink,
    goHome: () => router.push("/")
  };
}
