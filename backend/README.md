# WIGTN Platform backend

영업 커뮤니티 MVP의 실제 백엔드입니다. 기존 프론트엔드와 독립된 `backend/` 경계 안에 두어 디자인 교체 작업과 파일 충돌이 나지 않습니다.

## 포함 범위

- Supabase Auth 기반 이메일 인증, 계정 상태, 역할·권한, 관리자 step-up
- 게시판·글·댓글·대댓글·좋아요·스크랩·신고·첨부파일
- 회사 검색, 익명 회사 리뷰, 항목별 별점과 익명성 분리 저장
- 회사 엑셀/CSV 일괄 등록 작업, 메인 콘텐츠 배치·예약·롤백
- 감사 로그, 트랜잭셔널 outbox, 질문 게시글 AI 지연 답변 워커
- 로그인 UI 없이 전 기능을 체험하는 방문자별 격리 데모 세션
- 모든 Data API 테이블의 명시적 grant와 RLS

## 로컬 실행

Node 22+, Docker, Supabase CLI가 필요합니다.

```bash
cd backend
npm ci
npm run db:start
npm run db:reset
npm run verify
```

`supabase status -o env`에서 로컬 키를 확인해 `.env.local`에 넣습니다. OpenAI 키가 없으면 AI 워커 테스트는 결정론적 fake provider로 실행되며, 실제 워커 실행에만 `OPENAI_API_KEY`가 필요합니다.

## 프론트 연결 계약

프론트는 `SUPABASE_URL`과 공개 anon key만 사용합니다. 서비스 역할 키와 DB 접속 문자열은 워커/서버 전용입니다. 쓰기 작업은 RLS가 적용된 테이블 또는 공개 RPC만 호출하며, 관리자 명령은 DB 권한·최근 TOTP·감사 로그·멱등키를 서버에서 다시 검증합니다.

입찰 데모에서는 `ensureDemoExperience`가 로그인 화면 없이 Supabase 익명 세션을 발급합니다. 익명 사용자의 체험 동작은 운영 테이블이 아니라 사용자별 private action ledger에 저장되며, 실제 회원·관리자 command 권한은 부여하지 않습니다. 프론트 연결 예시는 `docs/frontend-contract.md`를 따릅니다.

## 코어 재사용 경계

`core/`는 검증된 WIGTN 코어 모듈의 프로젝트 스냅샷입니다. 프로젝트 고유 회사 리뷰, 회사 가져오기, 메인 배치 로직은 `src/`와 마지막 도메인 migration에 위치합니다. 종료 회고에서 범용성이 확인된 코드만 원본 코어 저장소로 승격합니다.
