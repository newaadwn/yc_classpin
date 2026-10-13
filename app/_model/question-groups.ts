import type { Question } from "./types.ts";

export type Triage = { question_id: string; deferred: boolean; separate: boolean };
export type QuestionGroup = { id: string; questions: Question[]; reactions: number; reason: string };
const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim().replace(/[?!。！？.]+$/gu, "");
const vague = (text: string) => /^(모르겠어요|이해가?\s*안\s*(돼요|됩니다)|왜\s*그런가요|이거\s*(뭐예요|설명.*)|설명해\s*주세요)$/u.test(normalized(text));

/** Conservative display grouping, NOT semantic equivalence or a model prediction. */
export function canGroupQuestions(a: Question, b: Question) {
  if (a.sessionId !== b.sessionId || a.slideIndex !== b.slideIndex || a.category !== b.category) return false;
  if (vague(a.text) || !normalized(a.text) || normalized(a.text) !== normalized(b.text)) return false;
  if (a.x === null || a.y === null || b.x === null || b.y === null) return false;
  // Explicit page contradictions are not repaired by grouping.
  const pages = [...a.text.matchAll(/(\d+)\s*(?:페이지|쪽|page)/giu)].map(match => Number(match[1]) - 1);
  if (pages.some(page => page !== a.slideIndex)) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= 0.06;
}

export function groupQuestions(questions: Question[], triage: Triage[] = []): QuestionGroup[] {
  const isolated = new Set(triage.filter(row => row.separate).map(row => row.question_id));
  const groups: QuestionGroup[] = [];
  const ordered = [...questions].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const question of ordered) {
    const existing = !isolated.has(question.id) && groups.find(group =>
      group.questions.every(member => !isolated.has(member.id) && canGroupQuestions(question, member)));
    if (existing) { existing.questions.push(question); existing.reactions += question.reactionCount; }
    else groups.push({ id: question.id, questions: [question], reactions: question.reactionCount,
      reason: question.x === null || question.y === null ? "위치 미확정" : vague(question.text) ? "추가 설명 필요" : "동일 문구·근접 위치 기준" });
  }
  return groups;
}

/** Show one oldest question first, then rotate page/category to avoid popularity-only starvation. */
export function fairGroupQueue(groups: QuestionGroup[], limit = 5) {
  const pending = [...groups].sort((a,b) => a.questions[0].createdAt.localeCompare(b.questions[0].createdAt) || a.id.localeCompare(b.id));
  const selected: QuestionGroup[] = [];
  const seen = new Set<string>();
  while (pending.length && selected.length < limit) {
    const key = (g: QuestionGroup) => `${g.questions[0].slideIndex}:${g.questions[0].category}`;
    const index = pending.findIndex(group => !seen.has(key(group)));
    const [next] = pending.splice(index < 0 ? 0 : index, 1);
    selected.push(next); seen.add(key(next));
  }
  return selected;
}

/** Freeze membership/order only. Content and eligibility stay authoritative. */
export function reconcileQuestionBatch(batch: string[][], groups: QuestionGroup[]) {
  return batch.flatMap(ids => {
    const allowed = new Set(ids);
    // Current groups preserve explicit separation and changed question context.
    return groups.flatMap(group => {
      const questions = group.questions.filter(q => allowed.has(q.id));
      return questions.length ? [{ ...group, id: questions[0].id, questions,
        reactions: questions.reduce((sum, q) => sum + q.reactionCount, 0) }] : [];
    }).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  });
}
