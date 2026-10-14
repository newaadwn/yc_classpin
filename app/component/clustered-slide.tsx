'use client';

import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { SlideCanvas } from './slide-canvas';
import { spatialPinGroups } from '@/app/_model/spatial-pin-groups';
import { condenseQuestions, embeddingCandidates, expandEdges, type SimilarityEdge } from '@/app/_model/question-condense';
import { fetchQuestionSimilarity } from '@/app/_service/question-condense-service';
import styles from './clustered-slide.module.css';
import { useSessions } from '@/app/_controller/session-store';
import type { SpatialPinGroup } from '@/app/_model/spatial-pin-groups';
import { SectionPinExplorer } from './section-pin-explorer';
import { sectionsForPage } from '@/app/_service/section-question-service';
import {useQuestionTriage} from '@/app/_controller/use-question-triage';
import {enrichQuestion} from '@/app/_model/section-questions';

type Props = ComponentProps<typeof SlideCanvas> & { sessionId?: string; defaultSectionView?:boolean; toolbarTarget?:HTMLElement|null; detailTarget?:HTMLElement|null; onSectionViewChange?:(active:boolean)=>void };
const EMPTY: NonNullable<Props['questions']> = [];

/** Shared by instructor live view and presentation, not participant submission. */
export function ClusteredSlide(props: Props) {
  return <ClusteredPage key={props.slide.id} {...props} />;
}

function ClusteredPage(props: Props) {
  const { questions = EMPTY, showPins = true } = props;
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 563 });
  const [enabled, setEnabled] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<SpatialPinGroup | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [undo, setUndo] = useState<{sessionId:string; actionId:string; count:number} | null>(null);
  const { completeGroup, undoGroup, sessions } = useSessions();
  const [sectionView, setSectionView] = useState(props.defaultSectionView??false);
  const notifySectionView=props.onSectionViewChange;
  useEffect(()=>{notifySectionView?.(showPins&&sectionView);return()=>notifySectionView?.(false);},[showPins,sectionView,notifySectionView]);
  const ownerId = props.sessionId ?? questions[0]?.sessionId;
  const session = sessions.find(s => ownerId ? s.id === ownerId : s.slides.some(slide => slide.id === props.slide.id));
  useEffect(() => {
    const sync=()=>{if(session&&sectionsForPage(session,props.slide.id).length)setSectionView(true);};
    sync();window.addEventListener('classpin-analysis-review',sync);
    return()=>window.removeEventListener('classpin-analysis-review',sync);
    // Default to the hierarchy only when this page has a confirmed analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.id,props.slide.id]);
  const [analysis, setAnalysis] = useState<{ key: string; edges: SimilarityEdge[]; message: string }>({ key: '', edges: [], message: '' });
  useEffect(() => {
    const canvas = root.current?.querySelector('.slide-canvas');
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sectionView]);
  const clusters = useMemo(() => spatialPinGroups(questions, size.width, size.height), [questions, size]);
  const selected = enabled && showPins && active && snapshot ? snapshot : undefined;
  const members = selected?.questions ?? EMPTY;
  const triage=useQuestionTriage(members.map(q=>q.id),!sectionView&&!!selected);
  const requestKey = JSON.stringify(members.map(q => [q.id, q.text, q.slideIndex]));
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const candidates = embeddingCandidates(members);
    if (candidates.length < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = async (attempt: number) => {
      try {
        const result = await fetchQuestionSimilarity(candidates, 4000, controller.signal);
        if (controller.signal.aborted) return;
        setAnalysis({ key: requestKey, edges: expandEdges(members, result.edges), message: result.embedding === 'unavailable' ? '의미 분석을 사용할 수 없어 동일 문구·일반 요청만 묶었습니다.' : result.pending ? '의미 분석 중 · 먼저 확인된 질문부터 표시합니다.' : '의미 유사도 분류 · 대표 원문으로 요약' });
        if (result.pending && attempt < 8) timer = setTimeout(() => void run(attempt + 1), 1500);
      } catch {
        if (!controller.signal.aborted) setAnalysis({ key: requestKey, edges: [], message: '의미 분석 연결을 확인해 주세요. 동일 문구·일반 요청만 묶었습니다.' });
      }
    };
    timer = setTimeout(() => void run(0), 350);
    return () => { controller.abort(); clearTimeout(timer); };
    // The serialized key tracks only membership/text, not incoming unrelated pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const confirmedSections=session?sectionsForPage(session,props.slide.id):[];
  const summaries = condenseQuestions(members, { edges: analysis.key === requestKey ? analysis.edges : [],triage:triage.rows,regionOf:q=>confirmedSections.length?enrichQuestion(q,props.slide.id,confirmedSections).sectionId:selected?.id??null });
  const currentCluster = selected ? clusters.find(group => group.questions.some(q => members.some(member => member.id === q.id))) : undefined;
  const newCount = currentCluster?.questions.filter(q => !members.some(member => member.id === q.id)).length ?? 0;
  const pendingQuestions = (ids: string[]) => questions.filter(q => ids.includes(q.id) && q.status === 'unanswered');
  const complete = async (ids: string[]) => {
    if(busy) return;
    const targets=pendingQuestions(ids);
    if(!targets.length) return;
    setBusy(true); setActionError('');
    try {
      const actionId=crypto.randomUUID();
      await completeGroup(targets[0].sessionId, targets, actionId);
      setUndo({sessionId:targets[0].sessionId,actionId,count:targets.length});
    } catch(error) {setActionError(error instanceof Error ? error.message : '완료 처리하지 못했습니다.');}
    finally {setBusy(false);}
  };
  const undoCompletion = async () => {
    if(!undo || busy) return;
    setBusy(true); setActionError('');
    try {await undoGroup(undo.sessionId,undo.actionId); setUndo(null);}
    catch(error) {setActionError(error instanceof Error ? error.message : '되돌리지 못했습니다.');}
    finally {setBusy(false);}
  };
  const close = () => { setActive(null); setExpanded(false); setHighlight([]); lastTrigger.current?.focus(); };
  useEffect(() => {
    if (!selected) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest('[data-pin-cluster]')) {setActive(null);setHighlight([]);}
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setActive(null); setExpanded(false); setHighlight([]); lastTrigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [selected]);
  const displayClusters = selected ? [selected, ...clusters.map(g=>({...g,questions:g.questions.filter(q=>!members.some(member=>member.id===q.id))})).filter(g=>g.questions.length).map(g=>({...g,id:g.questions[0].id}))] : clusters;
  const hidden = new Set(enabled && !sectionView ? displayClusters.filter(g => g.questions.length > 1 && !(g.id === active && (expanded || highlight.length))).flatMap(g => g.questions.map(q => q.id)) : []);
  const visible = enabled ? questions.filter(q => !hidden.has(q.id)).map(q => q.id) : props.visibleQuestionIds;
  if(showPins&&(sectionView||props.defaultSectionView)&&session)return <div ref={root} className={styles.explorerRoot}><SectionPinExplorer unified={!!props.defaultSectionView} session={session} canvas={props} toolbarTarget={props.toolbarTarget} detailTarget={props.detailTarget} onClose={()=>setSectionView(false)}/></div>;
  return <div ref={root} className={styles.root}>
    {showPins && <button className={styles.toggle} aria-pressed={enabled} onClick={() => { setEnabled(!enabled); setSectionView(false); close(); }}>겹친 핀 접기 {enabled ? 'ON' : 'OFF'}</button>}
    {showPins && session && <button data-section-trigger className={styles.sectionToggle} aria-expanded={sectionView} onClick={() => {close();setSectionView(!sectionView);}}>섹션별 질문</button>}
    <SlideCanvas {...props} visibleQuestionIds={visible} emphasizedQuestionIds={selected && highlight.length ? highlight : undefined} statusColoredPins pinDisplayPositions={enabled ? undefined : props.pinDisplayPositions} showQuestionLabels={enabled ? false : props.showQuestionLabels}>
      {props.children}
      {showPins && enabled && !sectionView && displayClusters.filter(g => g.questions.length > 1 && !(g.id === active && (expanded || highlight.length))).map(group => <button key={group.id} data-pin-cluster className={styles.cluster} style={{ left: `${group.x * 100}%`, top: `${group.y * 100}%` }} aria-label={`가까운 질문 ${group.questions.length}개 묶음 열기`} aria-expanded={active === group.id} onClick={event => { event.stopPropagation(); lastTrigger.current = event.currentTarget; setActive(group.id); setSnapshot(group); setExpanded(false); setHighlight([]); }}>
        {group.questions.length}
      </button>)}
    </SlideCanvas>
    {selected && <aside ref={panel} className={styles.panel} aria-label="위치 묶음 질문" onWheel={event => event.stopPropagation()} onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
      <header><div><strong>이 위치의 질문 {members.length}개</strong><small>{summaries.length}개 항목 · 원문과 핀 위치 유지</small></div><button onClick={close} aria-label="묶음 닫기">×</button></header>
      {newCount > 0 && <button className={styles.originals} onClick={()=>{if(currentCluster)setSnapshot(currentCluster);setHighlight([]);}}>새 질문 +{newCount} · 반영하기</button>}
      {actionError && <p role="alert">{actionError}</p>}
      {undo && <button className={styles.originals} disabled={busy} onClick={()=>void undoCompletion()}>{undo.count}개 완료 · 되돌리기</button>}
      <p role="status">{analysis.key === requestKey ? analysis.message : embeddingCandidates(members).length < 2 ? '동일 문구·일반 요청을 분류했습니다.' : '의미 분석 중 · 기본 분류를 먼저 표시합니다.'}</p>
      <button className={styles.originals} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '숫자 핀으로 접기' : '원래 핀 위치 펼쳐 보기'}</button>
      {summaries.map(group => <details key={group.id} className={styles.summary} onMouseEnter={()=>setHighlight(group.questions.map(q=>q.id))} onMouseLeave={()=>setHighlight([])} onFocus={()=>setHighlight(group.questions.map(q=>q.id))} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setHighlight([]);}}>
        <summary><b>{group.questions.length}개</b><span>{group.representative.text}</span></summary>
        <small>{group.reason} · 대표 원문</small>
        <button className={styles.originals} disabled={busy || !pendingQuestions(group.questions.map(q=>q.id)).length} onClick={()=>void complete(group.questions.map(q=>q.id))}>{pendingQuestions(group.questions.map(q=>q.id)).length ? `이 질문 ${pendingQuestions(group.questions.map(q=>q.id)).length}개 설명 완료` : '설명 완료됨'}</button>
        {group.questions.map(q => <button key={q.id} className={styles.question} onClick={() => { setExpanded(true); props.onSelectPin?.(q.id); }}><span>{q.text}</span><small>{questions.find(current=>current.id===q.id)?.status === 'unanswered' ? '미답변' : '처리됨'} · 원문 열기</small></button>)}
      </details>)}
    </aside>}
  </div>;
}
