"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/app/_model/types";

/**
 * 내 질문에 새로 달린 강사 답변을 알린다. 입장할 때 이미 있던 답변은 본 것으로 치고,
 * 그 뒤에 새로 생기거나 바뀐 답변만 모은다. 화면 상태일 뿐 저장하지 않는다.
 */
export function useAnswerNotices(questions: readonly Question[] | undefined, sessionId: string | undefined) {
  const baseline = useRef<{ sessionId: string; seen: Map<string, string> } | null>(null);
  const [unseen, setUnseen] = useState<string[]>([]);

  useEffect(() => {
    if (!questions || !sessionId) return;
    const answered = questions.filter((question) => question.isMine && question.answer);
    // 스냅샷을 받은 뒤 한 번에 반영한다 (effect 안에서 바로 setState 하지 않는다).
    const timer = setTimeout(() => {
      if (baseline.current?.sessionId !== sessionId) {
        baseline.current = { sessionId, seen: new Map(answered.map((question) => [question.id, question.answer!])) };
        setUnseen([]);
        return;
      }
      const { seen } = baseline.current;
      const fresh = answered.filter((question) => seen.get(question.id) !== question.answer).map((question) => question.id);
      if (!fresh.length) return;
      for (const question of answered) seen.set(question.id, question.answer!);
      setUnseen((ids) => [...ids.filter((id) => !fresh.includes(id)), ...fresh]);
    }, 0);
    return () => clearTimeout(timer);
  }, [questions, sessionId]);

  return {
    unseen,
    dismiss: (questionId?: string) => setUnseen((ids) => questionId ? ids.filter((id) => id !== questionId) : []),
  };
}
