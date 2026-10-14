import type { ClassSession, Question } from './types';

export const SOI_SAMPLE_PREFIX = 'soi-synthetic-100-v1-';
// Intentionally uneven load: the market, pain-point and interview pages are hotspots.
const PAGES: Array<[number, string, string]> = [
  [6, 'SOI의 이미지 기반 소통', '친밀한 관계 중심 커뮤니티'],
  [20, '프라이빗 SNS 시장 성장률', '시장 규모 예측'],
  [14, '기존 SNS 사용자의 부담', '소수 인간관계 선호'],
  [5, '기존 SNS의 리텐션 문제', '서비스 이탈'],
  [12, '먼저 게시물을 올리는 부담', '가벼운 반응으로 소통하는 해결방안'],
  [5, 'SOI의 이미지 중심 대화', '사용자의 반응 방식'],
  [8, 'Purpose Room', 'Quick Post'],
  [5, '사용자 유입 전략', '참여를 유지하는 방법'],
  [4, '목표 시장 설정', '초기 고객 확보'],
  [4, '경쟁 서비스와 SOI의 차별점', '경쟁 포지셔닝'],
  [4, '현재 MVP 기능', '제품 검증 방법'],
  [4, '팀의 개발 역량', '기존 프로젝트 경험'],
  [3, '사업 확장 계획', 'B2B 확장'],
  [3, '팀원 역할 분담', '개발 일정 관리'],
  [3, 'SOI가 해결하는 핵심 문제', '전체 사업 방향'],
];
/** Local-only, append missing IDs. Reloads never reset answers or duplicate samples. */
export function withSoiSampleQuestions(session: ClassSession): ClassSession {
  if (session.id !== 'soi-demo' || session.slides.length < PAGES.length) return session;
  const existing = new Set(session.questions.map(q => q.id));
  const additions: Question[] = [];
  let serial = 0;
  PAGES.forEach(([count, left, right], slideIndex) => {
    for (let i = 0; i < count; i++, serial++) {
      const id = `${SOI_SAMPLE_PREFIX}${serial + 1}`;
      if (existing.has(id)) continue;
      const side = Math.floor(i / 5) % 2;
      const topic = side ? right : left;
      const variants = [
        `${topic}이 중요한 이유가 무엇인가요?`,
        `${topic}을 중요하게 보는 근거를 설명해 주세요.`,
        `${topic}에 주목해야 하는 이유가 궁금해요.`,
        `${topic}이 정확히 무엇을 뜻하나요? 개념을 다시 설명해 주세요.`,
        `${topic}을 실제 사용 상황에 적용한 예시를 보여주실 수 있나요?`,
      ];
      additions.push({ id, sessionId: session.id, slideIndex,
        x: (side ? .69 : .31) + ((i % 5) - 2) * .025,
        y: .39 + Math.floor(i / 10) * .16 + (i % 3) * .024,
        anchorKind: 'point', category: i % 5 < 3 ? 'why' : i % 5 === 3 ? 'concept' : 'example', marker: 'question',
        text: `[가상 질문 ${serial + 1}] ${variants[i % 5]}`, status: 'unanswered',
        isMine: false, reactionCount: 0, reactedByMe: false,
        createdAt: new Date(Date.parse(session.createdAt) + serial * 1000).toISOString(),
      });
    }
  });
  return additions.length ? { ...session, questions: [...session.questions, ...additions] } : session;
}
