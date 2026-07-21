-- PROD-543: community.comment.created.v1 payload에 postAuthorId 추가.
--
-- notification-file의 수신자 규칙이 payload.postAuthorId를 읽는데 발행 쪽이 안 실어줬다.
-- resolveRecipients는 없는 키에 예외를 안 던지고 []를 반환하므로, '새 댓글이 달렸습니다'
-- 알림이 조용히 0명에게 갔다.
--
-- create_comment는 이미 select p.* into v_post로 posts 행을 통째로 읽는다 —
-- v_post.author_id가 그 자리에 있어 추가 쿼리 없이 실어 보낼 수 있다.

create or replace function public.create_comment(
  p_comment_id uuid,
  p_post_id uuid,
  p_parent_id uuid default null,
  p_body text default null,
  p_idempotency_key text default null,
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_post public.posts;
  v_existing public.comments;
begin
  if v_user_id is null or length(trim(coalesce(p_body, ''))) not between 1 and 5000
     or length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '22023', message = 'invalid comment input';
  end if;
  select * into v_existing from public.comments
  where author_id = v_user_id and create_idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('id', v_existing.id, 'postId', v_existing.post_id); end if;
  select p.* into v_post from public.posts p join public.boards b on b.id = p.board_id
  where p.id = p_post_id and p.status = 'published' and b.is_active
    and b.capabilities @> array['comments']::text[] for share;
  if not found then raise exception using errcode = 'P0002', message = 'published post not found'; end if;
  if not ((app_private.current_account_active() and not app_private.is_service_account())
          or app_private.service_account_can_reply(v_post.board_id)) then
    raise exception using errcode = '42501', message = 'comment create denied';
  end if;
  if not ((app_private.consume_api_rate_limit(
    'comment', encode(extensions.digest(v_user_id::text, 'sha256'), 'hex'), 20, 60
  ) ->> 'allowed')::boolean) then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.comments c where c.id = p_parent_id and c.post_id = p_post_id
      and c.parent_id is null and not c.is_deleted
  ) then
    raise exception using errcode = '23514', message = 'reply depth or parent invalid';
  end if;
  insert into public.comments
    (id, post_id, board_id, author_id, parent_id, body, create_idempotency_key)
  values (p_comment_id, p_post_id, v_post.board_id, v_user_id, p_parent_id,
          trim(p_body), p_idempotency_key);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, case when app_private.is_service_account() then 'service' else 'user' end,
          v_user_id, 'community.comment.create', 'comment', p_comment_id, 'success');
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('community.comment.created.v1', p_trace_id,
    jsonb_build_object('type', case when app_private.is_service_account() then 'service' else 'user' end, 'id', v_user_id),
    jsonb_build_object('type', 'comment', 'id', p_comment_id),
    jsonb_build_object('postId', p_post_id, 'boardId', v_post.board_id,
                     'parentId', p_parent_id, 'postAuthorId', v_post.author_id));
  return jsonb_build_object('id', p_comment_id, 'postId', p_post_id, 'parentId', p_parent_id);
end;
$$;
