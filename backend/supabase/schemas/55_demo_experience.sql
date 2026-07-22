-- 55_demo_experience.sql — 로그인 화면 없는 입찰 데모용 격리 실행 계층.
-- 익명 Auth 사용자는 authenticated DB role을 사용하므로 실제 도메인 command를 열지 않는다.
-- 대신 방문자별 private action ledger에 체험 결과를 저장해 운영/다른 방문자 데이터를 오염시키지 않는다.

create table app_private.demo_experience_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  reset_count integer not null default 0 check (reset_count >= 0)
);

create table app_private.demo_experience_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_private.demo_experience_sessions(user_id) on delete cascade,
  action_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index demo_experience_actions_user_created_idx
  on app_private.demo_experience_actions(user_id, created_at desc);

create table app_private.demo_ai_requests (
  id uuid primary key,
  action_id uuid not null unique
    references app_private.demo_experience_actions(id) on delete cascade,
  user_id uuid not null
    references app_private.demo_experience_sessions(user_id) on delete cascade,
  title text not null check (char_length(trim(title)) between 8 and 160),
  body text not null check (char_length(trim(body)) between 20 and 5000),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'blocked', 'failed')),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  answer text,
  guardrail_reasons jsonb not null default '[]'::jsonb,
  model text,
  token_usage jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index demo_ai_requests_claim_idx
  on app_private.demo_ai_requests(status, available_at, created_at)
  where status in ('pending', 'processing');
create index demo_ai_requests_user_idx
  on app_private.demo_ai_requests(user_id, created_at desc);

revoke all on table app_private.demo_experience_sessions,
  app_private.demo_experience_actions,
  app_private.demo_ai_requests from public, anon, authenticated, app_authenticator;

create or replace function app_private.assert_anonymous_demo_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
begin
  if v_user_id is null or not exists (
    select 1 from auth.users u where u.id = v_user_id and u.is_anonymous is true
  ) then
    raise exception using errcode = '42501', message = 'anonymous demo session required';
  end if;
  return v_user_id;
end;
$$;

create or replace function app_private.bootstrap_demo_experience()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_session app_private.demo_experience_sessions;
begin
  insert into app_private.demo_experience_sessions(user_id)
  values (v_user_id)
  on conflict (user_id) do update
  set last_seen_at = now(),
      expires_at = greatest(app_private.demo_experience_sessions.expires_at, now() + interval '1 hour')
  returning * into v_session;

  update public.profiles
  set display_name = case when display_name = '' then '체험 영업인' else display_name end,
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'mode', 'isolated-demo',
    'userId', v_user_id,
    'expiresAt', v_session.expires_at,
    'writeMode', 'private-action-ledger',
    'realCommandAccess', false,
    'features', jsonb_build_array(
      'community.post.create', 'community.comment.create',
      'community.reaction.toggle', 'community.bookmark.toggle',
      'company.review.create', 'membership.grade.submit',
      'membership.badge.submit', 'ai.answer.request', 'ai.answer.poll',
      'admin.member.review', 'admin.company.import',
      'admin.content.moderate', 'admin.placement.publish'
    )
  );
end;
$$;

create or replace function app_private.execute_demo_action(
  p_action text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_existing jsonb;
  v_response jsonb;
  v_entity_id uuid := gen_random_uuid();
  v_action_id uuid := gen_random_uuid();
  v_ai_request app_private.demo_ai_requests;
  v_recent_count integer;
  v_ai_user_count integer;
  v_ai_global_count integer;
begin
  if p_action not in (
    'community.post.create', 'community.comment.create',
    'community.reaction.toggle', 'community.bookmark.toggle',
    'company.review.create', 'membership.grade.submit',
    'membership.badge.submit', 'ai.answer.request', 'ai.answer.poll',
    'admin.member.review', 'admin.company.import',
    'admin.content.moderate', 'admin.placement.publish'
  ) then
    raise exception using errcode = '22023', message = 'unsupported demo action';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 65536
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'invalid demo action input';
  end if;

  select response_payload into v_existing
  from app_private.demo_experience_actions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  update app_private.demo_experience_sessions
  set last_seen_at = now()
  where user_id = v_user_id and expires_at > now();
  if not found then
    raise exception using errcode = '42501', message = 'demo session expired or not bootstrapped';
  end if;

  select count(*) into v_recent_count
  from app_private.demo_experience_actions
  where user_id = v_user_id and created_at >= now() - interval '1 minute';
  if v_recent_count >= 60 then
    raise exception using errcode = 'P0001', message = 'demo action rate limit exceeded';
  end if;

  case p_action
    when 'community.post.create' then
      v_response := jsonb_build_object('id', v_entity_id, 'status', 'published',
        'scope', 'visitor-only', 'aiReply', 'available');
    when 'community.comment.create' then
      v_response := jsonb_build_object('id', v_entity_id, 'status', 'published',
        'scope', 'visitor-only');
    when 'community.reaction.toggle' then
      v_response := jsonb_build_object('targetId', p_payload->>'targetId',
        'active', coalesce((p_payload->>'active')::boolean, true));
    when 'community.bookmark.toggle' then
      v_response := jsonb_build_object('targetId', p_payload->>'targetId',
        'active', coalesce((p_payload->>'active')::boolean, true));
    when 'company.review.create' then
      v_response := jsonb_build_object('reviewId', v_entity_id, 'status', 'published',
        'anonymous', true, 'scope', 'visitor-only');
    when 'membership.grade.submit' then
      v_response := jsonb_build_object('applicationId', v_entity_id, 'status', 'submitted');
    when 'membership.badge.submit' then
      v_response := jsonb_build_object('applicationId', v_entity_id, 'status', 'submitted');
    when 'ai.answer.request' then
      if char_length(trim(coalesce(p_payload->>'title', ''))) not between 8 and 160
         or char_length(trim(coalesce(p_payload->>'body', ''))) not between 20 and 5000 then
        raise exception using errcode = '22023', message = 'invalid AI question';
      end if;
      select count(*) into v_ai_user_count
      from app_private.demo_ai_requests
      where user_id = v_user_id and created_at >= now() - interval '1 hour';
      select count(*) into v_ai_global_count
      from app_private.demo_ai_requests
      where created_at >= now() - interval '1 hour';
      if v_ai_user_count >= 3 or v_ai_global_count >= 30 then
        raise exception using errcode = 'P0001', message = 'demo AI request quota exceeded';
      end if;
      v_response := jsonb_build_object('requestId', v_entity_id, 'status', 'pending');
    when 'ai.answer.poll' then
      select * into v_ai_request
      from app_private.demo_ai_requests r
      where r.user_id = v_user_id
        and r.id::text = p_payload->>'requestId';
      if not found then
        raise exception using errcode = 'P0002', message = 'demo AI request not found';
      end if;
      v_response := case v_ai_request.status
        when 'ready' then jsonb_build_object(
          'requestId', v_ai_request.id,
          'status', 'ready',
          'answer', v_ai_request.answer,
          'model', v_ai_request.model
        )
        when 'blocked' then jsonb_build_object(
          'requestId', v_ai_request.id,
          'status', 'blocked',
          'reasons', v_ai_request.guardrail_reasons
        )
        when 'failed' then jsonb_build_object(
          'requestId', v_ai_request.id,
          'status', 'failed',
          'retryable', true
        )
        else jsonb_build_object(
          'requestId', v_ai_request.id,
          'status', 'pending'
        )
      end;
    when 'admin.member.review' then
      v_response := jsonb_build_object('applicationId', p_payload->>'applicationId',
        'status', coalesce(nullif(p_payload->>'decision', ''), 'approved'), 'simulated', true);
    when 'admin.company.import' then
      v_response := jsonb_build_object('jobId', v_entity_id, 'status', 'completed',
        'rowCount', coalesce((p_payload->>'rowCount')::integer, 3),
        'validCount', coalesce((p_payload->>'validCount')::integer, 3),
        'errorCount', coalesce((p_payload->>'errorCount')::integer, 0), 'simulated', true);
    when 'admin.content.moderate' then
      v_response := jsonb_build_object('targetId', p_payload->>'targetId',
        'status', coalesce(nullif(p_payload->>'status', ''), 'hidden'), 'simulated', true);
    when 'admin.placement.publish' then
      v_response := jsonb_build_object('placementId', coalesce(nullif(p_payload->>'placementId', ''), v_entity_id::text),
        'status', 'published', 'version', coalesce((p_payload->>'version')::integer, 1) + 1,
        'simulated', true);
  end case;

  v_response := v_response || jsonb_build_object('action', p_action, 'executedAt', now());
  insert into app_private.demo_experience_actions
    (id, user_id, action_key, request_payload, response_payload, idempotency_key)
  values (v_action_id, v_user_id, p_action, coalesce(p_payload, '{}'::jsonb), v_response, p_idempotency_key);
  if p_action = 'ai.answer.request' then
    insert into app_private.demo_ai_requests
      (id, action_id, user_id, title, body)
    values (
      v_entity_id,
      v_action_id,
      v_user_id,
      trim(p_payload->>'title'),
      trim(p_payload->>'body')
    );
  end if;
  return v_response;
end;
$$;

create or replace function app_private.get_demo_experience()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_session app_private.demo_experience_sessions;
  v_actions jsonb;
begin
  select * into v_session from app_private.demo_experience_sessions
  where user_id = v_user_id and expires_at > now();
  if not found then
    raise exception using errcode = '42501', message = 'demo session expired or not bootstrapped';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'action', action_key, 'request', request_payload,
    'response', response_payload, 'createdAt', created_at
  ) order by created_at desc), '[]'::jsonb) into v_actions
  from (select * from app_private.demo_experience_actions
        where user_id = v_user_id and action_key <> 'ai.answer.poll'
        order by created_at desc limit 100) recent;
  return jsonb_build_object('mode', 'isolated-demo', 'expiresAt', v_session.expires_at,
    'actions', v_actions);
end;
$$;

create or replace function app_private.claim_demo_ai_requests(
  p_limit integer default 25,
  p_lease_seconds integer default 45
)
returns table (
  request_id uuid,
  user_id uuid,
  title text,
  body text,
  attempt_count integer,
  enqueued_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select r.id
    from app_private.demo_ai_requests r
    where r.attempt_count < 3
      and r.available_at <= now()
      and (
        r.status = 'pending'
        or (r.status = 'processing' and r.lease_until < now())
      )
    order by r.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update app_private.demo_ai_requests r
    set status = 'processing',
        lease_until = now() + make_interval(secs => greatest(5, least(coalesce(p_lease_seconds, 45), 300))),
        attempt_count = r.attempt_count + 1,
        updated_at = now()
    from candidates c
    where r.id = c.id
    returning r.*
  )
  select c.id, c.user_id, c.title, c.body, c.attempt_count, c.created_at
  from claimed c;
$$;

create or replace function app_private.complete_demo_ai_request(
  p_request_id uuid,
  p_status text,
  p_answer text,
  p_guardrail_reasons jsonb,
  p_model text,
  p_token_usage jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('ready', 'blocked') then
    raise exception using errcode = '22023', message = 'invalid demo AI completion status';
  end if;
  update app_private.demo_ai_requests
  set status = p_status,
      answer = case when p_status = 'ready' then nullif(trim(p_answer), '') else null end,
      guardrail_reasons = coalesce(p_guardrail_reasons, '[]'::jsonb),
      model = nullif(trim(p_model), ''),
      token_usage = coalesce(p_token_usage, '{}'::jsonb),
      lease_until = null,
      error_code = null,
      updated_at = now(),
      completed_at = now()
  where id = p_request_id and status = 'processing';
  return found;
end;
$$;

create or replace function app_private.fail_demo_ai_request(
  p_request_id uuid,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update app_private.demo_ai_requests
  set status = case when attempt_count >= 3 then 'failed' else 'pending' end,
      available_at = case
        when attempt_count >= 3 then available_at
        else now() + make_interval(secs => least(30, power(2, attempt_count))::integer)
      end,
      lease_until = null,
      error_code = left(coalesce(nullif(trim(p_error_code), ''), 'provider_error'), 80),
      updated_at = now(),
      completed_at = case when attempt_count >= 3 then now() else null end
  where id = p_request_id and status = 'processing'
  returning status into v_status;
  return v_status;
end;
$$;

create or replace function app_private.reset_demo_experience()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_deleted integer;
begin
  delete from app_private.demo_experience_actions where user_id = v_user_id;
  get diagnostics v_deleted = row_count;
  update app_private.demo_experience_sessions
  set last_seen_at = now(), expires_at = now() + interval '24 hours', reset_count = reset_count + 1
  where user_id = v_user_id;
  return jsonb_build_object('mode', 'isolated-demo', 'deletedActions', v_deleted, 'reset', true);
end;
$$;

create or replace function public.bootstrap_demo_experience()
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.bootstrap_demo_experience();
$$;
create or replace function public.execute_demo_action(p_action text, p_payload jsonb, p_idempotency_key text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.execute_demo_action(p_action, p_payload, p_idempotency_key);
$$;
create or replace function public.get_demo_experience()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_demo_experience();
$$;
create or replace function public.reset_demo_experience()
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.reset_demo_experience();
$$;

revoke all on function app_private.assert_anonymous_demo_actor(),
  app_private.bootstrap_demo_experience(),
  app_private.execute_demo_action(text,jsonb,text),
  app_private.get_demo_experience(), app_private.reset_demo_experience(),
  app_private.claim_demo_ai_requests(integer,integer),
  app_private.complete_demo_ai_request(uuid,text,text,jsonb,text,jsonb),
  app_private.fail_demo_ai_request(uuid,text) from public;
revoke all on function public.bootstrap_demo_experience(),
  public.execute_demo_action(text,jsonb,text),
  public.get_demo_experience(), public.reset_demo_experience() from public;

grant usage on schema app_private to authenticated;
grant execute on function app_private.bootstrap_demo_experience(),
  app_private.execute_demo_action(text,jsonb,text),
  app_private.get_demo_experience(), app_private.reset_demo_experience() to authenticated;
grant execute on function public.bootstrap_demo_experience(),
  public.execute_demo_action(text,jsonb,text),
  public.get_demo_experience(), public.reset_demo_experience() to authenticated;
grant execute on function app_private.claim_demo_ai_requests(integer,integer),
  app_private.complete_demo_ai_request(uuid,text,text,jsonb,text,jsonb),
  app_private.fail_demo_ai_request(uuid,text) to outbox_worker;
