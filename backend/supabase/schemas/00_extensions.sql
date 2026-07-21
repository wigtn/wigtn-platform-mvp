-- 00_extensions.sql — 선언형 스키마 원본 (declarative source of truth)
-- WIGTN 외주 코어 · Gate 1 재현 가능한 기반
--
-- 이 디렉토리(supabase/schemas/*.sql)가 스키마의 단일 원본이다.
-- 변경 흐름: 이 파일 수정 → `supabase db diff -f <name>`로 migration 생성 →
--            사람이 migration 검토(RLS/grant/view는 diff가 놓칠 수 있음, PRD §10.1) →
--            `supabase db reset`로 빈 DB부터 재현.
--
-- 파일은 lexicographic 의존 순서로 로드된다(00 → 05 → 10 → 20 → 30 → 90).

create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid, digest/hmac
create extension if not exists pg_trgm with schema extensions;    -- 게시판 부분일치 검색(PRD §7.4)
create extension if not exists citext with schema extensions;     -- 이메일 정규화 비교

-- 내부 전용(비노출) 스키마: RLS 헬퍼 함수·privileged 로직을 Data API 밖에 둔다(PRD §5.6, §13.2).
create schema if not exists app_private;

revoke all on schema app_private from anon, authenticated;
