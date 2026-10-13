import type { ClassSession, Question } from '@/app/_model/types';
import { enrichQuestion, validTeachingSection, type TeachingSection, type SectionQuestionCluster, type LectureRecord, type PageRecord } from '@/app/_model/section-questions';
import {condenseQuestions,expandEdges} from '@/app/_model/question-condense';
import type {Triage} from '@/app/_model/question-groups';
import { readSectionRun, sectionSource } from './local-sections';
import { readReview } from './lecture-analysis-service';
import { fetchQuestionSimilarity } from './question-condense-service';

/** Browser-local repository API. No new DB tables; no writes to production. */
const key = (sessionId: string, pageId: string) => `classpin-section-clusters-v1:${sessionId}:${pageId}`;
export function saveLectureAnalysis(session: ClassSession) {
  const run = readSectionRun(session.id);
  const lecture: LectureRecord = { id: session.id, title: session.title, fileName: session.fileName, createdAt: session.createdAt };
  const pages: PageRecord[] = session.slides.map(s => {
    const native = run?.source === sectionSource(session) ? run.nativePages?.find(p => p.pageIndex === s.pageIndex) : undefined;
    return { id: s.id, lectureId: session.id, pageNumber: s.pageIndex + 1, imageUrl: s.imageUrl,
      width: native?.width ?? null, height: native?.height ?? null };
  });
  localStorage.setItem(`classpin-lecture-analysis-v1:${session.id}`, JSON.stringify({ version: 1, source: sectionSource(session), lecture, pages, sections: session.slides.flatMap(s => sectionsForPage(session, s.id)) }));
}
export function sectionsForPage(session: ClassSession, pageId: string): TeachingSection[] {
  const snapshot = readReview(session.id)?.confirmed;
  const page=session.slides.find(s=>s.id===pageId);
  if (!snapshot || snapshot.source !== sectionSource(session) || !page || snapshot.config.excludedPages.includes(page.pageIndex+1)) return [];
  return (snapshot.sections[pageId] ?? []).filter(s=>s.enabled).map(s => ({
    id: s.id, pageId, title: s.name, text: ('text' in s && typeof s.text === 'string') ? s.text : '',
    type: 'mixed' as const, x: s.x, y: s.y, width: s.w, height: s.h,
    source: 'semantic' as const, embedding: null,
  })).filter(validTeachingSection);
}
export function groupPageQuestions(questions: Question[], pageId: string, sections: TeachingSection[], edges: readonly [string, string, number][] = [],triage:readonly Triage[]=[]):SectionQuestionCluster[] {
  const classified=new Map(questions.map(q=>[q.id,enrichQuestion(q,pageId,sections)]));
  return condenseQuestions(questions,{edges:expandEdges(questions,[...edges]),triage,regionOf:q=>classified.get(q.id)?.sectionId??null}).map(g=>({
    id:g.id,pageId,sectionId:g.region,questionType:classified.get(g.representative.id)!.questionType,
    representativeQuestion:g.representative.text,representativeSource:'original-medoid' as const,questionCount:g.questions.length,
    questions:g.questions.map(q=>({...classified.get(q.id)!,clusterId:g.id})),createdAt:g.questions[0].createdAt,updatedAt:g.questions[g.questions.length-1].createdAt,
  })).sort((a,b)=>b.questionCount-a.questionCount||a.createdAt.localeCompare(b.createdAt));
}
export async function analyzePageQuestions(questions: Question[], pageId: string, sections: TeachingSection[], signal: AbortSignal) {
  if (questions.length > 400) throw Error('한 페이지 분석 한도는 400건입니다. 원문은 그대로 유지됩니다.');
  const result = await fetchQuestionSimilarity(questions.map(q => ({ id: q.id, text: q.text, page: q.slideIndex })), 4000, signal);
  return { ...result, clusters: groupPageQuestions(questions, pageId, sections, result.edges) };
}
export function savePageClusters(sessionId: string, pageId: string, clusters: SectionQuestionCluster[]) {
  // Cache is a derived snapshot, never the authoritative source of question status/text.
  localStorage.setItem(key(sessionId, pageId), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), clusters }));
}
export function getPageClusters(sessionId: string, pageId: string): SectionQuestionCluster[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(sessionId, pageId)) ?? 'null');
    return value?.version === 1 && Array.isArray(value.clusters) ? value.clusters : [];
  } catch { return []; }
}
export function getQuestionCluster(sessionId: string, pageId: string, clusterId: string) {
  return getPageClusters(sessionId, pageId).find(c => c.id === clusterId) ?? null;
}
/** Future student suggestions; reactions must use existing store, never increment questionCount artificially. */
export function similarQuestionCandidates(clusters: SectionQuestionCluster[], sectionId: string | null) {
  return sectionId ? clusters.filter(c => c.sectionId === sectionId).map(c => ({ id: c.id, representativeQuestion: c.representativeQuestion, questionCount: c.questionCount })) : [];
}
