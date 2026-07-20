# FIELDNOTE — 영업 커리어 인텔리전스 입찰 데모

평가자가 가입 없이 비회원·일반 영업인·인증 영업인·운영 관리자 역할을 바꾸며 전체 요구 기능을 체험하는 공개 MVP입니다. 모든 회사·회원·리뷰는 합성 데이터입니다.

## 실행

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## 체험 흐름

1. 홈에서 회사 탐색 → 회사 상세 → 익명 리뷰 작성 → 통계 갱신
2. Q&A 질문 작성 → queued/thinking → AI 첫 답변 → 사람 답변 대기
3. 커뮤니티 글 → 좋아요·스크랩·댓글·답글·신고
4. 일반 게시글 → 에디터 도구·이미지 첨부 → 상세 화면 확인
5. 마이페이지 → 프로필 수정·활동/스크랩 → 합성 증빙 검증 신청
6. 관리자 역할 → 리뷰 블라인드/복구 → 회사 수기·XLSX·크롤러 dry-run → 홈 배치 → 회원·콘텐츠 운영

화면 우측 하단 데모 도크에서 역할을 바꾸거나 상태를 초기화할 수 있습니다. 브라우저 상태는 버전이 붙은 localStorage overlay에만 기록되며 서버·외부 서비스로 전송하지 않습니다.

## 보일러플레이트 재사용

- Next.js App Router와 TypeScript strict 구조
- 코어의 auth/membership, content-engine, backoffice registry, AI pipeline, notification/file, API envelope 및 RLS 계약을 기준으로 UI 상태를 설계
- 데모 adapter는 합성 데이터와 압축된 AI 지연만 담당하며, 수주 후 Supabase/OpenAI adapter로 교체
- 회사·리뷰 taxonomy는 첫 프로젝트 custom으로 유지하고 두 번째 유사 프로젝트에서 반복성이 증명될 때 코어 승격

상세 계약은 [아키텍처 문서](docs/architecture.md), [요구사항 충족표](docs/acceptance-matrix.md), [코어 승격 후보](docs/core-promotion-candidates.md), 실제 DB/RLS 초안은 [schema.sql](supabase/schema.sql)을 참고하세요.
