-- 90_grants_roles.sql — Data API grant(RLS와 별개 보안 계층, §10.1) + 앱 전용 DB LOGIN role(§3.4)
-- 마지막에 로드된다(모든 테이블 존재 후). role/grant는 선언형 diff가 놓칠 수 있어 migration 검토 대상(§10.1).

-- ── Data API grant: anon/authenticated는 RLS로 좁혀지지만 GRANT가 먼저 있어야 한다 ──
grant usage on schema public to anon, authenticated;

-- Supabase의 table default privilege는 TRUNCATE까지 포함할 수 있다. RLS는 TRUNCATE를 막지 못하므로
-- 먼저 전부 회수한 뒤 아래 allowlist만 재부여한다.
revoke all on all tables in schema public from anon, authenticated;

-- 공개 읽기 테이블
grant select on public.boards, public.posts, public.post_contents, public.comments, public.reactions to anon;
grant select on public.consent_documents, public.membership_grades, public.membership_badges to anon;

-- 회원 경로 테이블(세부 접근은 RLS가 강제)
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.post_contents to authenticated;
grant select on public.post_revisions to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant update (body, is_deleted, updated_at, deleted_reason) on public.comments to authenticated;
grant select, insert, delete on public.reactions, public.bookmarks to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.moderation_actions to authenticated;
-- profiles: Supabase 기본 privilege가 테이블 생성 시 anon/authenticated에 full 권한을 부여하므로,
--   account_status 보호를 위해 table-level UPDATE를 명시 회수하고 컬럼 레벨만 재부여한다(§4.2, §10.1).
--   상태 전이는 명시적 명령(SECURITY DEFINER 경로)만 수행한다.
revoke update on public.profiles from anon, authenticated;
revoke insert, delete on public.profiles from anon;     -- anon은 프로필 쓰기 불필요(RLS로도 차단, grant도 축소)
grant select on public.profiles to authenticated;
grant update (handle, display_name, updated_at) on public.profiles to authenticated;
grant select on
  public.boards, public.system_roles, public.permissions, public.role_permissions,
  public.user_roles, public.account_state_events, public.auth_provider_links,
  public.service_accounts,
  public.service_account_boards, public.audit_events, public.consent_documents,
  public.user_consents, public.membership_grades, public.grade_applications,
  public.grade_application_documents, public.user_membership_grades,
  public.membership_badges, public.badge_applications,
  public.badge_application_documents, public.user_badges
  to authenticated;
-- 관리자 관리 테이블의 쓰기는 RLS(has_permission)로 통제하되 grant도 부여
-- (profiles는 제외 — account_status 보호를 위해 위의 컬럼 레벨 grant만 유지)
grant insert, update, delete on
  public.user_roles, public.service_accounts,
  public.service_account_boards, public.boards
  to authenticated;

-- ── 함수 EXECUTE allowlist ─────────────────────────────────────────
-- PostgreSQL 함수는 생성 시 PUBLIC EXECUTE가 기본이다. 35/37/38/39 파일의 개별 revoke에 더해
-- 모든 함수가 생성된 마지막 단계에서 다시 닫아, 새 함수나 migration generator ACL 누락도 막는다.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sync_current_auth_provider_links(text),
  public.complete_member_onboarding(text, text, uuid[], text),
  public.submit_grade_application(uuid, uuid, jsonb, jsonb, text, text),
  public.submit_badge_application(uuid, uuid, jsonb, jsonb, text, text),
  public.withdraw_current_user(text, text),
  public.create_post(text, uuid, text, jsonb, uuid[], text, text),
  public.update_post(uuid, text, jsonb, text),
  public.delete_post(uuid, text, text),
  public.create_comment(uuid, uuid, uuid, text, text, text),
  public.update_comment(uuid, text, text),
  public.delete_comment(uuid, text, text),
  public.set_post_reaction(uuid, public.reaction_type),
  public.remove_post_reaction(uuid, public.reaction_type),
  public.set_post_bookmark(uuid),
  public.remove_post_bookmark(uuid),
  public.submit_content_report(uuid, uuid, text, text, text),
  public.begin_post_attachment(uuid, text, text, text, bigint),
  public.complete_post_attachment(uuid)
to authenticated;

revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function
  app_private.current_user_id(),
  app_private.current_account_active(),
  app_private.has_permission(text),
  app_private.service_account_can_access_board(uuid),
  app_private.service_account_can_reply(uuid),
  app_private.is_service_account()
to anon, authenticated;
grant execute on function
  app_private.current_claims(),
  app_private.has_current_required_consents(uuid),
  app_private.has_recent_totp(interval, interval)
to authenticated;

-- ── 앱 전용 DB LOGIN role (§3.4 DB 연결 보안 계약) ──────────────────
-- runtime command는 postgres/service_role/BYPASSRLS/schema owner로 붙지 않는다.
-- 전용 role은 authenticated 전환과 필요한 schema 사용만 허용, DDL·role 관리·불필요 schema 금지.
-- NOINHERIT: 기본 권한 없음 → 명시적 SET ROLE authenticated 시에만 사용자 RLS 컨텍스트 획득(§3.4).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_authenticator') then
    -- 로컬/CI 전용 비밀번호. 실제 프로젝트는 Secret Manager에서 회전(APP_DATABASE_URL).
    create role app_authenticator nologin noinherit;
  end if;
end
$$;

grant anon to app_authenticator;            -- 인증 전 읽기 경로
grant authenticated to app_authenticator;   -- SET ROLE authenticated 대상
grant usage on schema public to app_authenticator;
-- app_private 권한은 SET ROLE anon/authenticated 후 해당 역할의 명시 grant만 사용한다.
-- app_authenticator 자체에 ALL FUNCTIONS를 주면 내부 outbox worker 함수까지 호출 가능해진다.
revoke all on schema app_private from app_authenticator;
revoke all on all functions in schema app_private from app_authenticator;
-- Gate 2 high-risk 승인 command만 서버 adapter에 정확히 허용한다. Data API schema에는 노출되지 않는다.
grant usage on schema app_private to app_authenticator;
grant execute on function app_private.approve_grade_application(uuid, text, text, text)
  to app_authenticator;
grant execute on function app_private.search_members(text, integer, text)
  to app_authenticator;
grant execute on function app_private.current_admin_context()
  to app_authenticator;
grant execute on function app_private.list_grade_applications(integer, text)
  to app_authenticator;
grant execute on function app_private.list_badge_applications(integer, text)
  to app_authenticator;
grant execute on function app_private.list_active_badges(integer, text)
  to app_authenticator;
grant execute on function app_private.outbox_progress(text)
  to app_authenticator;
grant execute on function app_private.suspend_member(uuid, text, text, text)
  to app_authenticator;
grant execute on function app_private.approve_badge_application(uuid, text, text, text)
  to app_authenticator;
grant execute on function app_private.revoke_user_badge(uuid, text, text, text)
  to app_authenticator;
grant execute on function app_private.unsuspend_member(uuid, text, text, text),
  app_private.withdraw_member(uuid, text, text, text),
  app_private.set_member_role(uuid, text, text, text, text),
  app_private.reject_grade_application(uuid, text, text, text),
  app_private.reject_badge_application(uuid, text, text, text)
  to app_authenticator;
grant execute on function app_private.consume_api_rate_limit(text, text, integer, integer)
  to app_authenticator;
grant execute on function app_private.search_content(text, integer, text),
  app_private.moderate_content(text, uuid, public.moderation_action_type, text, text, text),
  app_private.list_reports(integer, text),
  app_private.resolve_report(uuid, text, text, text),
  app_private.disable_service_account(uuid, text, text, text),
  app_private.reconcile_auth_provider_links_all(text)
  to app_authenticator;

-- 금지의 명시적 집행: DDL/임의 role/비허용 schema 차단은 role 속성(NOSUPERUSER 기본, no CREATEDB/CREATEROLE)
-- + 아래 revoke로 보장. Gate 1-E 테스트가 이 금지를 실제로 검증한다.
revoke all on schema information_schema from app_authenticator;
alter role app_authenticator set search_path = public, extensions;

-- ── outbox cron 전용 DB LOGIN role (§3.5, §9.2) ─────────────────────
-- claim/ack/fail 외에는 어떤 앱 테이블이나 관리자 command도 호출할 수 없다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'outbox_worker') then
    -- 로컬/CI 전용 비밀번호. 실제 프로젝트는 Secret Manager에서 회전(OUTBOX_DATABASE_URL).
    create role outbox_worker nologin noinherit;
  end if;
end
$$;

revoke all on all tables in schema public from outbox_worker;
revoke all on schema app_private from outbox_worker;
revoke all on all functions in schema app_private from outbox_worker;
grant usage on schema app_private to outbox_worker;
grant execute on function app_private.claim_outbox_batch(text, integer, interval, text[]),
  app_private.ack_outbox(uuid, text),
  app_private.fail_outbox(uuid, text, text)
  to outbox_worker;
-- AI 지연 답변 스케줄 store + consumer 팬아웃 멱등 + post 스냅샷 조회(PROD-535 게이트 Q, schemas/46).
-- 워커가 소유 모듈 handler를 조립·구동하는 데 필요한 함수만 정확히 허용한다(claim/ack/fail 외 추가).
grant execute on function app_private.schedule_ai_answer(uuid, jsonb, timestamptz),
  app_private.cancel_ai_answer(uuid),
  app_private.claim_due_ai_answers(integer, interval),
  app_private.delete_ai_answers(uuid[]),
  app_private.fetch_post_snapshot(uuid),
  app_private.is_event_consumed(text, uuid),
  app_private.mark_event_consumed(text, uuid)
  to outbox_worker;
alter role outbox_worker set search_path = public, extensions;
