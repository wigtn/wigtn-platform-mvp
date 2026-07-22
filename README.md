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

실제 AI 데모를 로컬에서 실행하려면 루트 `.env.local`에 공개 Supabase URL/키를,
`backend/.env`에는 `OPENAI_API_KEY`와 워커 DB URL을 넣은 뒤 아래 프로세스를 함께 실행합니다.

```bash
cd backend
npm run db:start
npm run db:reset
npm run worker:watch

# 다른 터미널, 저장소 루트
pnpm dev
```

기본 모델은 비용과 품질의 균형을 위해 `gpt-5.6-terra`를 사용합니다. 질문은 Supabase의 방문자별
비공개 큐에 들어가고, 맥미니의 `worker:watch`가 입력·출력 가드레일과 구조화 출력 검증을 거쳐
처리합니다. OpenAI 키는 맥미니 워커에만 두며 브라우저·Vercel 환경변수에는 넣지 않습니다.

## 체험 흐름

1. 홈에서 회사 탐색 → 회사 상세 → 익명 리뷰 작성 → 통계 갱신
2. Q&A 질문 작성 → queued/thinking → AI 첫 답변 → 사람 답변 대기
3. 커뮤니티 글 → 좋아요·스크랩·댓글·답글·신고
4. 일반 게시글 → 에디터 도구·이미지 첨부 → 상세 화면 확인
5. 마이페이지 → 프로필 수정·활동/스크랩 → 합성 증빙 검증 신청
6. 관리자 역할 → 리뷰 블라인드/복구 → 회사 수기·XLSX·크롤러 dry-run → 홈 배치 → 회원·콘텐츠 운영

상단 데모 배너에서 역할을 바꾸거나 상태를 초기화할 수 있습니다. 일반 화면 상태는 버전이 붙은
localStorage overlay에 기록됩니다. AI 질문만 Supabase 익명 세션으로 방문자별 비공개 큐에 전달되며,
입력·출력 안전성 검사를 통과한 답변만 표시됩니다.

## 보일러플레이트 재사용

- Next.js App Router와 TypeScript strict 구조
- 코어의 auth/membership, content-engine, backoffice registry, AI pipeline, notification/file, API envelope 및 RLS 계약을 기준으로 UI 상태를 설계
- AI 질문은 Supabase 익명 세션 → 비공개 queue → 맥미니 `ai-pipeline-sdk` 가드레일 → OpenAI Responses API → poll 경로로 실제 동작
- AI 답변은 핵심 판단·확인 질문·실행 행동·주의점·추가 확인 정보의 고정 JSON Schema로 생성하고 화면은 각 필드를 분리해 표시
- 공개 Supabase 설정이 없는 preview/CI에서는 외부 호출 없는 명시적 데모 폴백으로 동작
- 회사·리뷰 taxonomy는 첫 프로젝트 custom으로 유지하고 두 번째 유사 프로젝트에서 반복성이 증명될 때 코어 승격

상세 계약은 [아키텍처 문서](docs/architecture.md), [요구사항 충족표](docs/acceptance-matrix.md), [코어 승격 후보](docs/core-promotion-candidates.md), 실제 DB/RLS 초안은 [schema.sql](supabase/schema.sql)을 참고하세요.
