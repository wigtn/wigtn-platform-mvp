-- 38_admin_tools.sql — Gate 3 공통 관리자 툴의 DB adapter
-- 앱의 공통 레지스트리 실행기가 검증된 claims를 전달하고, 이 함수들이 최신 DB 권한과
-- 도메인 변경·감사·outbox 원자성을 최종 강제한다. Data API에는 노출하지 않는다.

create table app_private.admin_command_receipts (
  actor_id        uuid not null references auth.users (id) on delete cascade,
  tool_name       text not null,
  idempotency_key text not null,
  resource_id     uuid not null,
  response        jsonb not null,
  created_at      timestamptz not null default now(),
  primary key (actor_id, tool_name, idempotency_key)
);

create or replace function app_private.assert_admin_tool_access(
  p_permission text,
  p_require_step_up boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_private.current_user_id() is null
     or not app_private.current_account_active()
     or not app_private.has_permission(p_permission) then
    raise exception using errcode = '42501', message = 'admin tool permission required';
  end if;
  if p_require_step_up and not app_private.has_recent_totp() then
    raise exception using errcode = '42501', message = 'recent TOTP step-up required';
  end if;
  if p_require_step_up and not app_private.current_session_active() then
    raise exception using errcode = '42501', message = 'active auth session required';
  end if;
end;
$$;

create or replace function app_private.current_admin_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'actorId', app_private.current_user_id(),
    'accountActive', app_private.current_account_active(),
    'activeSession', app_private.current_session_active(),
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission_key order by rp.permission_key)
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = app_private.current_user_id()
    ), '[]'::jsonb)
  );
$$;

create or replace function app_private.search_members(
  p_query text default '',
  p_limit integer default 50,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('member.read', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select p.user_id as id, p.handle, p.display_name as "displayName",
           p.account_status as "accountStatus", u.email, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where trim(coalesce(p_query, '')) = ''
       or p.handle ilike '%' || trim(p_query) || '%'
       or p.display_name ilike '%' || trim(p_query) || '%'
       or u.email ilike '%' || trim(p_query) || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;

  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome,
     after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'member.search', 'profile_query', 'success',
     jsonb_build_object('resultCount', jsonb_array_length(v_rows)), 'member.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.list_grade_applications(
  p_limit integer default 50,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('grade.approve', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data."submittedAt"), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.user_id as "userId", p.display_name as "displayName",
           a.grade_id as "gradeId", g.title as "gradeTitle", a.status,
           a.form_data as "formData", a.submitted_at as "submittedAt",
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'objectPath', d.object_path,
               'originalName', d.original_name
             ) order by d.created_at)
             from public.grade_application_documents d
             where d.application_id = a.id
           ), '[]'::jsonb) as evidence
    from public.grade_applications a
    join public.profiles p on p.user_id = a.user_id
    join public.membership_grades g on g.id = a.grade_id
    where a.status in ('submitted', 'under_review')
    order by a.submitted_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome,
     after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'grade.application.search', 'grade_application_query',
     'success', jsonb_build_object('resultCount', jsonb_array_length(v_rows)),
     'grade.application.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.list_badge_applications(
  p_limit integer default 50,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('badge.approve', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data."submittedAt"), '[]'::jsonb)
  into v_rows
  from (
    select a.id, a.user_id as "userId", p.display_name as "displayName",
           a.badge_id as "badgeId", b.title as "badgeTitle", a.status,
           a.form_data as "formData", a.submitted_at as "submittedAt",
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'objectPath', d.object_path,
               'originalName', d.original_name
             ) order by d.created_at)
             from public.badge_application_documents d
             where d.application_id = a.id
           ), '[]'::jsonb) as evidence
    from public.badge_applications a
    join public.profiles p on p.user_id = a.user_id
    join public.membership_badges b on b.id = a.badge_id
    where a.status in ('submitted', 'under_review')
    order by a.submitted_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome,
     after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'badge.application.search', 'badge_application_query',
     'success', jsonb_build_object('resultCount', jsonb_array_length(v_rows)),
     'badge.application.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.list_active_badges(
  p_limit integer default 50,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('badge.revoke', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data."grantedAt" desc), '[]'::jsonb)
  into v_rows
  from (
    select ub.id, ub.user_id as "userId", p.display_name as "displayName",
           ub.badge_id as "badgeId", b.title as "badgeTitle", ub.granted_at as "grantedAt"
    from public.user_badges ub
    join public.profiles p on p.user_id = ub.user_id
    join public.membership_badges b on b.id = ub.badge_id
    where ub.revoked_at is null
    order by ub.granted_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome,
     after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'badge.active.search', 'user_badge_query',
     'success', jsonb_build_object('resultCount', jsonb_array_length(v_rows)),
     'badge.active.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.outbox_progress(p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_result jsonb;
begin
  perform app_private.assert_admin_tool_access('audit.read', false);
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'claimed', count(*) filter (where status = 'claimed'),
    'done', count(*) filter (where status = 'done'),
    'dead', count(*) filter (where status = 'dead')
  ) into v_result from public.outbox_events;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome,
     after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'operations.outbox.progress', 'outbox_query',
     'success', v_result, 'operations.outbox.progress', 1);
  return v_result;
end;
$$;

create or replace function app_private.suspend_member(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_before public.account_status;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('member.suspend', true);
  if p_user_id = v_actor_id then
    raise exception using errcode = '23514', message = 'self suspension is not allowed';
  end if;
  if length(trim(p_reason)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'reason and idempotency key are required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'member.suspend'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.resource_id <> p_user_id then
      raise exception using errcode = '23505', message = 'idempotency key resource mismatch';
    end if;
    return v_receipt.response;
  end if;

  select account_status into v_before from public.profiles
  where user_id = p_user_id for update;
  if not found or v_before = 'withdrawn' then
    raise exception using errcode = '23514', message = 'member cannot be suspended';
  end if;
  if v_before <> 'suspended' then
    update public.profiles set account_status = 'suspended', updated_at = now()
    where user_id = p_user_id;
    insert into public.account_state_events
      (user_id, from_status, to_status, reason_code, operator_note, actor_id)
    values (p_user_id, v_before, 'suspended', 'member.admin_suspend', trim(p_reason), v_actor_id);
    update auth.users set banned_until = now() + interval '100 years', updated_at = now()
    where id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
    insert into public.audit_events
      (trace_id, actor_type, actor_id, actor_role_snapshot, action, resource_type,
       resource_id, outcome, before_redacted, after_redacted, tool_id, tool_version)
    values
      (p_trace_id, 'user', v_actor_id, 'member.suspend', 'member.suspend', 'profile',
       p_user_id, 'success', jsonb_build_object('accountStatus', v_before),
       jsonb_build_object('accountStatus', 'suspended'), 'member.suspend', 1);
    insert into public.outbox_events (type, trace_id, actor, subject, data)
    values (
      'identity.user.suspended.v1', p_trace_id,
      jsonb_build_object('type', 'user', 'id', v_actor_id),
      jsonb_build_object('type', 'profile', 'id', p_user_id),
      jsonb_build_object('reasonCode', 'member.admin_suspend')
    );
  end if;
  v_response := jsonb_build_object('userId', p_user_id, 'accountStatus', 'suspended');
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'member.suspend', p_idempotency_key, p_user_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.approve_badge_application(
  p_application_id uuid,
  p_review_note text,
  p_idempotency_key text,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_application public.badge_applications;
  v_badge_id uuid;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('badge.approve', true);
  if length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'idempotency key required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'badge.application.approve'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.resource_id <> p_application_id then
      raise exception using errcode = '23505', message = 'idempotency key resource mismatch';
    end if;
    return v_receipt.response;
  end if;
  select * into v_application from public.badge_applications
  where id = p_application_id for update;
  if not found or v_application.status not in ('submitted', 'under_review') then
    raise exception using errcode = '23514', message = 'badge application is not approvable';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_application.user_id and p.account_status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'target member is not active';
  end if;
  insert into public.user_badges
    (user_id, badge_id, application_id, granted_by)
  values
    (v_application.user_id, v_application.badge_id, v_application.id, v_actor_id)
  returning id into v_badge_id;
  update public.badge_applications
  set status = 'approved', reviewed_at = now(), reviewed_by = v_actor_id,
      review_note = nullif(trim(p_review_note), ''),
      review_idempotency_key = p_idempotency_key, updated_at = now()
  where id = p_application_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, actor_role_snapshot, action, resource_type,
     resource_id, outcome, after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'badge.approve', 'badge.application.approve',
     'badge_application', p_application_id, 'success',
     jsonb_build_object('status', 'approved', 'userBadgeId', v_badge_id),
     'badge.application.approve', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'identity.badge.application.approved.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'badge_application', 'id', p_application_id),
    jsonb_build_object('userId', v_application.user_id, 'badgeId', v_application.badge_id,
                       'userBadgeId', v_badge_id)
  );
  v_response := jsonb_build_object('applicationId', p_application_id,
                                   'userBadgeId', v_badge_id, 'status', 'approved');
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'badge.application.approve', p_idempotency_key,
          p_application_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.revoke_user_badge(
  p_user_badge_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_badge public.user_badges;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('badge.revoke', true);
  if length(trim(p_reason)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'reason and idempotency key are required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'badge.revoke'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.resource_id <> p_user_badge_id then
      raise exception using errcode = '23505', message = 'idempotency key resource mismatch';
    end if;
    return v_receipt.response;
  end if;
  select * into v_badge from public.user_badges where id = p_user_badge_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'user badge not found';
  end if;
  if v_badge.revoked_at is null then
    update public.user_badges
    set revoked_at = now(), revoked_by = v_actor_id, revoke_reason = trim(p_reason),
        revoke_idempotency_key = p_idempotency_key
    where id = p_user_badge_id;
    insert into public.audit_events
      (trace_id, actor_type, actor_id, actor_role_snapshot, action, resource_type,
       resource_id, outcome, before_redacted, after_redacted, tool_id, tool_version)
    values
      (p_trace_id, 'user', v_actor_id, 'badge.revoke', 'badge.revoke', 'user_badge',
       p_user_badge_id, 'success', jsonb_build_object('status', 'active'),
       jsonb_build_object('status', 'revoked'), 'badge.revoke', 1);
    insert into public.outbox_events (type, trace_id, actor, subject, data)
    values (
      'identity.badge.revoked.v1', p_trace_id,
      jsonb_build_object('type', 'user', 'id', v_actor_id),
      jsonb_build_object('type', 'user_badge', 'id', p_user_badge_id),
      jsonb_build_object('userId', v_badge.user_id, 'badgeId', v_badge.badge_id)
    );
  end if;
  v_response := jsonb_build_object('userBadgeId', p_user_badge_id, 'status', 'revoked');
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'badge.revoke', p_idempotency_key, p_user_badge_id, v_response);
  return v_response;
end;
$$;

revoke all on table app_private.admin_command_receipts from public;
revoke all on function app_private.assert_admin_tool_access(text, boolean) from public;
revoke all on function app_private.current_admin_context() from public;
revoke all on function app_private.search_members(text, integer, text) from public;
revoke all on function app_private.list_grade_applications(integer, text) from public;
revoke all on function app_private.list_badge_applications(integer, text) from public;
revoke all on function app_private.list_active_badges(integer, text) from public;
revoke all on function app_private.outbox_progress(text) from public;
revoke all on function app_private.suspend_member(uuid, text, text, text) from public;
revoke all on function app_private.approve_badge_application(uuid, text, text, text) from public;
revoke all on function app_private.revoke_user_badge(uuid, text, text, text) from public;

create or replace function app_private.unsuspend_member(
  p_user_id uuid, p_reason text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := app_private.current_user_id(); v_response jsonb;
  v_receipt app_private.admin_command_receipts; v_before public.account_status;
begin
  perform app_private.assert_admin_tool_access('member.suspend', true);
  if p_user_id = v_actor_id or length(trim(p_reason)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid member unsuspend input';
  end if;
  select * into v_receipt from app_private.admin_command_receipts where actor_id = v_actor_id
    and tool_name = 'member.unsuspend' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select account_status into v_before from public.profiles where user_id = p_user_id for update;
  if not found or v_before <> 'suspended' then
    raise exception using errcode = '23514', message = 'member is not suspended';
  end if;
  update public.profiles set account_status = 'active', updated_at = now() where user_id = p_user_id;
  update auth.users set banned_until = null, updated_at = now() where id = p_user_id;
  insert into public.account_state_events
    (user_id, from_status, to_status, reason_code, operator_note, actor_id)
  values (p_user_id, v_before, 'active', 'member.admin_unsuspend', trim(p_reason), v_actor_id);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'member.unsuspend', 'profile', p_user_id, 'success',
    jsonb_build_object('accountStatus', v_before), jsonb_build_object('accountStatus', 'active'),
    'member.unsuspend', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('identity.user.unsuspended.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'profile', 'id', p_user_id),
    jsonb_build_object('reason', trim(p_reason)));
  v_response := jsonb_build_object('userId', p_user_id, 'accountStatus', 'active');
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'member.unsuspend', p_idempotency_key, p_user_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.withdraw_member(
  p_user_id uuid, p_reason text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := app_private.current_user_id(); v_response jsonb;
  v_receipt app_private.admin_command_receipts; v_before public.account_status;
begin
  perform app_private.assert_admin_tool_access('member.manage', true);
  if p_user_id = v_actor_id or length(trim(p_reason)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid member withdrawal input';
  end if;
  select * into v_receipt from app_private.admin_command_receipts where actor_id = v_actor_id
    and tool_name = 'member.withdraw' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select account_status into v_before from public.profiles where user_id = p_user_id for update;
  if not found or v_before = 'withdrawn' then
    raise exception using errcode = '23514', message = 'member cannot be withdrawn';
  end if;
  delete from auth.sessions where user_id = p_user_id;
  update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = p_user_id;
  update public.profiles set account_status = 'withdrawn', updated_at = now() where user_id = p_user_id;
  insert into public.account_state_events
    (user_id, from_status, to_status, reason_code, operator_note, actor_id)
  values (p_user_id, v_before, 'withdrawn', 'member.admin_withdraw', trim(p_reason), v_actor_id);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'member.withdraw', 'profile', p_user_id, 'success',
    jsonb_build_object('accountStatus', v_before), jsonb_build_object('accountStatus', 'withdrawn'),
    'member.withdraw', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('identity.user.withdrawn.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'profile', 'id', p_user_id),
    jsonb_build_object('reason', trim(p_reason), 'source', 'admin'));
  v_response := jsonb_build_object('userId', p_user_id, 'accountStatus', 'withdrawn');
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'member.withdraw', p_idempotency_key, p_user_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.set_member_role(
  p_user_id uuid, p_role_key text, p_action text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := app_private.current_user_id(); v_role_id uuid; v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('role.manage', true);
  if p_user_id = v_actor_id or p_action not in ('grant', 'revoke')
     or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid role change input';
  end if;
  select id into v_role_id from public.system_roles where key = p_role_key;
  if not found then raise exception using errcode = 'P0002', message = 'role not found'; end if;
  select * into v_receipt from app_private.admin_command_receipts where actor_id = v_actor_id
    and tool_name = 'member.role.set' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  if p_action = 'grant' then
    insert into public.user_roles (user_id, role_id, granted_by)
    values (p_user_id, v_role_id, v_actor_id) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role_id = v_role_id;
  end if;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'member.role.set', 'user_role', p_user_id, 'success',
    jsonb_build_object('roleKey', p_role_key, 'action', p_action), 'member.role.set', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('identity.role.changed.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'profile', 'id', p_user_id),
    jsonb_build_object('roleKey', p_role_key, 'action', p_action));
  v_response := jsonb_build_object('userId', p_user_id, 'roleKey', p_role_key, 'action', p_action);
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'member.role.set', p_idempotency_key, p_user_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.reject_grade_application(
  p_application_id uuid, p_review_note text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := app_private.current_user_id(); v_application public.grade_applications;
  v_response jsonb; v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('grade.approve', true);
  if length(trim(p_review_note)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'review note required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts where actor_id = v_actor_id
    and tool_name = 'grade.application.reject' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select * into v_application from public.grade_applications where id = p_application_id for update;
  if not found or v_application.status not in ('submitted', 'under_review') then
    raise exception using errcode = '23514', message = 'grade application is not rejectable';
  end if;
  update public.grade_applications set status = 'rejected', reviewed_at = now(), reviewed_by = v_actor_id,
    review_note = trim(p_review_note), review_idempotency_key = p_idempotency_key, updated_at = now()
  where id = p_application_id;
  insert into public.audit_events (trace_id, actor_type, actor_id, action, resource_type, resource_id,
    outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'grade.application.reject', 'grade_application', p_application_id,
    'success', jsonb_build_object('status', 'rejected'), 'grade.application.reject', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('identity.grade.application.rejected.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'grade_application', 'id', p_application_id),
    jsonb_build_object('userId', v_application.user_id));
  v_response := jsonb_build_object('applicationId', p_application_id, 'status', 'rejected');
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'grade.application.reject', p_idempotency_key, p_application_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.reject_badge_application(
  p_application_id uuid, p_review_note text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := app_private.current_user_id(); v_application public.badge_applications;
  v_response jsonb; v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('badge.approve', true);
  if length(trim(p_review_note)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'review note required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts where actor_id = v_actor_id
    and tool_name = 'badge.application.reject' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select * into v_application from public.badge_applications where id = p_application_id for update;
  if not found or v_application.status not in ('submitted', 'under_review') then
    raise exception using errcode = '23514', message = 'badge application is not rejectable';
  end if;
  update public.badge_applications set status = 'rejected', reviewed_at = now(), reviewed_by = v_actor_id,
    review_note = trim(p_review_note), review_idempotency_key = p_idempotency_key, updated_at = now()
  where id = p_application_id;
  insert into public.audit_events (trace_id, actor_type, actor_id, action, resource_type, resource_id,
    outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'badge.application.reject', 'badge_application', p_application_id,
    'success', jsonb_build_object('status', 'rejected'), 'badge.application.reject', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('identity.badge.application.rejected.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'badge_application', 'id', p_application_id),
    jsonb_build_object('userId', v_application.user_id));
  v_response := jsonb_build_object('applicationId', p_application_id, 'status', 'rejected');
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'badge.application.reject', p_idempotency_key, p_application_id, v_response);
  return v_response;
end;
$$;

revoke all on function app_private.unsuspend_member(uuid, text, text, text),
  app_private.withdraw_member(uuid, text, text, text),
  app_private.set_member_role(uuid, text, text, text, text),
  app_private.reject_grade_application(uuid, text, text, text),
  app_private.reject_badge_application(uuid, text, text, text)
from public, anon, authenticated;
