-- 37_membership_commands.sql — Gate 2 인증/회원 transactional commands
-- 모든 함수는 Data API에서 호출 가능하되, 검증된 JWT subject·최신 DB 권한·상태를 함수 내부에서 다시 확인한다.
-- 감사로그/outbox/도메인 변경은 함수 한 트랜잭션에 묶인다.

create or replace function app_private.current_claims()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function app_private.has_current_required_consents(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_required as (
    select distinct on (d.kind) d.id
    from public.consent_documents d
    where d.is_required
      and d.published_at <= now()
      and (d.retired_at is null or d.retired_at > now())
    order by d.kind, d.version desc
  )
  select not exists (
    select 1 from current_required d
    where not exists (
      select 1 from public.user_consents c
      where c.user_id = p_user_id and c.document_id = d.id
    )
  );
$$;

create or replace function app_private.has_recent_totp(
  p_max_age interval default interval '10 minutes',
  p_clock_skew interval default interval '60 seconds'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select app_private.current_claims() value
  ), latest_totp as (
    select max((entry ->> 'timestamp')::bigint) as verified_at
    from claims,
      jsonb_array_elements(
        case when jsonb_typeof(value -> 'amr') = 'array'
             then value -> 'amr' else '[]'::jsonb end
      ) entry
    where entry ->> 'method' = 'totp'
      and (entry ->> 'timestamp') ~ '^[0-9]+$'
  )
  select coalesce(
    (select value ->> 'aal' from claims) = 'aal2'
    and verified_at is not null
    and to_timestamp(verified_at) >= now() - p_max_age - p_clock_skew
    and to_timestamp(verified_at) <= now() + p_clock_skew,
    false
  )
  from latest_totp;
$$;

create or replace function app_private.current_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select app_private.current_claims() value
  )
  select exists (
    select 1
    from claims c
    join auth.sessions s
      on s.id = case
        when (c.value ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (c.value ->> 'session_id')::uuid
        else null
      end
    where s.user_id = app_private.current_user_id()
      and (s.not_after is null or s.not_after > now())
  );
$$;

-- OAuth callback과 주기적 reconciliation은 같은 멱등 snapshot 규칙을 사용한다.
create or replace function public.sync_current_auth_provider_links(p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id(); v_identity record; v_created integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  for v_identity in
    select i.provider, i.provider_id, i.identity_data from auth.identities i where i.user_id = v_user_id
  loop
    if not exists (select 1 from public.auth_provider_links l
      where l.provider = v_identity.provider and l.provider_subject = v_identity.provider_id) then
      insert into public.auth_provider_links (user_id, provider, provider_subject, email_snapshot)
      values (v_user_id, v_identity.provider, v_identity.provider_id,
        nullif(v_identity.identity_data ->> 'email', ''));
      v_created := v_created + 1;
      insert into public.outbox_events (type, trace_id, actor, subject, data)
      values ('identity.provider.linked.v1', p_trace_id,
        jsonb_build_object('type', 'user', 'id', v_user_id),
        jsonb_build_object('type', 'profile', 'id', v_user_id),
        jsonb_build_object('provider', v_identity.provider));
    else
      update public.auth_provider_links set user_id = v_user_id,
        email_snapshot = nullif(v_identity.identity_data ->> 'email', ''), last_seen_at = now()
      where provider = v_identity.provider and provider_subject = v_identity.provider_id;
    end if;
  end loop;
  return jsonb_build_object('created', v_created);
end;
$$;

create or replace function app_private.reconcile_auth_provider_links_all(p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_identity record; v_created integer := 0; v_seen integer := 0;
begin
  for v_identity in select i.user_id, i.provider, i.provider_id, i.identity_data from auth.identities i
  loop
    v_seen := v_seen + 1;
    if not exists (select 1 from public.auth_provider_links l
      where l.provider = v_identity.provider and l.provider_subject = v_identity.provider_id) then
      insert into public.auth_provider_links (user_id, provider, provider_subject, email_snapshot)
      values (v_identity.user_id, v_identity.provider, v_identity.provider_id,
        nullif(v_identity.identity_data ->> 'email', ''));
      v_created := v_created + 1;
      insert into public.outbox_events (type, trace_id, actor, subject, data)
      values ('identity.provider.linked.v1', p_trace_id, jsonb_build_object('type', 'system'),
        jsonb_build_object('type', 'profile', 'id', v_identity.user_id),
        jsonb_build_object('provider', v_identity.provider, 'source', 'reconciliation'));
    else
      update public.auth_provider_links set user_id = v_identity.user_id,
        email_snapshot = nullif(v_identity.identity_data ->> 'email', ''), last_seen_at = now()
      where provider = v_identity.provider and provider_subject = v_identity.provider_id;
    end if;
  end loop;
  insert into public.audit_events
    (trace_id, actor_type, action, resource_type, outcome, after_redacted)
  values (p_trace_id, 'system', 'identity.provider.reconcile', 'auth_provider_link',
    'success', jsonb_build_object('seen', v_seen, 'created', v_created));
  return jsonb_build_object('seen', v_seen, 'created', v_created);
end;
$$;

revoke all on function public.sync_current_auth_provider_links(text) from public;
grant execute on function public.sync_current_auth_provider_links(text) to authenticated;
revoke all on function app_private.reconcile_auth_provider_links_all(text) from public, anon, authenticated;

create or replace function public.complete_member_onboarding(
  p_handle text,
  p_display_name text,
  p_consent_document_ids uuid[],
  p_trace_id text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_before public.account_status;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'email verification required';
  end if;
  if length(trim(p_handle)) < 3 or p_handle !~ '^[A-Za-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'invalid handle';
  end if;
  if length(trim(p_display_name)) < 1 then
    raise exception using errcode = '22023', message = 'display name required';
  end if;

  select account_status into v_before
  from public.profiles where user_id = v_user_id for update;
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;
  if v_before in ('suspended', 'withdrawn') then
    raise exception using errcode = '42501', message = 'account cannot be activated';
  end if;

  insert into public.user_consents (user_id, document_id, evidence)
  select v_user_id, d.id, jsonb_build_object('source', 'onboarding')
  from public.consent_documents d
  where d.id = any(coalesce(p_consent_document_ids, '{}'::uuid[]))
    and d.published_at <= now()
    and (d.retired_at is null or d.retired_at > now())
  on conflict (user_id, document_id) do nothing;

  if not app_private.has_current_required_consents(v_user_id) then
    raise exception using errcode = '23514', message = 'latest required consent is missing';
  end if;

  update public.profiles
  set handle = lower(trim(p_handle)),
      display_name = trim(p_display_name),
      account_status = 'active',
      updated_at = now()
  where user_id = v_user_id
  returning * into v_profile;

  if v_before <> 'active' then
    insert into public.account_state_events
      (user_id, from_status, to_status, reason_code, actor_id)
    values (v_user_id, v_before, 'active', 'onboarding.completed', v_user_id);

    insert into public.audit_events
      (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted)
    values
      (p_trace_id, 'user', v_user_id, 'member.onboarding.complete', 'profile', v_user_id,
       'success', jsonb_build_object('accountStatus', 'active'));

    insert into public.outbox_events (type, trace_id, actor, subject, data)
    values (
      'identity.user.registered.v1', p_trace_id,
      jsonb_build_object('type', 'user', 'id', v_user_id),
      jsonb_build_object('type', 'profile', 'id', v_user_id),
      jsonb_build_object('accountStatus', 'active')
    );
  end if;
  return v_profile;
end;
$$;

create or replace function public.submit_grade_application(
  p_application_id uuid,
  p_grade_id uuid,
  p_form_data jsonb,
  p_evidence jsonb,
  p_idempotency_key text,
  p_trace_id text default null
)
returns public.grade_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_grade public.membership_grades;
  v_application public.grade_applications;
  v_evidence jsonb;
  v_path text;
begin
  if v_user_id is null or not app_private.current_account_active() then
    raise exception using errcode = '42501', message = 'active account required';
  end if;
  if not app_private.has_current_required_consents(v_user_id) then
    raise exception using errcode = '42501', message = 'latest required consent is missing';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  select * into v_application
  from public.grade_applications
  where user_id = v_user_id and submit_idempotency_key = p_idempotency_key;
  if found then
    return v_application;
  end if;

  select * into v_grade from public.membership_grades
  where id = p_grade_id and is_active for share;
  if not found then
    raise exception using errcode = '22023', message = 'active grade not found';
  end if;

  if jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) = 0
     and jsonb_array_length(v_grade.required_evidence) > 0 then
    raise exception using errcode = '23514', message = 'evidence required';
  end if;

  insert into public.grade_applications
    (id, user_id, grade_id, grade_config_version, status, form_data,
     submit_idempotency_key, submitted_at)
  values
    (p_application_id, v_user_id, v_grade.id, v_grade.version, 'submitted',
     coalesce(p_form_data, '{}'::jsonb), p_idempotency_key, now())
  returning * into v_application;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_path := v_evidence ->> 'objectPath';
    if v_path is null
       or split_part(v_path, '/', 1) <> v_user_id::text
       or split_part(v_path, '/', 2) <> p_application_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'grade-evidence'
           and o.name = v_path
           and o.owner_id = v_user_id::text
       ) then
      raise exception using errcode = '42501', message = 'invalid evidence ownership';
    end if;

    insert into public.grade_application_documents
      (application_id, owner_id, bucket_id, object_path, original_name, mime_type, size_bytes)
    values
      (p_application_id, v_user_id, 'grade-evidence', v_path,
       coalesce(nullif(v_evidence ->> 'originalName', ''), 'evidence'),
       v_evidence ->> 'mimeType', (v_evidence ->> 'sizeBytes')::bigint);
  end loop;

  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, 'user', v_user_id, 'grade.application.submit',
          'grade_application', p_application_id, 'success');

  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'identity.grade.application.submitted.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'grade_application', 'id', p_application_id),
    jsonb_build_object('gradeId', v_grade.id, 'gradeConfigVersion', v_grade.version)
  );
  return v_application;
end;
$$;

create or replace function app_private.approve_grade_application(
  p_application_id uuid,
  p_idempotency_key text,
  p_review_note text default null,
  p_trace_id text default null
)
returns public.grade_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_application public.grade_applications;
begin
  if v_actor_id is null
     or not app_private.current_account_active()
     or not app_private.has_permission('grade.approve') then
    raise exception using errcode = '42501', message = 'grade approval permission required';
  end if;
  if not app_private.has_recent_totp() then
    raise exception using errcode = '42501', message = 'recent TOTP step-up required';
  end if;
  if not app_private.current_session_active() then
    raise exception using errcode = '42501', message = 'active auth session required';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  select * into v_application from public.grade_applications
  where id = p_application_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'grade application not found';
  end if;
  if v_application.status = 'approved'
     and v_application.review_idempotency_key = p_idempotency_key then
    return v_application;
  end if;
  if v_application.status not in ('submitted', 'under_review') then
    raise exception using errcode = '23514', message = 'grade application is not approvable';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_application.user_id and p.account_status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'target member is not active';
  end if;

  update public.user_membership_grades
  set revoked_at = now(), revoked_by = v_actor_id
  where user_id = v_application.user_id and revoked_at is null;

  insert into public.user_membership_grades
    (user_id, grade_id, application_id, granted_by)
  values
    (v_application.user_id, v_application.grade_id, v_application.id, v_actor_id);

  update public.grade_applications
  set status = 'approved', reviewed_at = now(), reviewed_by = v_actor_id,
      review_note = nullif(trim(p_review_note), ''),
      review_idempotency_key = p_idempotency_key, updated_at = now()
  where id = p_application_id
  returning * into v_application;

  insert into public.audit_events
    (trace_id, actor_type, actor_id, actor_role_snapshot, action, resource_type,
     resource_id, outcome, after_redacted, tool_id, tool_version)
  values
    (p_trace_id, 'user', v_actor_id, 'grade.approve', 'grade.application.approve',
     'grade_application', p_application_id, 'success',
     jsonb_build_object('status', 'approved', 'gradeId', v_application.grade_id),
     'grade.application.approve', 1);

  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'identity.grade.application.approved.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', 'grade_application', 'id', p_application_id),
    jsonb_build_object('userId', v_application.user_id, 'gradeId', v_application.grade_id)
  );
  return v_application;
end;
$$;

create or replace function public.submit_badge_application(
  p_application_id uuid,
  p_badge_id uuid,
  p_form_data jsonb,
  p_evidence jsonb,
  p_idempotency_key text,
  p_trace_id text default null
)
returns public.badge_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_badge public.membership_badges;
  v_application public.badge_applications;
  v_evidence jsonb;
  v_path text;
begin
  if v_user_id is null or not app_private.current_account_active() then
    raise exception using errcode = '42501', message = 'active account required';
  end if;
  if not app_private.has_current_required_consents(v_user_id) then
    raise exception using errcode = '42501', message = 'latest required consent is missing';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  select * into v_application from public.badge_applications
  where user_id = v_user_id and submit_idempotency_key = p_idempotency_key;
  if found then
    return v_application;
  end if;

  select * into v_badge from public.membership_badges
  where id = p_badge_id and is_active for share;
  if not found then
    raise exception using errcode = '22023', message = 'active badge not found';
  end if;
  if jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) = 0
     and jsonb_array_length(v_badge.required_evidence) > 0 then
    raise exception using errcode = '23514', message = 'evidence required';
  end if;

  insert into public.badge_applications
    (id, user_id, badge_id, badge_config_version, status, form_data,
     submit_idempotency_key, submitted_at)
  values
    (p_application_id, v_user_id, v_badge.id, v_badge.version, 'submitted',
     coalesce(p_form_data, '{}'::jsonb), p_idempotency_key, now())
  returning * into v_application;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_path := v_evidence ->> 'objectPath';
    if v_path is null
       or split_part(v_path, '/', 1) <> v_user_id::text
       or split_part(v_path, '/', 2) <> p_application_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'badge-evidence'
           and o.name = v_path
           and o.owner_id = v_user_id::text
       ) then
      raise exception using errcode = '42501', message = 'invalid evidence ownership';
    end if;
    insert into public.badge_application_documents
      (application_id, owner_id, bucket_id, object_path, original_name, mime_type, size_bytes)
    values
      (p_application_id, v_user_id, 'badge-evidence', v_path,
       coalesce(nullif(v_evidence ->> 'originalName', ''), 'evidence'),
       v_evidence ->> 'mimeType', (v_evidence ->> 'sizeBytes')::bigint);
  end loop;

  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, 'user', v_user_id, 'badge.application.submit',
          'badge_application', p_application_id, 'success');
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'identity.badge.application.submitted.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'badge_application', 'id', p_application_id),
    jsonb_build_object('badgeId', v_badge.id, 'badgeConfigVersion', v_badge.version)
  );
  return v_application;
end;
$$;

create or replace function public.withdraw_current_user(
  p_confirmation text,
  p_trace_id text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_before public.account_status;
  v_profile public.profiles;
begin
  if v_user_id is null or p_confirmation <> 'WITHDRAW' then
    raise exception using errcode = '42501', message = 'withdrawal confirmation required';
  end if;
  select account_status into v_before from public.profiles
  where user_id = v_user_id for update;
  if v_before = 'withdrawn' then
    select * into v_profile from public.profiles where user_id = v_user_id;
    return v_profile;
  end if;

  update public.profiles
  set account_status = 'withdrawn', display_name = '탈퇴한 사용자', handle = null, updated_at = now()
  where user_id = v_user_id returning * into v_profile;
  insert into public.account_state_events
    (user_id, from_status, to_status, reason_code, actor_id)
  values (v_user_id, v_before, 'withdrawn', 'member.self_withdraw', v_user_id);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, 'user', v_user_id, 'member.withdraw', 'profile', v_user_id, 'success');
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'identity.user.withdrawn.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'profile', 'id', v_user_id), '{}'::jsonb
  );
  -- refresh token은 즉시 철회한다. 이미 발급된 access JWT는 account_status RLS가 차단한다.
  delete from auth.sessions where user_id = v_user_id;
  return v_profile;
end;
$$;

revoke all on function app_private.current_claims() from public;
revoke all on function app_private.has_current_required_consents(uuid) from public;
revoke all on function app_private.has_recent_totp(interval, interval) from public;
revoke all on function app_private.current_session_active() from public;
grant execute on function app_private.current_claims() to authenticated;
grant execute on function app_private.has_current_required_consents(uuid) to authenticated;
grant execute on function app_private.has_recent_totp(interval, interval) to authenticated;

revoke all on function public.complete_member_onboarding(text, text, uuid[], text) from public;
revoke all on function public.submit_grade_application(uuid, uuid, jsonb, jsonb, text, text) from public;
revoke all on function public.submit_badge_application(uuid, uuid, jsonb, jsonb, text, text) from public;
revoke all on function app_private.approve_grade_application(uuid, text, text, text) from public;
revoke all on function public.withdraw_current_user(text, text) from public;
grant execute on function public.complete_member_onboarding(text, text, uuid[], text) to authenticated;
grant execute on function public.submit_grade_application(uuid, uuid, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.submit_badge_application(uuid, uuid, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.withdraw_current_user(text, text) to authenticated;
