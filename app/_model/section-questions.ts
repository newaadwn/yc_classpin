import type { Question } from './types';

/** Versioned local analysis DTOs; original session questions remain authoritative. */
export type QuestionType = 'concept' | 'clarification' | 'why' | 'application' | 'comparison' | 'deep_dive' | 'logistics';
export type SectionType = 'title' | 'text' | 'image' | 'chart' | 'equation' | 'code' | 'mixed';
export type LectureRecord = { id: string; title: string; fileName: string; createdAt: string };
export type PageRecord = { id: string; lectureId: string; pageNumber: number; imageUrl?: string; width: number | null; height: number | null };
export type TeachingSection = {
  id: string; pageId: string; title: string; text: string; type: SectionType;
  x: number; y: number; width: number; height: number;
  source: 'native-layout' | 'semantic'; embedding: number[] | null;
};
export type ClassifiedQuestion = {
  original: Question; pageId: string; sectionId: string | null; userId: string | null;
  questionType: QuestionType | null; classificationSource: 'rules' | 'provider' | 'unknown';
  subject: string | null; embedding: number[] | null; clusterId: string | null;
};
export type SectionQuestionCluster = {
  id: string; pageId: string; sectionId: string | null; questionType: QuestionType | null;
  representativeQuestion: string; representativeSource: 'original-medoid' | 'generated';
  questionCount: number; questions: ClassifiedQuestion[]; createdAt: string; updatedAt: string;
};
export interface QuestionAnalysisProvider {
  classify(text: string, sectionText: string): Promise<{ type: QuestionType; subject: string | null }>;
  embed(texts: string[]): Promise<number[][]>;
  sameAnswer?(a: ClassifiedQuestion, b: ClassifiedQuestion): Promise<boolean>;
  summarize?(questions: string[]): Promise<string>;
}
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  concept: '개념·정의', clarification: '이해 확인', why: '이유·원리', application: '적용·예시',
  comparison: '비교', deep_dive: '심화·한계', logistics: '강의 운영',
};
export function validTeachingSection(s: TeachingSection) {
  return !!s && typeof s.id === 'string' && typeof s.pageId === 'string' && typeof s.title === 'string'
    && [s.x, s.y, s.width, s.height].every(Number.isFinite) && s.x >= 0 && s.y >= 0
    && s.width > 0 && s.height > 0 && s.x + s.width <= 1.000001 && s.y + s.height <= 1.000001;
}
/** Distance to the rectangle edge, in slide-normalized coordinates, not screen pixels. */
export function sectionAt(pageId: string, x: number | null, y: number | null, sections: readonly TeachingSection[], cutoff = .06) {
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1 || y > 1) return null;
  const candidates = sections.filter(s => s.pageId === pageId && validTeachingSection(s)).map(s => ({
    section: s, distance: Math.hypot(Math.max(s.x - x, 0, x - s.x - s.width), Math.max(s.y - y, 0, y - s.y - s.height)),
  })).sort((a, b) => a.distance - b.distance || a.section.width * a.section.height - b.section.width * b.section.height || a.section.id.localeCompare(b.section.id));
  return candidates[0]?.distance <= cutoff ? candidates[0].section.id : null;
}
export const normalizedText = (text: string) => text.normalize('NFKC').toLowerCase().replace(/^\[[^\]]{1,60}\]\s*/u, '').replace(/[\s?!.。！？]+/gu, '').trim();
/** Explicit fallback, NOT AI classification. Unknown intent is kept separate. */
export function classifyQuestionRule(text: string): QuestionType | null {
  if (/(시험|과제|출석|쉬는 시간|강의 시간|자료.*다운로드)/u.test(text)) return 'logistics';
  if (/(차이|비교|공통점|versus|\bvs\b)/iu.test(text)) return 'comparison';
  if (/(한계|반례|없이도|예외|확장|항상.*성립)/u.test(text)) return 'deep_dive';
  if (/(왜|이유|원리|목적|필요|근거)/u.test(text)) return 'why';
  if (/(적용|예시|사례|사용할 수|활용)/u.test(text)) return 'application';
  if (/(무엇|뭐예요|뭔가요|정의|뜻|의미가|개념)/u.test(text)) return 'concept';
  if (/(모르겠|이해|다시.*설명|맞나요|의미인가|헷갈)/u.test(text)) return 'clarification';
  return null;
}
export function enrichQuestion(original: Question, pageId: string, sections: readonly TeachingSection[]): ClassifiedQuestion {
  const questionType = classifyQuestionRule(original.text);
  return { original, pageId, sectionId: sectionAt(pageId, original.x, original.y, sections), userId: null,
    questionType, classificationSource: questionType ? 'rules' : 'unknown', subject: null, embedding: null, clusterId: null };
}
export type PairSimilarity = (a: ClassifiedQuestion, b: ClassifiedQuestion) => number | undefined;
/** Conservative default: page-level questions are NOT treated as one shared concept. */
export function isSameQuestion(a: ClassifiedQuestion, b: ClassifiedQuestion, similarity: PairSimilarity, threshold = .88) {
  if (a.original.sessionId !== b.original.sessionId || a.original.slideIndex !== b.original.slideIndex || a.pageId !== b.pageId || a.sectionId !== b.sectionId) return false;
  if (!a.sectionId) return false;
  if (a.questionType !== b.questionType) return false;
  if (a.subject && b.subject && a.subject !== b.subject) return false;
  if (normalizedText(a.original.text) && normalizedText(a.original.text) === normalizedText(b.original.text)) return true;
  if (!a.questionType) return false;
  const score = similarity(a, b);
  return score !== undefined && Number.isFinite(score) && score >= threshold;
}
/** Complete-link prevents A~B~C chaining; deterministic oldest member IDs survive new arrivals. */
export function clusterSectionQuestions(questions: readonly ClassifiedQuestion[], similarity: PairSimilarity): SectionQuestionCluster[] {
  const groups: ClassifiedQuestion[][] = [];
  for (const q of [...questions].sort((a, b) => a.original.createdAt.localeCompare(b.original.createdAt) || a.original.id.localeCompare(b.original.id))) {
    const candidates = groups.filter(g => g.every(member => isSameQuestion(q, member, similarity)));
    candidates.sort((a, b) => Math.min(...b.map(m => similarity(q, m) ?? 1)) - Math.min(...a.map(m => similarity(q, m) ?? 1)));
    if (candidates[0]) candidates[0].push(q); else groups.push([q]);
  }
  return groups.map(members => {
    const first = members[0];
    const id = JSON.stringify([first.original.sessionId, first.pageId, first.sectionId, first.original.id]);
    const medoid = [...members].sort((a, b) => members.reduce((sum, q) => sum + (similarity(b, q) ?? 0) - (similarity(a, q) ?? 0), 0))[0];
    return { id, pageId: first.pageId, sectionId: first.sectionId, questionType: first.questionType,
      representativeQuestion: medoid.original.text, representativeSource: 'original-medoid' as const,
      questionCount: members.length, questions: members.map(q => ({ ...q, clusterId: id })),
      createdAt: first.original.createdAt, updatedAt: members[members.length - 1].original.createdAt };
  }).sort((a, b) => b.questionCount - a.questionCount || a.createdAt.localeCompare(b.createdAt));
}
