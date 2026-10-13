import { BookOpen, HelpCircle, Lightbulb, GitCompareArrows, FlaskConical, CalendarDays, AlertTriangle, Star, Smile, Check, MessageCircleQuestion } from 'lucide-react';
import styles from './question-pin-visual.module.css';

const ICONS = {
  concept: BookOpen, clarification: HelpCircle, confusing: HelpCircle,
  why: MessageCircleQuestion, example: Lightbulb, application: Lightbulb,
  comparison: GitCompareArrows, deep_dive: FlaskConical, logistics: CalendarDays,
  error: AlertTriangle, bug: AlertTriangle, important: Star, praise: Smile,
  idea: Lightbulb, improve: Lightbulb,
};

/** Category controls color and pictogram; completion is a separate check badge. */
export function QuestionPinVisual({ category, done = false }: { category?: string; done?: boolean }) {
  const Icon = ICONS[category as keyof typeof ICONS] ?? MessageCircleQuestion;
  return <span className={styles.visual} data-category={category} data-done={done} aria-hidden="true">
    <svg className={styles.shape} viewBox="0 0 44 49"><path d="M22 42 8 42 8 22a16 16 0 1 1 16 16Z"/><circle cx="24" cy="22" r="13"/></svg>
    <Icon className={styles.symbol} strokeWidth={2.2}/>
    {done ? <span className={styles.done}><Check size={10} strokeWidth={3}/></span> : null}
  </span>;
}
