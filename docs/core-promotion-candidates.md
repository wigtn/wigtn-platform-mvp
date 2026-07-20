# 프로젝트 → 보일러플레이트 플라이휠 후보

## 즉시 코어 보강 가치가 있는 것

1. **Demo session isolation**: 버전된 합성 baseline + 방문자 local overlay + 원클릭 초기화.
2. **Import job runner**: XLSX dry-run, 행 단위 오류, formula/악성 셀 차단, commit 분리, 재시도·감사로그.
3. **Placement engine**: draft → preview → publish → rollback과 cache invalidation을 포함한 홈 큐레이션 계약.
4. **Generic moderation contract**: 게시글·댓글·리뷰가 같은 blind/restore/dispute/audit command를 사용.
5. **AI provider port**: OpenAI, Closed API, Local inference를 같은 queued/processing/completed/failed 상태와 비용·trace로 연결.
6. **Browser acceptance fixture**: evaluator role, 합성 데이터, desktop/mobile 핵심 E2E를 scaffold 산출물에 선택적으로 생성.

## 프로젝트 전용으로 유지할 것

- 회사 정규화·병합 규칙
- 영업환경 6축 taxonomy와 계산식
- 익명 회사 리뷰의 분쟁·재직 검증 정책
- 회사·콘텐츠 추천 ranking

회사 리뷰 엔진은 두 번째 유사 프로젝트에서 계약과 필드가 70% 이상 반복될 때 코어 승격을 재검토한다.

## 코어에 넣지 않을 것

- 특정 고객 브랜드·문구·샘플 회사 데이터
- 특정 Closed/Local 모델 runtime 자체
- 한 고객에게만 필요한 크롤링 source parser

코어는 provider interface, 상태, 보안·감사 계약을 제공하고 실제 모델/수집기는 프로젝트 adapter로 둔다.
