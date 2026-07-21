set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.bootstrap_demo_experience()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.bootstrap_demo_experience();
$function$
;

CREATE OR REPLACE FUNCTION public.execute_demo_action(p_action text, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.execute_demo_action(p_action, p_payload, p_idempotency_key);
$function$
;

CREATE OR REPLACE FUNCTION public.get_demo_experience()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select app_private.get_demo_experience();
$function$
;

CREATE OR REPLACE FUNCTION public.reset_demo_experience()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.reset_demo_experience();
$function$
;


  create table "app_private"."demo_experience_actions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "action_key" text not null,
    "request_payload" jsonb not null default '{}'::jsonb,
    "response_payload" jsonb not null,
    "idempotency_key" text not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "app_private"."demo_experience_sessions" (
    "user_id" uuid not null,
    "started_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null default (now() + '24:00:00'::interval),
    "reset_count" integer not null default 0
      );


CREATE UNIQUE INDEX demo_experience_actions_pkey ON app_private.demo_experience_actions USING btree (id);

CREATE INDEX demo_experience_actions_user_created_idx ON app_private.demo_experience_actions USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX demo_experience_actions_user_id_idempotency_key_key ON app_private.demo_experience_actions USING btree (user_id, idempotency_key);

CREATE UNIQUE INDEX demo_experience_sessions_pkey ON app_private.demo_experience_sessions USING btree (user_id);

alter table "app_private"."demo_experience_actions" add constraint "demo_experience_actions_pkey" PRIMARY KEY using index "demo_experience_actions_pkey";

alter table "app_private"."demo_experience_sessions" add constraint "demo_experience_sessions_pkey" PRIMARY KEY using index "demo_experience_sessions_pkey";

alter table "app_private"."demo_experience_actions" add constraint "demo_experience_actions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_private.demo_experience_sessions(user_id) ON DELETE CASCADE not valid;

alter table "app_private"."demo_experience_actions" validate constraint "demo_experience_actions_user_id_fkey";

alter table "app_private"."demo_experience_actions" add constraint "demo_experience_actions_user_id_idempotency_key_key" UNIQUE using index "demo_experience_actions_user_id_idempotency_key_key";

alter table "app_private"."demo_experience_sessions" add constraint "demo_experience_sessions_reset_count_check" CHECK ((reset_count >= 0)) not valid;

alter table "app_private"."demo_experience_sessions" validate constraint "demo_experience_sessions_reset_count_check";

alter table "app_private"."demo_experience_sessions" add constraint "demo_experience_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "app_private"."demo_experience_sessions" validate constraint "demo_experience_sessions_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.assert_anonymous_demo_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.bootstrap_demo_experience()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.execute_demo_action(p_action text, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_existing jsonb;
  v_response jsonb;
  v_entity_id uuid := gen_random_uuid();
  v_request app_private.demo_experience_actions;
  v_available_at timestamptz;
  v_recent_count integer;
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
      v_available_at := now() + interval '3 seconds';
      v_response := jsonb_build_object('requestId', v_entity_id, 'status', 'pending',
        'availableAt', v_available_at);
    when 'ai.answer.poll' then
      select * into v_request
      from app_private.demo_experience_actions a
      where a.user_id = v_user_id
        and a.action_key = 'ai.answer.request'
        and a.response_payload->>'requestId' = p_payload->>'requestId';
      if not found then
        raise exception using errcode = 'P0002', message = 'demo AI request not found';
      end if;
      v_available_at := (v_request.response_payload->>'availableAt')::timestamptz;
      v_response := case when now() >= v_available_at then
        jsonb_build_object('requestId', p_payload->>'requestId', 'status', 'ready',
          'answer', '목표 고객을 업종·규모·의사결정 역할로 좁히고, 최근 수주 사례를 근거로 첫 접점 메시지를 짧게 검증해 보세요.')
      else jsonb_build_object('requestId', p_payload->>'requestId', 'status', 'pending',
        'availableAt', v_available_at) end;
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
    (user_id, action_key, request_payload, response_payload, idempotency_key)
  values (v_user_id, p_action, coalesce(p_payload, '{}'::jsonb), v_response, p_idempotency_key);
  return v_response;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.get_demo_experience()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        where user_id = v_user_id order by created_at desc limit 100) recent;
  return jsonb_build_object('mode', 'isolated-demo', 'expiresAt', v_session.expires_at,
    'actions', v_actions);
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.reset_demo_experience()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

revoke all on table app_private.demo_experience_sessions,
  app_private.demo_experience_actions from public, anon, authenticated, app_authenticator;

revoke all on function app_private.assert_anonymous_demo_actor(),
  app_private.bootstrap_demo_experience(),
  app_private.execute_demo_action(text,jsonb,text),
  app_private.get_demo_experience(), app_private.reset_demo_experience() from public;
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
