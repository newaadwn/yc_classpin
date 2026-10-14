# 섹션 기반 질문 그룹 — 로컬 1차 구현

사용자가 제공한 2026-10-06 구현 요청을 기준으로 구현했다. 운영 DB, SQL 마이그레이션, 원본 질문을 변경하지 않는다. 기존 가까운 핀 묶기는 시각적 집계로 유지하고, 의미 섹션 그룹은 별도의 **섹션별 질문** 버튼으로 제공한다.

## 구조와 데이터 흐름

- Next.js 16 / React 19 / TypeScript, 기존 session-store가 질문의 원본 저장소.
- 로컬 FastAPI 8769는 PPTX 파싱, OCR/layout, Qwen3 의미 영역 분석 담당.
- Next.js의 기존 `/api/dev/question-similarity`는 로컬 임베딩을 계산한다.
- 기존 Supabase JS 경로를 변경하지 않았다. ORM 추가 없음.
- 강의 설정 → 업로드 → 기존 이미지 변환 → 세션 생성 → PPTX 원본 요소 읽기 → 여백 기반 후보 → 의미 보정 → 초안 저장 → 강사 검수 → 확정 snapshot 사용.
- PDF/PPT, 원본 geometry 미지원, 원본 의미 분석 실패 → 기존 이미지 OCR/layout 분석.
- 질문은 기존 학생 제출 경로로 생성된다. 강사 패널에서 좌표/텍스트 변경을 감지 → 섹션 연결 → 유형 초안 → 임베딩 → 보수적 그룹화 → 그룹/원문 표시 및 로컬 파생 결과 저장.
- 섹션별 보기에서는 가까운 핀 숫자 집계를 숨기고 원래 핀을 표시한다. 섹션 테두리 또는 드롭다운으로 그룹 목록을 좁힐 수 있다.

## 변경 파일

| 파일 | 역할 |
| --- | --- |
| `app/_model/section-questions.ts` | Lecture/Page/Section/ClassifiedQuestion/QuestionCluster DTO, 7종 의도 초안, 좌표 매핑, 독립 클러스터링 함수, AI provider interface |
| `app/_service/section-question-service.ts` | 기존 분석을 DTO로 변환, 임베딩 adapter, 페이지/클러스터 조회, 로컬 저장, 향후 학생 추천 후보 |
| `app/component/section-question-panel.tsx` | 섹션 선택·영역 표시·질문 많은 순 그룹·원문·재시도·실패 상태 |
| `app/component/clustered-slide.tsx` | 기존 live/presentation 공용 화면에 진입 버튼 추가 |
| `app/(view)/admin/session/[id]/page.tsx`, `present/page.tsx` | 질문이 없는 복제 세션도 올바르게 분석하도록 명시적 session ID 전달 |
| `app/component/clustered-slide.module.css` | 버튼·섹션 테두리·패널 스타일 |
| `app/_controller/use-slide-upload.ts` | 업로드 원본 File을 분석에 전달 |
| `app/_service/local-sections.ts` | 원본 파싱 우선, 실패 시 이미지 대체, native 정보/경고 저장 |
| `services/local-sections/pptx_layout.py` | ZIP/XML 파서, 실제 슬라이드 순서, 그룹 도형 좌표 변환, 여백 후보 분할 |
| `services/local-sections/server.py` | 원본 파싱/의미 분석 endpoint, 이미지와 원본의 공용 의미 보정, 섹션 원문 저장 |
| `scripts/test-section-questions.cjs` | 순수 로직 회귀 테스트 |
| `scripts/verify-section-questions.cjs` | 실제 브라우저 검증 (독립 브라우저의 인공 질문/섹션 fixture) |
| `services/local-sections/test_pptx_layout.py` | native bbox, nested transforms, XML 거부 테스트 |

## 저장 schema

운영 DB 테이블 추가 없음. localStorage의 version 1 파생 snapshot:

- `classpin-local-sections-v1:{sessionId}`: 분석 상태, source fingerprint, 섹션, native 페이지/요소, 오류·경고.
- `classpin-lecture-analysis-v1:{sessionId}`: lecture, pages, sections. 패널 열기/분석 갱신 시 기록.
- `classpin-section-clusters-v1:{sessionId}:{pageId}`: clusters + 원본 질문 연결. 원본 session-store가 항상 우선.
- `page.width/height`는 PPTX의 EMU 단위. 이미지 경로만 있을 때 null이며 픽셀 크기를 추측하지 않는다. bbox는 항상 0~1.
- `userId`와 `embedding`은 nullable adapter 필드. 작성자 UUID를 공개 데이터로 복원하지 않는다. UI 수치는 고유 인원이 아닌 **질문 건수**.
- 유형은 7종 union + 판정 불명확 상태 null. 원문/좌표/상태는 보존한다.

## API / service API

- `POST http://127.0.0.1:8769/pptx-layout`: PPTX bytes → native page dimensions/elements. 32MB upload, 128MB expanded ZIP, 200 slides.
- `POST http://127.0.0.1:8769/native-sections`: normalized elements → local semantic sections. 최대 65개 요소, 128KB.
- 기존 `POST :8769/sections`: 이미지 OCR/layout 기반 fallback.
- 기존 `POST /api/dev/question-similarity`: 로컬 Qwen3 embedding pair scores. loopback development guard 유지.
- 브라우저 service: `groupPageQuestions`, `analyzePageQuestions`, `getPageClusters`, `getQuestionCluster`, `similarQuestionCandidates`.
- 새로운 서버 영속 `POST /lectures/.../questions`, `GET /question-clusters/...`는 추가하지 않았다. 기존 session-store 제출 API와 로컬 파생 service를 조합한다. 다중 기기 API로 배포하려면 인증·RLS·영속 저장 별도 구현 필요.

## 클러스터링 규칙

1. normalized bbox 포함 검사, 중첩 시 최소 면적, 밖에서는 사각형 경계까지 거리 0.06 이하만 가장 가까운 섹션.
2. 세션/페이지/슬라이드/섹션 일치 필수. 섹션 없는 질문은 단독 유지.
3. 질문 유형이 다르면 높은 유사도여도 별도 유지. 공급된 subject가 다르면 별도 유지.
4. 같은 문구는 같은 섹션에서 합칠 수 있다. 다른 문구는 알려진 동일 의도 + 임베딩 cosine ≥ 0.88 필수.
5. 후보 그룹의 **모든 원문 쌍**이 조건을 만족해야 한다. 대표만 비교한 연쇄 병합 금지.
6. 다수 후보면 최소 쌍 유사도가 가장 높은 그룹 선택. 입력은 시간/ID 정렬, 그룹 ID는 최초 멤버 기준으로 새 질문 유입 시 안정적.
7. 대표 질문은 유사도 중심 원문(medoid), 생성 요약이 아니다. `QuestionAnalysisProvider`의 classify/embed/sameAnswer/summarize로 이후 교체 가능.

0.88과 규칙 의도 분류는 초기값이며 정확도 검증을 완료한 기준이 아니다. 대상/한 번의 답변 가능 여부를 LLM으로 확인하는 provider는 아직 연결하지 않았다. 불명확한 유형은 무리하게 합치지 않는다.

## 실행 / 검증

```powershell
# 기존 로컬 demo Next.js 실행 (운영 접속 금지)
$env:NEXT_PUBLIC_DATA_MODE='demo'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:55321'
npm run dev -- --hostname 127.0.0.1
# 별도 터미널
.local/model-benchmark-venv/Scripts/python.exe -m uvicorn server:app --app-dir services/local-sections --host 127.0.0.1 --port 8769
node scripts/test-section-questions.cjs
.local/model-benchmark-venv/Scripts/python.exe services/local-sections/test_pptx_layout.py
node scripts/verify-section-questions.cjs
node scripts/verify-spatial-pin-browser.cjs
npx tsc --noEmit
```

`/admin/session/soi-demo` → **영역 분석·검수** 또는 **섹션별 질문 → 자료 분석 설정·영역 검수**. 새 업로드는 먼저 강의 설정을 입력한다. 분석 서버 미실행/모델 오류는 페이지별 오류로 표시한다. 브라우저 종료 시 분석은 중단되며 서버 작업 큐가 아니다. 새 검수 기능은 `NEXT_PUBLIC_DATA_MODE=demo`에서 사용하며 운영 업로드·DB 경로는 바꾸지 않는다.

검증: 순수 TS 테스트, native 파서 단위 테스트, 실제 native HTTP 요청 및 외부 Origin 403, live/presentation에서 그룹·섹션 필터·원문·Esc·외부 닫기, 기존 가까운 핀 완료/되돌리기 회귀 통과. 브라우저 fixture는 AI 영역 품질 검증을 의미하지 않는다.

## 남아 있는 부분

- AI 유형 분류, 핵심 대상 추출, 생성 대표 질문은 interface 단계. 현재 규칙과 대표 원문을 UI에 명시한다.
- 큰 단일 텍스트박스 내부를 의미별 하위 bbox로 쪼개는 기능, 상속된 placeholder geometry, 회전/뒤집힌 도형 geometry, 코드 전용 인식은 미지원. 일부 요소를 OCR로 보완할 수 있으나 문서별 정확도 검증 필요.
- 원본 파서가 일부 요소를 생략하는 자료는 완전한 복원이 아니다. native parsing test가 전체 실제 PPT 호환성 보장은 아니다.
- 전체 PPT 업로드→모든 페이지 의미 분석의 실자료 E2E와 pooling paraphrase 품질 benchmark는 아직 미검증.
- 클러스터는 로컬 파생값이며 다중 기기 공유·서버 GET API·학생 추천 선택 UI·고유 인원 집계는 후속 범위.
- 배포/원격 push/운영 DB 변경 없음. 데이터 삭제 위험이 있는 Supabase reset은 실행하지 않았다.

## PPT 업로드 및 분석 검수 개선 보고

2026-10-06 후속 요구사항 기준. 로컬 서비스에 설정 → 분석 → 검수 → 확정 경로를 연결했다. 자동 결과는 확정 전 질문 매핑에 사용하지 않는다. 기존 가까운 핀 묶기, 원문 질문, 답변·완료·되돌리기는 유지한다.

### 1 기존 프로젝트 구조

대시보드와 폴더의 업로드 버튼 → 공용 `useSlideUpload` → `convertToSlides` → `/api/convert` → session-store의 `createSession` → 로컬 분석 서버 → 섹션 질문 서비스 → live/presentation 패널을 확인했다. Next.js 16.3.8, React 19, TypeScript, FastAPI 로컬 분석 서버, Supabase JS/Postgres/Storage/Realtime 구조다. ORM은 없다. PDF는 Poppler, PPT/PPTX 이미지는 LibreOffice 변환 경로를 재사용한다. PPTX 원본 분석은 ZIP/XML 도형 파서가 담당한다. 로컬 슬라이드는 `/generated/...`, 데모 SOI는 `/demo/soi/...`, 운영 슬라이드는 기존 Storage를 사용한다. 데모 질문 원본은 localStorage와 BroadcastChannel, 운영 질문은 기존 Supabase 경로가 담당한다. 색상·버튼은 `DESIGN.md`와 globals의 semantic token을 재사용했다.

### 2 변경한 파일

- `app/_controller/use-slide-upload.ts`: 설정을 받은 다음 파일 선택, 세션 생성 시 분석 설정 저장, 원본 File 전달, 검수 화면으로 이동.
- `app/(view)/admin/dashboard/{controller.ts,page.tsx}` 및 `app/(view)/admin/folders/[id]/{controller.ts,page.tsx}`: 공용 설정 다이얼로그.
- `app/_service/local-sections.ts`: 단계별 실제 요청, 페이지 오류, 재분석 정책, 설정 fingerprint, 원본/추출 cache.
- `services/local-sections/{server.py,pptx_layout.py}`: 요소 추출과 의미 분석 분리, 설정을 사용하는 여백 분할·의미 판단·출력 validation.
- `app/_service/section-question-service.ts`: confirmed snapshot만 좌표 매핑에 공급.
- `app/component/section-question-panel.tsx`: 확정 상태와 검수 화면 링크, 확인 이벤트 수신.
- `app/(view)/admin/session/[id]/page.tsx`: 영역 분석·검수 진입 버튼.
- `app/(view)/admin/session/[id]/qa-studio/{use-local-sections.ts,page.tsx}`: 검수 진입과 관리 중인 자료의 confirmed snapshot 사용.
- `scripts/verify-section-questions.cjs`: 확정된 영역 fixture로 기존 패널 회귀 확인.
- `scripts/verify-spatial-pin-browser.cjs`: 자동 SOI 100개 질문 seed와 충돌하지 않는 독립 fixture ID로 기존 가까운 핀 회귀 확인.

### 3 새 파일

- `app/_model/lecture-analysis.ts`: 설정 상수·타입·검증, 초안/확정 구조, 병합·분리 순수 함수.
- `app/_service/lecture-analysis-service.ts`: 설정 및 검수 로컬 저장, 확정, 기존 Course ID 선택, 이전 확정 개념 접근.
- `app/component/analysis-settings.tsx`: 기본·고급 설정과 native dialog.
- `app/component/analysis-workspace.module.css`: 기존 디자인 토큰 기반 검수 레이아웃.
- `app/(view)/admin/session/[id]/analysis/page.tsx`: 진행 상태, 페이지 rail, bbox overlay, 영역 inspector.
- `scripts/test-lecture-analysis.cjs`, `scripts/verify-lecture-analysis.cjs`: 순수 로직과 독립 브라우저 검증.
- `services/local-sections/test_analysis_config.py`, `test_analysis_workflow_smoke.py`: 파라미터 단위 테스트 및 실제 로컬 HTTP/모델 테스트.

### 4 DB schema

운영 DB 변경, migration 적용, reset 없음. 추가 저장 계약은 `classpin-analysis-review-v1:{lectureId}` localStorage다. 기존 섹션 실행 cache에 `stage`, `currentPage`, `elements`, `candidates`, `configKey`, `fileError`가 추가된다. 따라서 다른 기기와 영속 공유되는 서버 기능은 아니다.

### 5 Course와 Lecture 관계

기존 `ClassSession.courseId`와 Course → Lecture → Material → MaterialVersion → Slides 관계를 확인했다. Course 테이블을 중복 생성하지 않는다. 선택 가능한 과목은 기존 세션의 Course ID와 로컬 분석 설정의 Course ID에서 구한다. 이번 연속 강의 관계와 차시는 분석 설정의 `courseId`, `courseTitle`, `sequenceNumber`로 로컬 관리한다. 새 과목은 `local-course-*` ID다. 운영 `persistSession`의 새 Course 생성/권한 흐름은 변경하지 않았다. 즉 연속 강의 관계는 로컬 분석 서비스에서 유효하며 운영 relational FK 연결은 후속 작업이다.

### 6 LectureAnalysisConfig

분석 진입 시 `AI가 알아서 분석 · 바로 시작` 또는 `직접 설정하고 분석`을 선택한다. 자동은 mode=auto로 저장하고 설정 단계를 건너뛴다. 서버는 수동 기본값(분야·수준·목적 등)을 context에서 제외하며 이전 차시도 사용하지 않는다. 자료 증거로 핵심 영역을 판단하되 수준·목적을 추측해 확정하지 않는다. 영역 크기는 보통(최대 6개), 결과는 기존과 같이 검수 후 확정한다. 기존 mode 없는 설정은 수동과 호환된다.

분야(field)는 복수 선택을 지원하며 선택한 전체 배열을 분석 요청에 전달한다. 기존 단일 문자열 저장값도 호환한다. 최소 한 분야가 필요하고, 기타를 함께 선택하면 설명을 입력해야 한다. 최종 확인 화면에 선택 분야를 모두 표시한다.

`lectureType`, nullable `courseId`, `courseTitle`, nullable `sequenceNumber`, `connectPreviousLectures`, `field`, `fieldOther`, `studentLevel`, `purposes[]`, `granularity`, `focusElements[]`, `language`, `languageOther`, `keyConcepts[]`, `customTerms`, `excludedPages[]`를 저장한다. 제외 페이지는 1부터 시작한다. 단일 강의는 분석 설정에서 Course 연결을 갖지 않는다. 기본 세분화는 normal, 이전 차시 연결은 ON이다. 빈 핵심 개념 입력은 자동 판단을 뜻한다.

### 7 분석 pipeline

이미지 변환은 기존 API를 재사용한다. PPTX 원본을 우선 파싱하고, 원본 정보가 없거나 지원되지 않으면 OCR/이미지 배치 분석으로 요소를 추출한다. 요소 → 실제 여백 후보 → 의미 그룹 → 좌표 합집합과 중첩 검증 → 초안 저장 순서다. 모델이 bbox 숫자를 추측하지 않는다. 브라우저가 순차 실행하며 현재 작업은 durable queue가 아니다.

### 8 설정 반영

coarse/normal/fine은 최대 영역 수 3/6/10, 여백 기준 0.035/0.035/0.015, 출력 schema의 최대 그룹 수, 의미 분석 지시에 반영된다. 최대 개수를 억지로 채우지는 않는다. 분야, 수준, 목적, 중요 요소, 언어, 핵심 개념, 용어 설명을 모델 context로 전달한다. 입문/심화 수준의 독립 개념 판단 기준도 전달한다. 본문 요소 누락, 없는 ID, 유효하지 않은 좌표, 겹치는 자동 영역은 성공 결과로 저장하지 않는다.

### 9 진행 표시

파일 확인, 구성 요소 추출, 여백·배치 분석, 내용 관계 분석, 질문 영역 생성 상태는 실제 요청 시작과 결과 저장 시점에 갱신한다. 처리 완료 페이지 수와 현재 처리 페이지, 실제 요소 종류별 개수를 표시한다. 시간 기반 가짜 퍼센트나 결과 숫자는 없다. 표시 선택에서 추출 요소/여백 후보/최종 영역을 따로 확인한다.

### 10 검수 기능

페이지별 이름 수정, 두 개 이상 합치기, 좌우/상하 분리, 정규화 좌표 직접 수정, 영역 추가, 활성화/비활성화, 페이지 제외, 검수 완료를 제공한다. 모든 질문 가능 페이지를 검수해야 확정할 수 있다. 분리는 수동 절반 분할이며 자동 의미별 내부 텍스트 분해가 아니다. 잘못된 좌표나 빈 이름은 확정을 막는다. 재분석은 수정한 **페이지 전체**를 기본 보존하고, 전체 교체 선택 시 경고 확인 후 새 결과로 교체한다. 실패하면 기존 수정본을 지우지 않는다.

### 11 질문 핀 연결

새 초안과 기존 확정본은 분리 저장한다. `sectionsForPage`가 source 일치·미제외·활성 상태인 confirmed 섹션만 반환한다. 기존 `enrichQuestion`/`sectionAt`이 원문 핀의 정규화 좌표를 확정 섹션에 연결하고 기존 클러스터링을 실행한다. Question 원문/좌표/ID를 바꾸거나 새 질문 제출 API를 만들지 않는다. 이름·좌표 수정 및 재분석은 다시 확정하기 전까지 실시간 질문 분류에 영향을 주지 않는다. QA Studio의 미관리 SOI 자료에는 기존 수동 데모 주석이 남지만, 검수 설정이 생긴 자료에는 미확정 초안을 공급하지 않는다.

### 12 API

- 신규 `POST :8769/layout`: 이미지 → 실제 OCR/배치 요소. 8MB 제한, loopback+Origin 검사, 모델 busy 409.
- 신규 `POST :8769/layout-candidates`: `{elements, config}` → 실제 여백 후보. 의미 분석에서도 동일한 알고리즘/파라미터 사용.
- 확장 `POST :8769/native-sections`: `{elements, config, previous}` 지원. 이전 배열 요청도 호환. 최대 65요소/128KB. 이전 차시 context는 최대 5개, 크기 제한 적용.
- 기존 `/pptx-layout`, `/sections`, 질문 유사도 API 유지. 신규 DB API 없음.

### 13 UI 사용법

새 자료: 대시보드 또는 폴더 → 업로드 → 파일 선택 → 단계별 강의 분석 설정 → 최종 확인 및 업로드·분석 시작 → 분석·검수 → 각 페이지 수정 및 검수 완료 → 분석 확정·질문 기능 시작.

설정은 한 화면에 한 주제씩 표시한다. 강의 종류 → (연속 강의일 때 과목·차시) → 분야 → 청중 수준 → 목적 → 영역 세분화 → 중요 요소 → 최종 확인 순서다. 이전/다음 이동 시 선택값을 유지하며, 목적·중요 요소는 복수 선택한다. 언어·용어·핵심 개념·제외 페이지는 최종 확인 화면의 고급 설정에 있다. 파일 선택 직후에는 분석을 실행하지 않고 최종 확인 이후 실행한다. 기존 자료의 설정 변경도 동일한 단계형 UI를 사용한다.

기존 SOI: `/admin/session/soi-demo/analysis` 또는 강의 화면의 **영역 분석·검수**. 필요하면 설정의 고급 항목에서 분석 제외 페이지를 선택한다. 원본 PPTX가 없는 기존 SOI는 슬라이드 이미지 OCR 경로를 쓴다. 분석 서버가 없어도 페이지별 오류 후 수동으로 영역을 지정할 수 있다.

### 14 테스트 결과

- TypeScript 검사, 변경 파일 대상 ESLint, Next production build 통과.
- 순수 TS의 6개 시나리오 통과: 일회성 fine 설정, 연속 강의 context, 병합/분리, 비활성화, 재분석 보존/교체, 확정 섹션 기반 질문 그룹. source 변경 시 이전 확정본을 사용하지 않는 것도 확인했다.
- Python 단위 테스트 14개 통과. native 도형/중첩 transform, XML 거부, 실제 coarse/fine 여백 파라미터, 결과 검증 포함.
- 실제 브라우저: **PDF 변환 API는 실제 실행**, worker 응답은 fixture로 고정하여 설정/단계/후보/병합/이름/분리/비활성/확정/보존/교체/실패/재시도/새로고침/기존 과목 재사용을 검증했다. 3차시 확정 개념이 같은 과목 4차시 요청으로 전달됨을 확인했다. 브라우저 오류 없음.
- 실제 로컬 HTTP: PPTX bytes의 native 좌표 추출과 SOI 5페이지 OCR 요소 추출 200 응답 확인.
- 실제 Qwen 모델: 2개 개념과 각 설명/그림으로 만든 합성 요소 fixture에서 coarse는 2개(21.4초), fine은 4개(22.8초) 영역. 마지막 고정 테스트는 영역 수와 모든 입력 내용 포함 여부를 검사한다. 이 한 사례가 전체 PPT 의미 분할 정확도를 보장하지는 않는다.
- live/presentation 섹션 패널의 확정 영역 필터·원문·Esc·외부 클릭 회귀 통과.
- 가까운 핀 묶음의 원문·hover 강조·완료·되돌리기·실시간 추가 반영·좁은 화면 회귀 통과. 기존 테스트는 SOI 자동 seed로 질문 수가 달라져 대기 timeout이 발생했으며, 테스트 전용 세션 ID로 분리한 후 통과했다.
- 운영 로그인/다중 기기/운영 DB migration 검증은 이번 로컬 범위에 포함하지 않는다. destructive reset은 실행하지 않았다. Ponytail 스킬 두 개는 사용할 수 없어 직접 코드 검토와 테스트로 대신했다.

### 15 임시 구현과 제한

localStorage 저장, 브라우저 순차 실행, 로컬 Windows 분석 서버는 프로토타입 구현이다. 실제 모델 결과와 테스트 fixture를 구분해야 한다. 이미지 자체의 시각 의미 이해는 제한적이며 OCR 증거가 없으면 수동 설정이 필요하다. 단일 텍스트박스 내부 의미별 좌표 분해, 높은 요소 수의 페이지, 일부 상속/회전 도형, OCR 언어별 품질은 후속 검증 대상이다. 브라우저 저장소를 지우면 설정과 검수 결과가 사라진다. 관리 중인 분석은 브라우저를 닫으면 재시작이 필요하다.

### 16 다음 개선

운영 적용 시 owner RLS를 갖춘 분석 config/review/confirmed revision 저장과 기존 Course 선택·Lecture 생성 계약을 함께 설계해야 한다. 이후 durable job queue, 원본 파일 재분석, 다양한 PPT 품질 평가, 의미별 내부 텍스트박스 분할, 시각 드래그 편집, 차시 간 개념 graph/질문 중요도 순서로 확장할 수 있다. 운영 DB 변경은 별도 승인된 작업으로 진행한다.
