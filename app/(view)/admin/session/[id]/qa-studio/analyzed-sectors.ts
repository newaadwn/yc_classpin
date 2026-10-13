import type {ClassSession} from '@/app/_model/types';
import type {Sector} from '@/app/_model/question-map';
// Authored by the assistant after visual review of all 15 source slides on 2026-09-29.
// This is a deck-specific semantic annotation, NOT runtime model inference or instructor approval.
export const semanticSections=[
  {
    "page": 1,
    "sections": [
      {
        "id": "meaning-1-1",
        "name": "서비스 정의",
        "x": 0.04,
        "y": 0.12,
        "w": 0.4,
        "h": 0.28,
        "meaning": "이미지 위 음성·텍스트 태깅이라는 제품 정의"
      },
      {
        "id": "meaning-1-2",
        "name": "제품 사용 이미지",
        "x": 0.45,
        "y": 0.08,
        "w": 0.51,
        "h": 0.86,
        "meaning": "화면 예시를 통한 사용 경험 소개"
      }
    ]
  },
  {
    "page": 2,
    "sections": [
      {
        "id": "meaning-2-1",
        "name": "시장 규모와 성장성",
        "x": 0.025,
        "y": 0.24,
        "w": 0.625,
        "h": 0.51,
        "meaning": "시장 비중과 성장 전망은 시장 기회를 설명하는 근거"
      },
      {
        "id": "meaning-2-2",
        "name": "친밀형 SNS 수요",
        "x": 0.67,
        "y": 0.24,
        "w": 0.3,
        "h": 0.51,
        "meaning": "BeReal과 Locket 사례로 친밀한 관계 수요 제시"
      },
      {
        "id": "meaning-2-3",
        "name": "시장 기회 결론",
        "x": 0.1,
        "y": 0.8,
        "w": 0.77,
        "h": 0.1,
        "meaning": "관계 중심 수요와 시장 성장이라는 결론"
      }
    ]
  },
  {
    "page": 3,
    "sections": [
      {
        "id": "meaning-3-1",
        "name": "기존 SNS의 한계",
        "x": 0.025,
        "y": 0.15,
        "w": 0.575,
        "h": 0.54,
        "meaning": "게시 부담·연결감 부족·관계 스트레스를 하나의 문제로 제시"
      },
      {
        "id": "meaning-3-2",
        "name": "소수 인간관계 선호",
        "x": 0.61,
        "y": 0.15,
        "w": 0.365,
        "h": 0.54,
        "meaning": "깊은 관계 선호 설문과 도표"
      },
      {
        "id": "meaning-3-3",
        "name": "핵심 결론",
        "x": 0.13,
        "y": 0.775,
        "w": 0.74,
        "h": 0.16,
        "meaning": "관계의 양보다 진짜 연결을 원한다는 주장"
      }
    ]
  },
  {
    "page": 4,
    "sections": [
      {
        "id": "meaning-4-1",
        "name": "리텐션 문제 정의",
        "x": 0.05,
        "y": 0.2,
        "w": 0.9,
        "h": 0.13,
        "meaning": "성장에도 참여 동기가 부족하다는 핵심 주장"
      },
      {
        "id": "meaning-4-2",
        "name": "초기 성장 사례",
        "x": 0.02,
        "y": 0.35,
        "w": 0.48,
        "h": 0.61,
        "meaning": "기존 서비스들의 초기 확산"
      },
      {
        "id": "meaning-4-3",
        "name": "참여 저하와 이탈",
        "x": 0.51,
        "y": 0.35,
        "w": 0.47,
        "h": 0.61,
        "meaning": "성장 이후 이용 감소 사례"
      }
    ]
  },
  {
    "page": 5,
    "sections": [
      {
        "id": "meaning-5-1",
        "name": "이탈자 인터뷰",
        "x": 0.05,
        "y": 0.16,
        "w": 0.435,
        "h": 0.58,
        "meaning": "게시 부담에 대한 인터뷰 근거"
      },
      {
        "id": "meaning-5-2",
        "name": "이탈의 구조",
        "x": 0.51,
        "y": 0.16,
        "w": 0.44,
        "h": 0.6,
        "meaning": "게시 부담에서 콘텐츠 감소와 이탈로 이어지는 흐름"
      },
      {
        "id": "meaning-5-3",
        "name": "SOi의 해결 방향",
        "x": 0.05,
        "y": 0.765,
        "w": 0.9,
        "h": 0.17,
        "meaning": "게시하지 않아도 반응할 수 있도록 참여 장벽을 낮춤"
      }
    ]
  },
  {
    "page": 6,
    "sections": [
      {
        "id": "meaning-6-1",
        "name": "위치 기반 멀티미디어 반응",
        "x": 0.035,
        "y": 0.14,
        "w": 0.65,
        "h": 0.7,
        "meaning": "사진의 특정 위치에 음성·텍스트 반응을 연결"
      },
      {
        "id": "meaning-6-2",
        "name": "앱 사용 예시",
        "x": 0.7,
        "y": 0.16,
        "w": 0.22,
        "h": 0.68,
        "meaning": "실제 화면 형태로 보여주는 서비스 경험"
      },
      {
        "id": "meaning-6-3",
        "name": "참여 장벽 완화",
        "x": 0.07,
        "y": 0.845,
        "w": 0.865,
        "h": 0.11,
        "meaning": "게시 중심에서 태깅 중심 참여로 전환"
      }
    ]
  },
  {
    "page": 7,
    "sections": [
      {
        "id": "meaning-7-1",
        "name": "목적 기반 방 생성",
        "x": 0.015,
        "y": 0.12,
        "w": 0.48,
        "h": 0.425,
        "meaning": "Purpose Room으로 공유 동기를 형성"
      },
      {
        "id": "meaning-7-2",
        "name": "간편한 게시물 공유",
        "x": 0.515,
        "y": 0.12,
        "w": 0.47,
        "h": 0.425,
        "meaning": "Quick Post로 업로드 부담을 낮춤"
      },
      {
        "id": "meaning-7-3",
        "name": "통합 피드",
        "x": 0.515,
        "y": 0.57,
        "w": 0.47,
        "h": 0.4,
        "meaning": "Cross Feed로 방의 콘텐츠를 통합"
      },
      {
        "id": "meaning-7-4",
        "name": "장면 위 태깅 답글",
        "x": 0.015,
        "y": 0.57,
        "w": 0.48,
        "h": 0.4,
        "meaning": "Tagged Reply로 반응을 축적해 참여 루프 완성"
      }
    ]
  },
  {
    "page": 8,
    "sections": [
      {
        "id": "meaning-8-1",
        "name": "현재 B2B 제안",
        "x": 0.065,
        "y": 0.15,
        "w": 0.31,
        "h": 0.8,
        "meaning": "유료 멤버십 커뮤니티의 관계 지속 지원"
      },
      {
        "id": "meaning-8-2",
        "name": "향후 B2B 확장",
        "x": 0.395,
        "y": 0.15,
        "w": 0.54,
        "h": 0.8,
        "meaning": "팬덤·건설 현장·웰니스로 적용 범위 확장"
      }
    ]
  },
  {
    "page": 9,
    "sections": [
      {
        "id": "meaning-9-1",
        "name": "시장 규모 산정",
        "x": 0.025,
        "y": 0.2,
        "w": 0.29,
        "h": 0.63,
        "meaning": "TAM·SAM·SOM 산정과 산식"
      },
      {
        "id": "meaning-9-2",
        "name": "확장 및 초기 타깃",
        "x": 0.34,
        "y": 0.41,
        "w": 0.335,
        "h": 0.475,
        "meaning": "유료 커뮤니티 확장 타깃과 초기 대학생 집단"
      },
      {
        "id": "meaning-9-3",
        "name": "시장 범위 구조",
        "x": 0.685,
        "y": 0.27,
        "w": 0.295,
        "h": 0.525,
        "meaning": "포함 관계를 표현하는 중첩 시장 도식"
      }
    ]
  },
  {
    "page": 10,
    "sections": [
      {
        "id": "meaning-10-1",
        "name": "경쟁 포지셔닝",
        "x": 0.01,
        "y": 0.19,
        "w": 0.435,
        "h": 0.605,
        "meaning": "관계 친밀도와 대화 지속성에 따른 비교"
      },
      {
        "id": "meaning-10-2",
        "name": "기능 차별화",
        "x": 0.465,
        "y": 0.22,
        "w": 0.52,
        "h": 0.56,
        "meaning": "경쟁 서비스와 기능별 비교표"
      },
      {
        "id": "meaning-10-3",
        "name": "차별화 결론",
        "x": 0.18,
        "y": 0.84,
        "w": 0.72,
        "h": 0.11,
        "meaning": "지속형 프라이빗 커뮤니케이션이라는 가치"
      }
    ]
  },
  {
    "page": 11,
    "sections": [
      {
        "id": "meaning-11-1",
        "name": "현재 MVP와 기반 역량",
        "x": 0.03,
        "y": 0.14,
        "w": 0.33,
        "h": 0.8,
        "meaning": "멀티모달 태깅 구현과 선행기술·특허 검토"
      },
      {
        "id": "meaning-11-2",
        "name": "음성 처리 확장",
        "x": 0.375,
        "y": 0.14,
        "w": 0.585,
        "h": 0.38,
        "meaning": "음성 전사·요약·키워드 추출 및 저장"
      },
      {
        "id": "meaning-11-3",
        "name": "태그 위치 추천 확장",
        "x": 0.375,
        "y": 0.56,
        "w": 0.585,
        "h": 0.38,
        "meaning": "시각 인식으로 핵심 포인트와 후보 좌표 생성"
      }
    ]
  },
  {
    "page": 12,
    "sections": [
      {
        "id": "meaning-12-1",
        "name": "국내 사용자 검증",
        "x": 0.025,
        "y": 0.13,
        "w": 0.64,
        "h": 0.635,
        "meaning": "인터뷰·베타·파일럿의 참여 및 유지 지표"
      },
      {
        "id": "meaning-12-2",
        "name": "사용자 반응",
        "x": 0.05,
        "y": 0.8,
        "w": 0.575,
        "h": 0.13,
        "meaning": "사용자가 인식한 관계와 기록 가치"
      },
      {
        "id": "meaning-12-3",
        "name": "해외 수요 검증",
        "x": 0.69,
        "y": 0.14,
        "w": 0.29,
        "h": 0.8,
        "meaning": "해외 사용자 테스트·언어 지원·확장 수요"
      }
    ]
  },
  {
    "page": 13,
    "sections": [
      {
        "id": "meaning-13-1",
        "name": "성장 전략 방향",
        "x": 0.085,
        "y": 0.15,
        "w": 0.845,
        "h": 0.095,
        "meaning": "사용자 검증 후 단계적으로 확장한다는 원칙"
      },
      {
        "id": "meaning-13-2",
        "name": "개발·사업 확장 준비",
        "x": 0.055,
        "y": 0.28,
        "w": 0.87,
        "h": 0.3,
        "meaning": "MVP 고도화·법률 기반·확장기술 검증"
      },
      {
        "id": "meaning-13-3",
        "name": "사용자 확보·파일럿·출시 후 개선",
        "x": 0.21,
        "y": 0.615,
        "w": 0.7,
        "h": 0.34,
        "meaning": "검증 사용자 확보부터 파일럿과 지속 개선까지"
      }
    ]
  },
  {
    "page": 14,
    "sections": [
      {
        "id": "meaning-14-1",
        "name": "핵심 팀 역량",
        "x": 0.02,
        "y": 0.14,
        "w": 0.75,
        "h": 0.64,
        "meaning": "기획·디자인·개발 구성원의 경험"
      },
      {
        "id": "meaning-14-2",
        "name": "기술·사업 자문",
        "x": 0.4,
        "y": 0.81,
        "w": 0.37,
        "h": 0.13,
        "meaning": "외부 자문과 지원 역량"
      },
      {
        "id": "meaning-14-3",
        "name": "팀 성과",
        "x": 0.785,
        "y": 0.14,
        "w": 0.195,
        "h": 0.8,
        "meaning": "지원사업 선정과 수상 이력"
      }
    ]
  },
  {
    "page": 15,
    "sections": [
      {
        "id": "meaning-15-1",
        "name": "문제",
        "x": 0.03,
        "y": 0.145,
        "w": 0.293,
        "h": 0.775,
        "meaning": "기존 SNS의 참여 지속성과 맥락 부족"
      },
      {
        "id": "meaning-15-2",
        "name": "해결책",
        "x": 0.35,
        "y": 0.145,
        "w": 0.298,
        "h": 0.775,
        "meaning": "태깅 중심 참여와 대화 축적"
      },
      {
        "id": "meaning-15-3",
        "name": "핵심 기술",
        "x": 0.675,
        "y": 0.145,
        "w": 0.295,
        "h": 0.775,
        "meaning": "좌표·음성 정규화·시각 추천·구조화 데이터"
      }
    ]
  }
];
export function analyzedSectors(session:ClassSession):Record<string,Sector[]>{
 if((session.id!=='f7767d0a-14a7-4b1c-bd3d-fc50a8691d68'&&session.id!=='soi-demo')||session.slides.length!==15)return {};
 return Object.fromEntries(session.slides.map((slide,i)=>[slide.id,semanticSections[i].sections]));
}
