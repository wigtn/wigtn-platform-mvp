-- 회사 카드가 보여 주던 두 값에 자리를 만든다.
--
-- ## 왜
--
-- 화면은 정적 배열을 쓸 때 회사마다 이걸 들고 있었다.
--
--     summary   "분기 초 계정 배분 기준을 공유하고 큰 딜에는 SE가 동행합니다."
--     trend     관심도 +12%
--
-- DB 의 companies 에는 둘 다 없다. 그대로 붙이면 회사 카드에서 설명 줄이
-- 사라지고 관심도가 전부 `+0%` 로 뜬다 - 화면이 고장 난 것처럼 보인다.
--
-- ## 리뷰에서 뽑을 수 없나
--
-- summary 는 회사 소개지 리뷰 요약이 아니다. trend 는 조회수 기반인데 이
-- 데모에 조회 로그가 없다. 없는 걸 리뷰에서 지어내면 숫자가 거짓이 된다.
--
-- 그래서 회사 레코드의 값으로 둔다. 실서비스에서는 운영 도구나 집계
-- 파이프라인이 채우는 자리다. 데모에서는 시드가 채운다(합성 데이터).

set search_path = public, extensions;

alter table public.companies
  add column if not exists summary text,
  -- 최근 관심도 변화(%). 홈의 "최근 조회가 늘어난 회사" 정렬 기준이다.
  add column if not exists interest_trend numeric(5,2) not null default 0;

comment on column public.companies.summary is
  '회사 카드에 한 줄로 나가는 소개. 리뷰 요약이 아니다.';
comment on column public.companies.interest_trend is
  '최근 관심도 변화(%). 실서비스에서는 조회 집계가 채운다.';
