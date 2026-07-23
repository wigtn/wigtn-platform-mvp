-- 작성자 등급 배지에 자리를 만든다.
--
-- ## 왜
--
-- 글 목록과 글 상세는 작성자 이름 옆에 등급 배지를 그리게 되어 있다.
--
--     {post.badge ? <b>{post.badge}</b> : null}
--
-- 스타일도 있고 정적 데이터에도 값이 있다("검증 영업인 L2", "실적 인증").
-- 그런데 profiles 에 그 값을 담을 칸이 없다. DB 를 붙이는 순간 badge 가
-- 전부 undefined 가 되어 **배지가 통째로 사라진다.**
--
-- 오류가 안 나서 더 나쁘다. 옆 사이드바는 "답변자 이름 옆의 확인 배지를
-- 참고하세요" 라고 안내하는데, 정작 그 배지가 화면에 하나도 없다.
--
-- ## 왜 account_status 로 대신하지 않나
--
-- account_status 는 active/pending 두 상태뿐이라 "검증 영업인 L2" 와
-- "실적 인증" 을 구분하지 못한다. 등급은 운영이 붙이는 별개의 값이다.

set search_path = public, extensions;

alter table public.profiles
  add column if not exists badge text;

comment on column public.profiles.badge is
  '작성자 이름 옆에 붙는 등급 표시. 없으면 배지를 그리지 않는다.';
