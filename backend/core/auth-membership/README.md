# packages/auth-membership

`auth-membership` 모듈 벤더링/확장 위치입니다.

Gate 2 인증/회원 vertical slice의 공유 도메인 계약입니다.

- 관리자 등급 승인 operation manifest (`risk: high`, 최근 TOTP, 멱등성·감사 필수)
- 등급 신청 상태와 private 증빙 제한
- `getClaims()` 결과에서 최근 TOTP를 판정하는 순수 함수

DB의 최종 권한·원자성 원본은 `supabase/schemas/37_membership_commands.sql`이며, 이 패키지는 Web/Admin이 같은 정책을 사용하도록 돕습니다.

## SoT 위치

이 패키지의 정본은 `module/auth-membership/`입니다. `projects/demo/packages/auth-membership`는 demo 소비/검증 타깃입니다.
