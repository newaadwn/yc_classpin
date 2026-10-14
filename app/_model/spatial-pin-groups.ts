import type { Question } from './types';

export type SpatialPinGroup = { id: string; x: number; y: number; questions: Question[] };

/** Display-only complete-link clusters in rendered pixels; never change stored anchors. */
export function spatialPinGroups(questions: readonly Question[], width: number, height: number, diameter = 72): SpatialPinGroup[] {
  const groups: SpatialPinGroup[] = [];
  for (const q of [...questions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (q.anchorKind === 'box' || q.anchorKind === 'path' || q.x === null || q.y === null || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    const group = groups.find(g => g.questions.every(member => member.slideIndex === q.slideIndex && Math.hypot((member.x! - q.x!) * width, (member.y! - q.y!) * height) <= diameter));
    if (group) {
      group.questions.push(q);
      group.x = group.questions.reduce((sum, member) => sum + member.x!, 0) / group.questions.length;
      group.y = group.questions.reduce((sum, member) => sum + member.y!, 0) / group.questions.length;
    } else groups.push({ id: q.id, x: q.x, y: q.y, questions: [q] });
  }
  return groups;
}
