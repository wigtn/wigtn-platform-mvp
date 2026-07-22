# 입찰 데모 요구사항 충족표

이 문서는 “평가자가 가입 없이 전 기능을 확인한다”는 입찰 데모 범위를 기준으로 한다. 실사용자 인증·실데이터·외부 API는 공개 데모에서 의도적으로 분리한다.

| ID    | 요구사항                                        | 데모 상태 | 실행 증거                                                                | 실서비스 전환                                         |
| ----- | ----------------------------------------------- | --------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| AC-01 | 가입 없이 비회원·영업인·인증 영업인·관리자 체험 | 충족      | 전역 데모 도크 역할 전환·초기화                                          | Supabase email 인증과 세션으로 교체                   |
| AC-02 | 메인 큐레이션과 체류 동선                       | 충족      | 오늘의 pulse, 주목 회사, 현장 노트, AI 질문 CTA                          | placement command와 집계 read model 연결              |
| AC-03 | 게시판·글·이미지·댓글·대댓글·좋아요·스크랩·신고 | 충족      | 일반 글/이미지 메타 등록, 질문, 실제 상태 변경                           | content-engine·private Storage RPC 연결               |
| AC-04 | 질문 후 AI 첫 답변                              | 충족      | 익명 세션 → private queue → Terra → 입력·출력 guardrail → posted 전이    | 관측 대시보드·예산 알림 추가                          |
| AC-05 | 회사 검색·6축 평가·익명 리뷰·평균 통계          | 충족      | 회사 검색, 리뷰 등록, 6축 값과 평균 즉시 재계산                          | project-local review command/RLS/aggregate 연결       |
| AC-06 | 마이페이지 활동·프로필·검증 증빙                | 충족      | 프로필 저장, 스크랩/댓글, 합성 증빙 검토중 전이                          | auth-membership·private upload·moderator command 연결 |
| AC-07 | 회원·배지 운영                                  | 충족      | 관리자 승인·반려 동작                                                    | permission/audit/idempotency 적용                     |
| AC-08 | 회사 수기·XLSX·크롤러 후보                      | 충족      | 수기 등록, XLSX dry-run, crawler 후보 dry-run                            | import job runner와 출처/robots 정책 적용             |
| AC-09 | 게시글·댓글·리뷰 블라인드                       | 충족      | 리뷰 블라인드/복구, 콘텐츠 블라인드 후 공개 피드 제외                    | typed moderation command와 감사로그 연결              |
| AC-10 | 메인 콘텐츠 수동 배치                           | 충족      | draft/published 왕복                                                     | placement engine과 cache invalidation 연결            |
| AC-11 | PC/MO 반응형                                    | 충족      | Playwright Desktop Chrome·Pixel 7, 수평 overflow 검사                    | Safari/WebKit 실기기 회귀 추가                        |
| AC-12 | 비밀번호 암호화·개인정보 보호 구조              | 부분 충족 | 공개 데모는 비밀번호/개인정보를 수집하지 않고 익명 식별 분리 정책을 노출 | 검증된 코어 auth/RLS/storage를 고객 환경에 migration  |

## 공개 데모에서 의도적으로 하지 않는 것

- 실제 이메일 발송, 실제 회원가입, 고객 개인정보 수집
- 업로드 원본 보존과 실제 크롤링
- 관리자처럼 보이기 위한 클라이언트 역할 전환을 production 인증으로 재사용

이 항목들은 빠진 화면이 아니라 외부 부작용과 개인정보 위험을 제거한 adapter 경계다. 계약 후 합성 adapter를 검증된 코어 모듈과 고객별 project-local 모듈로 교체한다.
