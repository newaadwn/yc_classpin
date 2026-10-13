"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ClassSession, ParticipantQuestionInput, Question } from "@/app/_model/types";
import type { Box } from "@/app/_model/question-placement";
import { QuestionPlacementError, requestQuestionPlacement, warmQuestionPlacement, type QuestionPlacementResult } from "@/app/_service/question-placement-service";

export type AiDraft = { page: number; x: number; y: number };
type RefineState = "running" | "done" | "failed" | "busy" | "skipped";
const SKIP_UNINFORMATIVE = "질문에 위치 단서(용어·숫자·그래프/표·왼쪽/오른쪽 등)가 적어 AI 재확인은 건너뛰었어요. 슬라이드를 눌러 위치를 정해 주세요.";
export type AiPhase =
  | { kind: "idle" }
  | { kind: "receiving"; text: string }
  | { kind: "analyzing"; text: string }
  | { kind: "duplicate"; text: string; askedPage: number; result: QuestionPlacementResult }
  | { kind: "confirm"; text: string; askedPage: number; result: QuestionPlacementResult; draft: AiDraft; category: string; categoryChosen?: boolean; candidate: number; adjusted: boolean; refine: RefineState; refineMessage?: string; saving?: boolean; error?: string }
  | { kind: "created"; text: string; result: QuestionPlacementResult; questionId: string; page: number; category: string }
  | { kind: "moving"; questionId: string; draft: AiDraft; original: AiDraft; saving?: boolean; error?: string; back: AiPhase | null }
  | { kind: "unsupported"; text: string; message: string }
  | { kind: "error"; text: string; message: string };

const messageOf = (error: unknown) => error instanceof QuestionPlacementError ? error.message
  : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "잠시 후 다시 시도해 주세요.";

/**
 * 참여자 텍스트 질문 → AI 위치 판단 → 자동 PIN 생성 또는 "이 위치가 맞나요?" 확인 흐름.
 * 서버는 판단만 하고, 실제 질문 저장·이동은 기존 참여자 RLS 경로(store)로만 한다.
 */
export function useAiQuestion(options: {
  session: ClassSession | undefined;
  current: number;
  goToPage: (page: number) => void;
  selectQuestion: (id: string | null) => void;
  addQuestion: (sessionId: string, question: ParticipantQuestionInput) => Promise<string>;
  updateQuestion: (sessionId: string, questionId: string, values: Pick<Question, "category" | "marker" | "text">) => Promise<void>;
  moveQuestionPin: (sessionId: string, questionId: string, slideIndex: number, point: { x: number; y: number }) => Promise<void>;
  reactToQuestion: (sessionId: string, questionId: string, reacted: boolean) => Promise<void>;
  onManualFallback: (text: string) => void;
}) {
  const { session, current } = options;
  const [input, setInput] = useState("");
  const [phase, setPhaseState] = useState<AiPhase>({ kind: "idle" });
  const [notice, setNotice] = useState("");
  const phaseRef = useRef<AiPhase>(phase);
  const sequence = useRef(0);
  // AI failures retry the same admitted question, never a second original.
  const intake = useRef<{ sessionId: string; id: string; text: string; page: number; category: string; saved: boolean } | null>(null);
  const dragging = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  const setPhase = (next: AiPhase) => { phaseRef.current = next; setPhaseState(next); };

  const warmKey = session?.status === "live" && session.materialId ? `${session.id}:${session.materialId}` : "";
  useEffect(() => {
    if (!warmKey) return;
    const [lectureId, materialId] = warmKey.split(":");
    void warmQuestionPlacement(lectureId, materialId);
  }, [warmKey]);

  const create = async (text: string, result: QuestionPlacementResult, draft: AiDraft, category: string, seq: number) => {
    const { session: live, moveQuestionPin, updateQuestion, goToPage, selectQuestion } = optionsRef.current;
    if (!live) return;
    const admitted = intake.current;
    if (!admitted?.saved || admitted.sessionId !== live.id || admitted.text !== text) throw new Error("접수된 질문을 찾지 못했습니다.");
    const id = admitted.id;
    await moveQuestionPin(live.id, id, draft.page, { x: draft.x, y: draft.y });
    await updateQuestion(live.id, id, { text, category, marker: "pin" });
    if (seq !== sequence.current) return;
    goToPage(draft.page);
    selectQuestion(id);
    setPhase({ kind: "created", text, result, questionId: id, page: draft.page, category });
  };

  const refine = async (text: string, askedPage: number, seq: number) => {
    const live = optionsRef.current.session;
    if (!live?.materialId) return;
    try {
      const refined = await requestQuestionPlacement({ lectureId: live.id, materialId: live.materialId, currentPage: askedPage, text, mode: "refine" });
      const now = phaseRef.current;
      if (seq !== sequence.current || now.kind !== "confirm") return;
      const decision = refined.decision;
      if (!decision) { setPhase({ ...now, refine: "failed", refineMessage: "AI가 위치를 다시 판단하지 못했어요." }); return; }
      if (refined.analysis.llmSkipped) { setPhase({ ...now, refine: "skipped", refineMessage: refined.analysis.llmSkipped === "uninformative" ? SKIP_UNINFORMATIVE : "빠른 검색 결과가 충분히 확실해 AI 재확인은 건너뛰었어요." }); return; }
      const summary = `AI 재확인 · ${decision.page + 1}페이지 ${decision.region.label} · 신뢰도 ${Math.round(decision.confidence * 100)}%`;
      if (now.adjusted) {
        setPhase({ ...now, refine: "done", refineMessage: `${summary} — 직접 고른 위치를 유지했어요.` });
        return;
      }
      optionsRef.current.goToPage(decision.page);
      setPhase({ ...now, result: refined, draft: { page: decision.page, ...decision.point }, category: now.categoryChosen ? now.category : decision.category, candidate: 0, refine: "done", refineMessage: summary });
    } catch (error) {
      const now = phaseRef.current;
      if (seq !== sequence.current || now.kind !== "confirm") return;
      const busy = error instanceof QuestionPlacementError && error.code === "MODEL_BUSY";
      setPhase({ ...now, refine: busy ? "busy" : "failed", refineMessage: messageOf(error) });
    }
  };

  const proceed = async (text: string, askedPage: number, result: QuestionPlacementResult, seq: number) => {
    const decision = result.decision!;
    if (result.status === "auto") {
      try {
        await create(text, result, { page: decision.page, ...decision.point }, decision.category, seq);
        return;
      } catch (error) {
        if (seq !== sequence.current) return;
        optionsRef.current.goToPage(decision.page);
        setPhase({ kind: "confirm", text, askedPage, result, draft: { page: decision.page, ...decision.point }, category: decision.category, candidate: 0, adjusted: false, refine: "done", error: `PIN 등록에 실패했어요: ${messageOf(error)}` });
        return;
      }
    }
    optionsRef.current.goToPage(decision.page);
    // 단서가 없는 질문("이거 뭐예요?")은 LLM 도 고를 근거가 없어 공유 CPU 를 쓰지 않고 바로 직접 선택을 안내한다.
    if (!decision.informative) {
      setPhase({ kind: "confirm", text, askedPage, result, draft: { page: decision.page, ...decision.point }, category: decision.category, candidate: 0, adjusted: false, refine: "skipped", refineMessage: SKIP_UNINFORMATIVE });
      return;
    }
    setPhase({ kind: "confirm", text, askedPage, result, draft: { page: decision.page, ...decision.point }, category: decision.category, candidate: 0, adjusted: false, refine: "running" });
    void refine(text, askedPage, seq);
  };

  const chooseCategory = (category: string) => {
    const now = phaseRef.current;
    if (now.kind === "confirm" && !now.saving) setPhase({ ...now, category, categoryChosen: true });
  };

  const submit = async () => {
    const text = input.trim();
    const live = optionsRef.current.session;
    if (!text || !live?.materialId || live.status !== "live" || phaseRef.current.kind === "analyzing" || phaseRef.current.kind === "receiving") return;
    const seq = ++sequence.current;
    if (!intake.current || intake.current.text !== text || intake.current.sessionId !== live.id || phaseRef.current.kind === "created") {
      const category = Object.keys(live.questionCategories).find(key => live.questionCategories[key].enabled && !live.questionCategories[key].archived);
      if (!category) { setNotice("현재 접수 가능한 질문 카테고리가 없습니다."); return; }
      intake.current = { sessionId: live.id, id: crypto.randomUUID(), text, page: current, category, saved: false };
    }
    const admitted = intake.current;
    const askedPage = admitted.page;
    setNotice("");
    setPhase({ kind: "receiving", text });
    try {
      if (!admitted.saved) {
        await optionsRef.current.addQuestion(live.id, { requestId: admitted.id, slideIndex: askedPage, anchorKind: "point", x: null, y: null, width: null, height: null, path: null, category: admitted.category, marker: "pin", text });
        admitted.saved = true;
      }
      if (seq !== sequence.current) return;
      setInput("");
      setPhase({ kind: "analyzing", text });
      const response = await requestQuestionPlacement({ lectureId: live.id, materialId: live.materialId, currentPage: askedPage, text, mode: "fast" });
      const result = { ...response, related: response.related.filter(item => item.id !== admitted.id) };
      if (seq !== sequence.current) return;
      setInput("");
      if (result.status === "unsupported" || !result.decision) {
        setPhase({ kind: "unsupported", text, message: result.message ?? "이 자료에서는 AI 위치 찾기를 쓸 수 없어요." });
        return;
      }
      if (result.related.some((item) => item.relation === "duplicate")) {
        setPhase({ kind: "duplicate", text, askedPage, result });
        return;
      }
      await proceed(text, askedPage, result, seq);
    } catch (error) {
      if (seq === sequence.current) setPhase({ kind: "error", text, message: `${admitted.saved ? "질문은 접수됐으며 강사가 볼 수 있습니다. 위치만 미확정 상태입니다. " : "질문 접수를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요. "}${messageOf(error)}` });
    }
  };

  const confirm = async () => {
    const now = phaseRef.current;
    if (now.kind !== "confirm" || now.saving) return;
    setPhase({ ...now, saving: true, error: undefined });
    try { await create(now.text, now.result, now.draft, now.category, sequence.current); }
    catch (error) { const latest = phaseRef.current; if (latest.kind === "confirm") setPhase({ ...latest, saving: false, error: `PIN 등록에 실패했어요: ${messageOf(error)}` }); }
  };

  const nextCandidate = () => {
    const now = phaseRef.current;
    if (now.kind !== "confirm") return;
    const candidates = now.result.decision?.candidates ?? [];
    if (candidates.length < 2) return;
    const index = (now.candidate + 1) % candidates.length;
    const candidate = candidates[index];
    optionsRef.current.goToPage(candidate.page);
    setPhase({ ...now, candidate: index, draft: { page: candidate.page, ...candidate.point }, adjusted: true });
  };

  const moveDraft = (x: number, y: number) => {
    const now = phaseRef.current;
    const draft = { page: current, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    if (now.kind === "confirm") setPhase({ ...now, draft, adjusted: true });
    else if (now.kind === "moving") setPhase({ ...now, draft });
  };

  const dragHandlers = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (!dragging.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const canvas = event.currentTarget.closest(".slide-canvas")?.getBoundingClientRect();
      if (canvas) moveDraft((event.clientX - canvas.left) / canvas.width, (event.clientY - canvas.top) / canvas.height);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
  };

  const startMoving = (questionId: string) => {
    const live = optionsRef.current.session;
    const question = live?.questions.find((item) => item.id === questionId);
    if (!question || !question.isMine || question.status !== "unanswered") {
      setNotice("답변 전인 내 질문만 PIN 위치를 옮길 수 있어요.");
      return;
    }
    const original = { page: question.slideIndex, x: question.x ?? 0.5, y: question.y ?? 0.5 };
    const back = phaseRef.current.kind === "created" ? phaseRef.current : null;
    optionsRef.current.goToPage(question.slideIndex);
    optionsRef.current.selectQuestion(null);
    setNotice("");
    setPhase({ kind: "moving", questionId, draft: original, original, back });
  };

  const saveMove = async () => {
    const now = phaseRef.current;
    const live = optionsRef.current.session;
    if (now.kind !== "moving" || now.saving || !live) return;
    setPhase({ ...now, saving: true, error: undefined });
    try {
      await optionsRef.current.moveQuestionPin(live.id, now.questionId, now.draft.page, { x: now.draft.x, y: now.draft.y });
      optionsRef.current.goToPage(now.draft.page);
      optionsRef.current.selectQuestion(now.questionId);
      setNotice(`PIN을 ${now.draft.page + 1}페이지의 새 위치로 옮겼어요.`);
      setPhase(now.back?.kind === "created" ? { ...now.back, page: now.draft.page } : { kind: "idle" });
    } catch (error) {
      const latest = phaseRef.current;
      if (latest.kind === "moving") setPhase({ ...latest, saving: false, error: `PIN을 옮기지 못했어요: ${messageOf(error)}` });
    }
  };

  const cancel = () => {
    const now = phaseRef.current;
    sequence.current += 1;
    if (now.kind === "moving") {
      optionsRef.current.goToPage(now.original.page);
      setPhase(now.back ?? { kind: "idle" });
      return;
    }
    if (intake.current?.saved) { setNotice("질문은 접수된 상태로 유지됩니다. 위치는 나중에 정할 수 있어요."); intake.current = null; }
    else if (now.kind === "error" && !input.trim()) setInput(now.text);
    setPhase({ kind: "idle" });
  };

  const react = async (question: Question) => {
    const live = optionsRef.current.session;
    if (!live || question.isMine) return;
    try {
      if (!question.reactedByMe) await optionsRef.current.reactToQuestion(live.id, question.id, true);
      optionsRef.current.goToPage(question.slideIndex);
      optionsRef.current.selectQuestion(question.id);
      setNotice("공감했어요. 먼저 접수한 내 질문도 삭제되지 않고 유지됩니다.");
      intake.current = null;
      sequence.current += 1;
      setPhase({ kind: "idle" });
    } catch (error) {
      setNotice(`공감하지 못했어요: ${messageOf(error)}`);
    }
  };

  const continueAnyway = () => {
    const now = phaseRef.current;
    if (now.kind !== "duplicate") return;
    void proceed(now.text, now.askedPage, now.result, sequence.current);
  };

  const manualFallback = () => {
    const now = phaseRef.current;
    if (intake.current?.saved) { startMoving(intake.current.id); return; }
    if (intake.current) { setNotice("먼저 같은 요청으로 접수를 다시 확인해 주세요. 중복 질문 생성을 막기 위한 절차입니다."); return; }
    if (now.kind === "unsupported" || now.kind === "error") optionsRef.current.onManualFallback(now.text);
    setPhase({ kind: "idle" });
  };

  const retry = () => {
    const now = phaseRef.current;
    if (now.kind === "error") { setInput(now.text); setPhase({ kind: "idle" }); }
  };

  const draft = phase.kind === "confirm" || phase.kind === "moving" ? phase.draft : null;
  let highlight: Box | null = null;
  if (phase.kind === "confirm" && !phase.adjusted && phase.result.decision && phase.result.decision.page === phase.draft.page) highlight = phase.result.decision.region.box;
  if (phase.kind === "confirm" && phase.adjusted && phase.candidate > 0) {
    const candidate = phase.result.decision?.candidates[phase.candidate];
    if (candidate && candidate.page === phase.draft.page && candidate.point.x === phase.draft.x && candidate.point.y === phase.draft.y) highlight = candidate.box;
  }

  return {
    input, setInput, phase, notice, dismissNotice: () => setNotice(""),
    submit, confirm, nextCandidate, chooseCategory, placeAt: moveDraft, dragHandlers, startMoving, saveMove, cancel, react, continueAnyway, manualFallback, retry,
    draft, highlight,
    movingQuestionId: phase.kind === "moving" ? phase.questionId : null,
    canvasMode: phase.kind === "confirm" || phase.kind === "moving",
  };
}

export type AiQuestionController = ReturnType<typeof useAiQuestion>;
