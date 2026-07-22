-- 데모 액션 두 개를 더한다: 프로필 저장 · 신고
--
-- ## 왜
--
-- 화면에는 있는데 서버에 없던 둘이다.
--
--   마이페이지 "프로필 저장"   화면에만 반영되고 새로고침하면 사라졌다
--   글 상세 "신고"             UI 에서 부르는데 허용 목록에 없어 거부됐다
--                              (unsupported demo action)
--
-- 신고 쪽은 내가 화면부터 붙이고 서버를 안 고쳐서 난 구멍이다. 실패해도
-- 조용히 넘어가게 만들어 둔 탓에 화면에서는 멀쩡해 보였다 - 편한 설계가
-- 실수를 가려 준 경우다.
--
-- ## 프로필은 진짜로 바꾼다
--
-- 다른 데모 액션은 원장에만 적는다(simulated). 프로필은 다르다. 방문자
-- 본인의 profiles 행이고, RLS 에 `profiles_update_self` 가 이미 있어서
-- 본인만 바꿀 수 있다. 흉내 낼 이유가 없다.
--
-- 그래서 여기서만 실제 테이블을 건드린다. 대신 바꿀 수 있는 칼럼을
-- display_name 하나로 못 박는다 - handle 이나 account_status 까지 열면
-- 데모에서 계정 상태를 바꿔 버릴 수 있다.

set search_path = public, extensions;

create or replace function app_private.execute_demo_action(
  p_action text, p_payload jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := app_private.assert_anonymous_demo_actor();
  v_existing jsonb;
  v_response jsonb;
  v_entity_id uuid := gen_random_uuid();
  v_request app_private.demo_experience_actions;
  v_available_at timestamptz;
  v_recent_count integer;
  v_display_name text;
begin
  if p_action not in (
    'community.post.create', 'community.comment.create',
    'community.reaction.toggle', 'community.bookmark.toggle',
    'community.report.create',
    'company.review.create', 'membership.grade.submit',
    'membership.badge.submit', 'member.profile.update',
    'ai.answer.request', 'ai.answer.poll',
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
    when 'community.report.create' then
      -- 신고는 운영 큐로 가는 일이라 방문자 화면을 바꾸지 않는다. 접수됐다는
      -- 사실만 남긴다.
      v_response := jsonb_build_object('reportId', v_entity_id, 'status', 'open',
        'targetId', p_payload->>'targetId', 'scope', 'visitor-only');
    when 'company.review.create' then
      v_response := jsonb_build_object('reviewId', v_entity_id, 'status', 'published',
        'anonymous', true, 'scope', 'visitor-only');
    when 'membership.grade.submit' then
      v_response := jsonb_build_object('applicationId', v_entity_id, 'status', 'submitted');
    when 'membership.badge.submit' then
      v_response := jsonb_build_object('applicationId', v_entity_id, 'status', 'submitted');
    when 'member.profile.update' then
      -- 여기만 실제 테이블을 바꾼다. 방문자 본인의 행이고 RLS 가 이미
      -- 본인만 허용한다.
      v_display_name := nullif(btrim(coalesce(p_payload->>'displayName', '')), '');
      if v_display_name is null or length(v_display_name) > 40 then
        raise exception using errcode = '22023', message = 'display name required (1-40)';
      end if;
      update public.profiles
      set display_name = v_display_name, updated_at = now()
      where user_id = v_user_id;
      v_response := jsonb_build_object('displayName', v_display_name,
        'status', 'saved', 'scope', 'visitor-only');
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
$function$;

-- bootstrap 이 돌려주는 기능 목록에도 같이 넣는다. 화면이 이 목록을 보고
-- 무엇을 할 수 있는지 판단할 수 있어야 한다.
create or replace function app_private.bootstrap_demo_experience()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      'community.report.create',
      'company.review.create', 'membership.grade.submit',
      'membership.badge.submit', 'member.profile.update',
      'ai.answer.request', 'ai.answer.poll',
      'admin.member.review', 'admin.company.import',
      'admin.content.moderate', 'admin.placement.publish'
    )
  );
end;
$function$;
