-- 20260719035500_app_authenticator_role.sql
-- 사람이 검토한 role/grant migration (PRD §10.1: 선언형 diff는 cluster-global role을 추적하지 못한다).
-- 선언형 원본은 supabase/schemas/90_grants_roles.sql. 이 migration은 그 role 섹션과 parity를 유지한다.
--
-- 앱 전용 DB LOGIN role (§3.4 DB 연결 보안 계약):
--   runtime command는 postgres/service_role/BYPASSRLS/schema owner로 붙지 않는다.
--   NOINHERIT → 명시적 SET ROLE authenticated 시에만 사용자 RLS 컨텍스트 획득.
--   DDL·CREATEROLE·CREATEDB·SUPERUSER 없음(기본), app_private 직접 테이블 접근 없음.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_authenticator') then
    -- 원격 migration은 로그인 자격증명을 만들지 않는다. 배포 provisioning이
    -- Secret Manager 값으로 LOGIN/password를 설정하고, 로컬 seed만 fixture를 연다.
    create role app_authenticator nologin noinherit;
  end if;
end
$$;

grant anon to app_authenticator;            -- 인증 전 읽기 경로
grant authenticated to app_authenticator;   -- SET ROLE authenticated 대상
grant usage on schema public to app_authenticator;
grant usage on schema app_private to app_authenticator;
grant execute on all functions in schema app_private to app_authenticator;

-- 금지의 명시적 집행(Gate 1-E 테스트가 검증):
revoke all on schema information_schema from app_authenticator;
alter role app_authenticator set search_path = public, extensions;

-- ── profiles grant 하드닝 (§4.2, §10.1) ─────────────────────────────
-- Supabase 기본 privilege가 테이블 생성 시 anon/authenticated에 full 권한을 부여하고,
-- 선언형 diff는 additive-only라 그 default의 REVOKE를 migration에 담지 못한다.
-- 따라서 account_status 직접 변경 차단은 이 hand-reviewed migration에서 집행한다.
-- (선언형 원본의 의도는 supabase/schemas/90_grants_roles.sql에 기록됨.)
revoke update on public.profiles from anon, authenticated;
revoke insert, delete on public.profiles from anon;
grant update (handle, display_name, updated_at) on public.profiles to authenticated;
