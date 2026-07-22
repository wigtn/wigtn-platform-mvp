-- 데모 액션 두 개를 더한다: 프로필 저장 · 신고
--
-- ## 왜 함수를 통째로 다시 쓰나
--
-- execute_demo_action 은 20260722123722(AI 실시간 큐)에서 이미 갈렸다.
-- 그 위에 얹어야 한다.
--
-- 처음에는 그 이전 버전을 바탕으로 썼다. 파일 이름 순서상 이 파일이 뒤라,
-- 적용하면 **AI 큐 처리 분기를 조용히 지운다.** 오류가 안 난다 - 질문은
-- 접수되는데 답이 영영 안 온다.
--
-- 그래서 20260722123722 의 본문을 그대로 가져와 두 분기만 더했다.
--
-- ## 화면에는 있는데 서버에 없던 둘
--
--   마이페이지 "프로필 저장"   화면에만 반영되고 새로고침하면 사라졌다
--   글 상세 "신고"             UI 가 부르는데 허용 목록에 없어 거부됐다
--
-- 신고 쪽은 화면부터 붙이고 서버를 안 고쳐서 난 구멍이다. 실패해도 조용히
-- 넘어가게 만들어 둔 탓에 화면에서는 멀쩡해 보였다.

set search_path = public, extensions;

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
  v_action_id uuid := gen_random_uuid();
  v_ai_request app_private.demo_ai_requests;
  v_recent_count integer;
  v_display_name text;
  v_ai_user_count integer;
  v_ai_global_count integer;
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
      -- 신고는 운영 큐로 가는 일이라 방문자 화면을 바꾸지 않는다.
      v_response := jsonb_build_object('reportId', v_entity_id, 'status', 'open',
        'targetId', p_payload->>'targetId', 'scope', 'visitor-only');
    when 'member.profile.update' then
      -- 다른 액션과 달리 여기만 실제 테이블을 바꾼다. 방문자 본인의 행이고
      -- RLS 의 profiles_update_self 가 이미 본인만 허용한다.
      -- 바꿀 수 있는 칼럼을 display_name 하나로 못 박는다 - handle 이나
      -- account_status 까지 열면 데모에서 계정 상태를 바꿔 버릴 수 있다.
      v_display_name := nullif(btrim(coalesce(p_payload->>'displayName', '')), '');
      if v_display_name is null or length(v_display_name) > 40 then
        raise exception using errcode = '22023', message = 'display name required (1-40)';
      end if;
      update public.profiles
      set display_name = v_display_name, updated_at = now()
      where user_id = v_user_id;
      v_response := jsonb_build_object('displayName', v_display_name,
        'status', 'saved', 'scope', 'visitor-only');
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
        where user_id = v_user_id and action_key <> 'ai.answer.poll'
        order by created_at desc limit 100) recent;
  return jsonb_build_object('mode', 'isolated-demo', 'expiresAt', v_session.expires_at,
    'actions', v_actions);
end;
$function$;
