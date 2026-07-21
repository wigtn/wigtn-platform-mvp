# AI 파이프라인 SDK — 계약 명세 v0

> 작성: Sangwoo (Diego) | 작성일: 2026-07-18 | 상태: 리뷰 대기 (게이트: Harry 설계 리뷰)
> 대상 문서: WIGTN 외주 코어 구축 계획 §5(4위) · §6-4 · §9(계약 우선)
> 성격: **WIGTN 코어 모듈 계약.** 이 3종 계약이 승인되면 게시판 엔진(Maximus)·인프라(Eric/David)와 병렬 작업이 가능하다. SDK 코드 착수는 1~3위 모듈 이후지만, **계약은 지금 동결한다.**
> 검증 1호: 선제작 1호(영업인 커뮤니티, UNIFIED-PRD Part 5 FR-008).
> **2026-07-19 취합 반영(Jinmo)**: 이벤트 봉투·payload·write-back·잡큐 전제를 팀 확정 결정(`docs/UNIFIED-PRD.md` C1·C3·C4, UNIFIED-PRD)에 맞춰 갱신함.

---

## 0. 이 계약이 정하는 것 / 안 정하는 것

**정한다 (v0 코어 범위)**

- 게시판 엔진 → AI SDK로 흐르는 **이벤트 스키마**
- AI SDK가 남기는 **로깅 스키마** (전 프로젝트 공통, 동결)
- 프로젝트별 변형을 담는 **가드레일 룰 파일 포맷** (Tier 3)

**안 정한다 (v0 코어 밖 — 첫 수주 이후)**

- 질문 작성 코치(동기 상호작용) — 이벤트 패턴에 안 맞음. 선제작 1호에 프로젝트-특화로.
- 멀티 프로바이더 패리티 — v0는 어댑터 인터페이스만, OpenAI 1종 구현.
- 전문가 라우팅·유사답변 연결·eval 하네스.

**핵심 설계 원칙 (§6-4 그대로)**: AI 답변봇은 **서비스 계정 회원**이다. 이벤트를 구독하고, **일반 회원과 동일한 공개 API**로 답글을 등록한다. → 게시판 엔진에 AI 특수 코드 0줄.

---

## 1. 이벤트 계약 (게시판 엔진 ↔ AI SDK)

게시판 엔진이 outbox 테이블 + 워커로 발행(§6-3), AI SDK가 구독한다. **모듈 간 HTTP 직접 호출 없음.**

### 1.1 공통 이벤트 봉투 (팀 확정 v1 — DECISION-domain-event-envelope-v1)

```json
{
  "specVersion": "1",
  "id": "uuid (UUIDv7)",
  "type": "community.post.created.v1",
  "occurredAt": "2026-07-18T10:15:00Z",
  "traceId": "01...",
  "actor": { "type": "user", "id": "uuid" },
  "subject": { "type": "post", "id": "uuid" },
  "data": {}
}
```

- `id`: **멱등성 키.** AI 답변 등록 시 이 값을 `Idempotency-Key`로 재사용(§6-1) → 중복 답변 방지.
- `type`: `<도메인>.<엔티티>.<동작>.v<N>` — 버전은 이름 접미사(구독 라우팅=문자열 일치, 모르는 버전은 미수신).
- `actor`: 행위자 `user|admin|service|system`. **마중물 취소 판정에 사용** (§1.2 ②).
- `projectId`는 봉투에 없다 — SDK가 룰 파일 `project:` 값을 읽어 **자기 로그에만** 주입한다(로깅 스키마 §2 무변경).

### 1.2 AI SDK가 구독하는 이벤트 2종

**① `community.post.created.v1`** — AI 답변 트리거

```json
{
  "postId": "uuid",
  "boardType": "qna",
  "authorId": "uuid",
  "createdAt": "2026-07-18T10:15:00Z"
}
```

> `data`는 참조 최소(C1-d). **제목·본문은 답변 직전 `GET /v1/posts/{postId}`로 재조회**한다 — 90초 지연 중 수정분 반영, 삭제/블라인드면 skip(신규 status 값 예: `skipped_post_unavailable`, 명명은 SDK 재량 — §2 status enum에 추가만 허용 원칙 적용). SDK는 룰 파일의 `triggers.boards`에 포함된 `boardType`만 처리한다. 나머지는 무시.

**② `community.comment.created.v1`** — 지연 마중물 취소 판단용

```json
{
  "postId": "uuid",
  "commentId": "uuid"
}
```

> 지연 대기(예: 90초) 중 봉투의 **`actor.type === 'user'`** 인 댓글이 달리면 → **사람이 먼저 답함 → AI 등록 취소**(`skipIfHumanAnswered`). 마중물의 핵심 로직. (별도 `isBot` 필드 불필요 — 봉투 actor로 판정, C1/C4)

### 1.3 AI 답변 쓰기(write-back) 계약

SDK는 봇 서비스 계정으로 **공개 댓글 API**를 호출한다 (별도 AI 전용 API 없음).

```
POST /v1/posts/{postId}/comments
Headers: Authorization: Bearer <bot-service-account-jwt>, Idempotency-Key: <event id>
Body: { "content": "..." }
```

- AI 답변 표시는 body 플래그가 아니라 **서버가 인증 주체(서비스 계정)에서 파생**한다(C4 — 위조·누락 원천 차단). 프론트 라벨 문구는 룰 파일 `label` 그대로.
- 봇 계정 = `users` role=member, 시스템 플래그(PRD §2.3 봇 계정 정의와 일치). 계정 생성·정지·회전은 백오피스 관리자 툴(C4).

---

## 2. 로깅 계약 (전 프로젝트 공통 — 동결)

모든 AI 호출은 성공/실패/스킵 무관하게 **1건의 로그**를 남긴다. 이 스키마는 프로젝트 가로질러 고정 → 벤치마크·연구·비용분석 자산(원칙 2).

```json
{
  "logId": "uuid",
  "projectId": "sales-community",
  "eventId": "uuid", // 트리거 이벤트 추적
  "postId": "uuid",
  "boardType": "qna",
  "interactionType": "async_answer", // v0는 이 값 하나

  "provider": "openai",
  "model": "gpt-4o-mini",
  "promptPackId": "sales-mentor-v1",
  "guardrailRuleVersion": "sales-community@1",

  "status": "posted",
  // posted | skipped_human_answered | skipped_pre_moderation
  // | skipped_post_moderation | skipped_low_confidence
  // | skipped_post_unavailable  (원글 삭제/블라인드 — C1-d 재조회 시, 2026-07-19 확정)
  // | failed_timeout | failed_provider

  "guardrail": {
    "preBlocked": false,
    "postBlocked": false,
    "reasons": [] // ["company_name", "numeric_claim", "moderation:hate", ...]
  },

  "tokens": { "prompt": 0, "completion": 0, "total": 0 },
  "costUsd": 0.0,

  "latency": {
    "queuedMs": 0, // 인큐~처리시작 (지연 등록 포함)
    "inferenceMs": 0 // provider 호출 왕복
  },

  "createdAt": "2026-07-18T10:16:30Z"
}
```

**고정 원칙**: `status`·`guardrail.reasons`·`tokens`·`latency`·`costUsd` 5개 필드는 v0 이후에도 **의미를 바꾸지 않는다**(추가만 허용, 삭제·재정의 금지). 프로젝트별 커스텀 필드는 `meta` 객체 하위로만.

---

## 3. 가드레일 룰 파일 계약 (Tier 3 — 프로젝트별)

프로젝트 간 차이는 **오직 이 파일과 프롬프트 팩으로만** 표현한다. 엔진 코드는 프로젝트를 몰라야 한다.

```yaml
# rules/sales-community.yaml
version: 1
project: sales-community
enabled: true

triggers:
  boards: [qna] # 이 boardType의 post.created만 처리
  delaySeconds: 90 # 지연 마중물 대기
  skipIfHumanAnswered: true # 대기 중 사람 댓글 달리면 취소

provider:
  name: openai # v0는 openai만 구현 (어댑터 인터페이스는 확장 대비)
  model: gpt-4o-mini
  timeoutSeconds: 30 # 초과 시 status=failed_timeout

promptPack: sales-mentor-v1 # 프롬프트 팩 참조 (페르소나·가드 문구)

guardrails:
  pre: # 입력 검사 (AI 호출 전)
    moderation: true # provider moderation API
    blockCategories: [self_harm, sexual, hate]
    denylistRefs: [company-names]
  post: # 출력 검사 (등록 전) — ⚠️ 한국어 모더레이션 약점 보정, load-bearing
    moderation: true
    companyNameFilter: true # 회사 실명 단정 차단
    numericClaimFilter: true # 수치 단정 차단
    legalRiskCategories: [defamation, medical_advice, financial_advice]
    denylistRefs: [profanity-ko]
    onViolation: skip # skip | redact

fallback:
  onSkip: "커뮤니티 답변을 기다려요" # 등록 안 하고 이 상태 표기
  onError: silent # 조용히 폴백 (에러 노출 안 함)

label: "🤖 AI 답변"
```

### 3.1 denylist 참조 파일

`denylistRefs`는 별도 리스트 파일을 가리킨다(회사명·금칙어 등 대용량·자주 갱신).

```
denylists/company-names.txt
denylists/profanity-ko.txt
```

### 3.2 완성 기준 연결

이 룰 파일 + 프롬프트 팩만 갈아끼우면 **Sangwoo 없이 Maximus/David가 신규 프로젝트에 적용 가능**(§5 4위 완성 기준). 신규 _기능_(새 interactionType, 새 필터 로직)만 Sangwoo.

---

## 4. 의존성 · 리뷰 게이트

| 항목                                        | 상대                                               | 내용                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 비동기 배달(Postgres outbox + batch runner) | 현상(outbox·runner 구현)·Jinmo(cron 스케줄러 연결) | 지연 등록은 outbox `process_after`로, 재시도·backoff·dead-letter는 outbox worker 계약(현상 PRD §9.2). BullMQ는 승격 옵션(C3) |
| `post.created`/`comment.created` 발행       | Maximus (5위 게시판 엔진)                          | 위 §1 이벤트 스키마·outbox 발행 확정                                                                                         |
| 봇 서비스 계정 + 공개 댓글 API              | Maximus (3위 인증·5위)                             | §1.3 write-back 계약, `isAiAnswer` 플래그                                                                                    |
| 설계 리뷰 승인                              | Harry                                              | 본 계약 3종 게이트 통과                                                                                                      |

---

## 5. v0 스코프 자물쇠 (내가 스스로 거는 것 — §9 원칙 1)

> **v0 = 비동기 답변(이벤트 구독) + 가드레일(사전/사후) + OpenAI 어댑터 1종 + 고정 로깅 + on/off + 지연 등록.**
> 코치·라우팅·유사답변·멀티프로바이더·eval = 전부 첫 수주 이후. 이 선을 넘으면 코어 만들다 프로젝트 캐파를 잠식한다.

---

## 부록. 리뷰어(Harry)에게 물을 것

1. `interactionType`을 로그에 지금 넣어둔 건, 나중에 코치/라우팅 붙일 때 로그 스키마 안 깨려는 것. OK?
2. 봇 write-back에 공개 API 재사용 vs 내부 전용 경로 — 나는 공개 API 재사용이 §6-4 취지에 맞다고 봄. 이견?
3. `delaySeconds`·`model` 같은 운영 파라미터를 룰 파일(코드 배포)에 둘지, 런타임 설정(DB)으로 뺄지 — v0는 파일로 시작 제안.
