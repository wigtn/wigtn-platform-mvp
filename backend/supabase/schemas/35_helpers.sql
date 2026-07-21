-- 35_helpers.sql — RLS predicate 헬퍼 (app_private, 비노출)
-- 권한 원본은 DB다. JWT app_metadata는 빠른 거절용 캐시일 뿐(PRD §5.1).
-- 아래 함수는 매 호출마다 최신 DB 상태를 조회한다 — 민감 경로의 stale JWT 방지(§5.6).
--
-- **SECURITY DEFINER 채택 근거(§5.6 예외 승인 요건 충족)**:
--   RLS predicate 헬퍼는 정책이 참조하는 테이블(role_permissions 등)을 RLS 없이 읽어야 한다.
--   INVOKER면 일반회원이 has_permission() 호출 시 role_permissions RLS(admin 전용)에 막혀
--   항상 false가 되는 결함이 생기고, profiles 자기참조 정책과 재귀 위험도 있다.
--   요건: ① 비노출 schema(app_private) ② 명시적 EXECUTE 권한만 부여 ③ 고정 search_path(='')
--   ④ 함수는 상태를 변경하지 않는 조회 전용. definer=postgres(migration 실행 주체).

create or replace function app_private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function app_private.current_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = app_private.current_user_id()
      and p.account_status = 'active'
  );
$$;

create or replace function app_private.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = app_private.current_user_id()
      and rp.permission_key = perm
  );
$$;

-- 현재 주체가 특정 게시판에 답글을 쓸 수 있는 active 서비스 계정인가(§3.7 권한 상한).
-- JWT claim만으로 허용하지 않고 service_accounts.status='active'를 매번 확인한다(§10.2, §3.7).
create or replace function app_private.service_account_can_access_board(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_accounts sa
    join public.service_account_boards sab on sab.service_account_id = sa.id
    where sa.user_id = app_private.current_user_id()
      and sa.status = 'active'
      and sab.board_id = target_board_id
  );
$$;

-- 답글 쓰기는 허용 board 접근에 더해 reply.create 상한을 매 요청 최신 DB에서 확인한다.
create or replace function app_private.service_account_can_reply(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.service_account_can_access_board(target_board_id)
    and exists (
      select 1 from public.service_accounts sa
      where sa.user_id = app_private.current_user_id()
        and sa.allowed_reply_create
    );
$$;

-- 현재 주체가 서비스 계정인가. 일반 회원 쓰기 분기에서 서비스 계정을 배제하는 데 쓴다.
-- (서비스 계정도 active 프로필을 갖지만, 권한 상한은 '허용 게시판 답글'뿐이어야 한다 — §3.7)
create or replace function app_private.is_service_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_accounts sa
    where sa.user_id = app_private.current_user_id()
  );
$$;

-- 노출 통제: app_private는 PUBLIC에서 차단하고, RLS 평가에 필요한 EXECUTE만 명시 부여(§5.6).
revoke all on schema app_private from public;
revoke all on all functions in schema app_private from public;
grant usage on schema app_private to anon, authenticated;
grant execute on function app_private.current_user_id()                to anon, authenticated;
grant execute on function app_private.current_account_active()         to anon, authenticated;
grant execute on function app_private.has_permission(text)             to anon, authenticated;
grant execute on function app_private.service_account_can_access_board(uuid) to anon, authenticated;
grant execute on function app_private.service_account_can_reply(uuid)  to anon, authenticated;
grant execute on function app_private.is_service_account()             to anon, authenticated;
