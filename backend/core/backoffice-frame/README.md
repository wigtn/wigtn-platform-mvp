# packages/backoffice-frame

관리자 tool registry, 화면 배치 검증, MCP metadata adapter, outbox batch runner를
제공하는 배포 SDK 비의존 도메인 패키지입니다.

## Tool registry

- JSON Schema 2020-12 input/output 검증
- permission, risk, idempotency, audit, effect manifest 정적 검증
- high-risk command의 최근 TOTP·활성 세션·idempotency key 공통 강제
- `data-table`, `command-form`, `job-progress` 화면 배치 검증
- 동일 manifest에서 public API와 MCP fixture metadata 파생

실제 권한·세션·도메인 변경·감사·outbox 원자성은 handler의 DB command가 다시
검사합니다. 브라우저 입력이나 manifest middleware만 보안 경계로 신뢰하지 않습니다.

## Outbox runner

`runOutboxBatch()`는 주입된 store와 handler만 사용하며 Next.js, Supabase SDK,
배포 SDK를 import하지 않습니다. 등록된 handler의 이벤트 타입만 claim하고 성공은
ack, 실패는 retry/dead-letter로 격리합니다. 현재 Postgres adapter와 cron 조립은
`apps/admin`에 있습니다.

## SoT 위치

이 패키지의 정본은 `module/backoffice-frame/`입니다. `projects/demo/packages/backoffice-frame`는 demo 소비/검증 타깃입니다.
