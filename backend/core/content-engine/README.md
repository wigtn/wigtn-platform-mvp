# @demo/content-engine

Gate 4 게시판 vertical slice의 framework-agnostic 계약을 소유한다.

- 구조화 문서 v1 검증, plain-text 변환, allowlist HTML 렌더링
- 안정 cursor encode/decode와 page-size 제한
- 게시물 첨부 bucket·MIME·크기 정책
- WIGTN API rate-limit 정책

DB transaction, RLS, moderation command는 `supabase/schemas/20_community.sql`, `39_content_commands.sql`, `40_policies.sql`이 소유한다. 공개 REST 원본은 `packages/api-contracts/openapi/public-v1.yaml`이다.

## SoT 위치

이 패키지의 정본은 `module/content-engine/`입니다. `projects/demo/packages/content-engine`는 demo 소비/검증 타깃입니다.
