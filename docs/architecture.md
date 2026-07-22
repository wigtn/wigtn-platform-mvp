# 구현·마이그레이션 계약

## 현재 입찰 데모

- UI와 Supabase queue/poll 경로는 실서비스용 구조다.
- `DemoState`는 공개 합성 baseline 위에 방문자별 local overlay를 만든다.
- 역할 전환은 실제 가입 절차를 생략하기 위한 evaluator affordance이며 production 인증을 대체하지 않는다.
- 리뷰 상태 변경과 관리자 명령은 실제 도메인 상태명을 사용한다.
- AI 질문은 실제 Supabase 익명 세션, 방문자별 private queue, 맥미니 워커와 OpenAI Responses API를 사용한다.
- 브라우저와 Vercel은 OpenAI를 직접 호출하지 않는다. 맥미니 워커만 provider key를 보유하고 입력 moderation → 구조화 생성 → 출력 moderation을 수행한다.
- 답변 계약은 핵심 판단, 확인 질문 3개, 실행 행동 3개, 주의점, 부족한 정보 목록이며 JSON Schema와 런타임 파서에서 함께 검증한다.

## 수주 후 adapter 교체

| Port           | 데모                                 | 실서비스                                   |
| -------------- | ------------------------------------ | ------------------------------------------ |
| Auth           | seeded role                          | Supabase email verification/session        |
| Company/Review | fixture + overlay                    | Postgres command + RLS + aggregate rebuild |
| Community      | fixture + overlay                    | content-engine RPC                         |
| AI             | private queue + OpenAI Responses API | 운영형 queue/관측·예산 정책 고도화         |
| Upload         | 합성 증빙 상태                       | private Storage presign/complete           |
| Admin          | harmless command                     | typed registry + permission + audit        |

## 코어와 custom 경계

- 그대로 재사용: auth-membership, content-engine, backoffice-frame, ai-pipeline-sdk, notification-file, api-contracts, UI token 기반.
- 코어 우선 보강: import job runner, placement state engine, demo session isolation, browser/axe fixture.
- project-local: 회사 정규화/병합, 영업환경 6축, 익명 리뷰 정책, 회사 통계와 관련 콘텐츠 ranking.
- 추후 후보: review-engine은 두 번째 리뷰형 프로젝트에서 계약 70% 이상 반복될 때만 승격한다.

## 배포 안전

- 합성 데이터만 사용한다.
- AI 질문은 개인정보를 넣지 않는다는 안내와 함께 익명 사용자별 시간당 3건, 전체 시간당 30건으로 제한한다.
- 입력·출력 moderation, 회사명·수치 단정 차단, prompt injection 방어 문구, 최대 출력 토큰, 재시도/lease를 적용한다.
- 배포 환경에서는 익명 Auth CAPTCHA/Turnstile과 인프라 레벨 rate limit을 추가로 켠다.
- `OPENAI_API_KEY`는 백엔드 워커 secret에만 두고 브라우저 공개 환경변수로 전달하지 않는다.
- production build에서 demo role switch를 비활성화하는 환경 gate는 수주 후 실서비스 adapter PR의 필수 조건이다.
- 실제 고객 데이터는 production에만 두고 preview/staging은 합성·비식별 데이터만 허용한다.
