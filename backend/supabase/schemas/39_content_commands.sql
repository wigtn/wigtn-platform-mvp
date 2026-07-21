-- 39_content_commands.sql — Gate 4 콘텐츠 command, sanitize, rate limit, 운영 adapter.

create table app_private.api_rate_limit_buckets (
  scope          text not null,
  subject_hash   text not null,
  window_started_at timestamptz not null,
  request_count  integer not null check (request_count > 0),
  expires_at     timestamptz not null,
  primary key (scope, subject_hash, window_started_at)
);
create index api_rate_limit_expiry_idx on app_private.api_rate_limit_buckets (expires_at);

create or replace function app_private.escape_html(p_value text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(p_value, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function app_private.validate_content_source(p_source jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_block jsonb;
  v_item jsonb;
begin
  if jsonb_typeof(p_source) <> 'object'
     or p_source ->> 'version' <> '1'
     or jsonb_typeof(p_source -> 'blocks') <> 'array'
     or jsonb_array_length(p_source -> 'blocks') not between 1 and 200 then
    raise exception using errcode = '22023', message = 'unsupported content format';
  end if;
  for v_block in select value from jsonb_array_elements(p_source -> 'blocks')
  loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid content block';
    end if;
    if v_block ->> 'type' = 'paragraph' then
      if jsonb_typeof(v_block -> 'text') <> 'string' or length(v_block ->> 'text') > 10000 then
        raise exception using errcode = '22023', message = 'invalid paragraph';
      end if;
    elsif v_block ->> 'type' = 'heading' then
      if jsonb_typeof(v_block -> 'text') <> 'string'
         or length(v_block ->> 'text') > 500
         or v_block ->> 'level' not in ('2', '3') then
        raise exception using errcode = '22023', message = 'invalid heading';
      end if;
    elsif v_block ->> 'type' = 'unordered-list' then
      if jsonb_typeof(v_block -> 'items') <> 'array'
         or jsonb_array_length(v_block -> 'items') not between 1 and 100 then
        raise exception using errcode = '22023', message = 'invalid list';
      end if;
      for v_item in select value from jsonb_array_elements(v_block -> 'items')
      loop
        if jsonb_typeof(v_item) <> 'string' or length(v_item #>> '{}') > 1000 then
          raise exception using errcode = '22023', message = 'invalid list item';
        end if;
      end loop;
    else
      raise exception using errcode = '22023', message = 'unsupported content block';
    end if;
  end loop;
end;
$$;

create or replace function app_private.render_content_html(p_source jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_block jsonb;
  v_html text := '';
  v_items text;
begin
  perform app_private.validate_content_source(p_source);
  for v_block in select value from jsonb_array_elements(p_source -> 'blocks')
  loop
    if v_block ->> 'type' = 'paragraph' then
      v_html := v_html || '<p>' || replace(app_private.escape_html(v_block ->> 'text'), E'\n', '<br>') || '</p>';
    elsif v_block ->> 'type' = 'heading' then
      v_html := v_html || '<h' || (v_block ->> 'level') || '>'
        || app_private.escape_html(v_block ->> 'text') || '</h' || (v_block ->> 'level') || '>';
    else
      select coalesce(string_agg('<li>' || app_private.escape_html(value #>> '{}') || '</li>', ''), '')
      into v_items from jsonb_array_elements(v_block -> 'items');
      v_html := v_html || '<ul>' || v_items || '</ul>';
    end if;
  end loop;
  return v_html;
end;
$$;

create or replace function app_private.content_plain_text(p_source jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_block jsonb;
  v_text text := '';
  v_items text;
begin
  perform app_private.validate_content_source(p_source);
  for v_block in select value from jsonb_array_elements(p_source -> 'blocks')
  loop
    if v_block ->> 'type' = 'unordered-list' then
      select string_agg(value #>> '{}', E'\n') into v_items
      from jsonb_array_elements(v_block -> 'items');
      v_text := v_text || coalesce(v_items, '') || E'\n';
    else
      v_text := v_text || (v_block ->> 'text') || E'\n';
    end if;
  end loop;
  return trim(v_text);
end;
$$;

create or replace function app_private.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_scope not in ('search', 'comment', 'report', 'upload')
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit input';
  end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into app_private.api_rate_limit_buckets
    (scope, subject_hash, window_started_at, request_count, expires_at)
  values (p_scope, p_subject_hash, v_window, 1, v_window + make_interval(secs => p_window_seconds * 2))
  on conflict (scope, subject_hash, window_started_at) do update
  set request_count = app_private.api_rate_limit_buckets.request_count + 1
  returning request_count into v_count;
  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'resetAt', v_window + make_interval(secs => p_window_seconds)
  );
end;
$$;

create or replace function public.create_post(
  p_board_slug text,
  p_post_id uuid,
  p_title text,
  p_source jsonb,
  p_attachment_ids uuid[] default '{}'::uuid[],
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
  v_board public.boards;
  v_post public.posts;
  v_body text;
  v_html text;
  v_attachment_count integer;
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account() then
    raise exception using errcode = '42501', message = 'active member required';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 200
     or length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '22023', message = 'invalid title or idempotency key';
  end if;
  select * into v_post from public.posts
  where author_id = v_user_id and create_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_post.id, 'boardId', v_post.board_id, 'status', v_post.status);
  end if;
  select * into v_board from public.boards
  where slug = p_board_slug and is_active and capabilities @> array['posts']::text[] for share;
  if not found then raise exception using errcode = 'P0002', message = 'board not found'; end if;

  v_body := app_private.content_plain_text(p_source);
  v_html := app_private.render_content_html(p_source);
  insert into public.posts
    (id, board_id, author_id, title, body, status, create_idempotency_key)
  values (p_post_id, v_board.id, v_user_id, trim(p_title), v_body, 'published', p_idempotency_key)
  returning * into v_post;
  insert into public.post_contents (post_id, source, sanitized_html, format_version)
  values (v_post.id, p_source, v_html, 1);

  select count(*) into v_attachment_count from public.attachments
  where id = any(coalesce(p_attachment_ids, '{}'::uuid[]))
    and owner_id = v_user_id and post_id is null and status = 'ready';
  if v_attachment_count <> cardinality(coalesce(p_attachment_ids, '{}'::uuid[])) then
    raise exception using errcode = '42501', message = 'attachment ownership or status invalid';
  end if;
  update public.attachments set post_id = v_post.id, updated_at = now()
  where id = any(coalesce(p_attachment_ids, '{}'::uuid[]));

  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted)
  values (p_trace_id, 'user', v_user_id, 'community.post.create', 'post', v_post.id,
          'success', jsonb_build_object('boardId', v_board.id, 'status', v_post.status));
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values (
    'community.post.created.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'post', 'id', v_post.id),
    jsonb_build_object('boardId', v_board.id, 'boardSlug', v_board.slug,
      'aiReplyEnabled', v_board.ai_reply_enabled)
  );
  return jsonb_build_object('id', v_post.id, 'boardId', v_post.board_id, 'status', v_post.status);
end;
$$;

create or replace function public.update_post(
  p_post_id uuid,
  p_title text,
  p_source jsonb,
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
  v_content public.post_contents;
  v_revision integer;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'post not found'; end if;
  if not ((v_post.author_id = v_user_id and app_private.current_account_active()
           and not app_private.is_service_account()) or app_private.has_permission('content.moderate')) then
    raise exception using errcode = '42501', message = 'post update denied';
  end if;
  if v_post.status = 'deleted' or length(trim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception using errcode = '23514', message = 'post cannot be updated';
  end if;
  select * into v_content from public.post_contents where post_id = p_post_id for update;
  select coalesce(max(revision_number), 0) + 1 into v_revision
  from public.post_revisions where post_id = p_post_id;
  insert into public.post_revisions
    (post_id, revision_number, title, source, sanitized_html, format_version, created_by)
  values (p_post_id, v_revision, v_post.title, v_content.source, v_content.sanitized_html,
          v_content.format_version, v_user_id);
  update public.posts set title = trim(p_title), body = app_private.content_plain_text(p_source),
    updated_at = now() where id = p_post_id;
  update public.post_contents set source = p_source,
    sanitized_html = app_private.render_content_html(p_source), format_version = 1,
    updated_at = now() where post_id = p_post_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted)
  values (p_trace_id, 'user', v_user_id, 'community.post.update', 'post', p_post_id, 'success',
          jsonb_build_object('title', v_post.title, 'revision', v_revision),
          jsonb_build_object('title', trim(p_title)));
  return jsonb_build_object('id', p_post_id, 'status', v_post.status, 'revision', v_revision);
end;
$$;

create or replace function public.delete_post(p_post_id uuid, p_reason text default 'author_delete', p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_post public.posts;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'post not found'; end if;
  if not ((v_post.author_id = v_user_id and app_private.current_account_active()
           and not app_private.is_service_account()) or app_private.has_permission('content.moderate')) then
    raise exception using errcode = '42501', message = 'post delete denied';
  end if;
  update public.posts set status = 'deleted', deleted_reason = left(coalesce(p_reason, 'author_delete'), 500),
    updated_at = now() where id = p_post_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted)
  values (p_trace_id, 'user', v_user_id, 'community.post.delete', 'post', p_post_id, 'success',
          jsonb_build_object('status', v_post.status), jsonb_build_object('status', 'deleted'));
  return jsonb_build_object('id', p_post_id, 'status', 'deleted');
end;
$$;

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

create or replace function public.update_comment(p_comment_id uuid, p_body text, p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_comment public.comments;
begin
  select * into v_comment from public.comments where id = p_comment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'comment not found'; end if;
  if v_comment.is_deleted or length(trim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception using errcode = '23514', message = 'comment cannot be updated';
  end if;
  if not ((v_comment.author_id = v_user_id and app_private.current_account_active()
           and not app_private.is_service_account()) or app_private.has_permission('content.moderate')) then
    raise exception using errcode = '42501', message = 'comment update denied';
  end if;
  update public.comments set body = trim(p_body), updated_at = now() where id = p_comment_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, 'user', v_user_id, 'community.comment.update', 'comment', p_comment_id, 'success');
  return jsonb_build_object('id', p_comment_id, 'isDeleted', false);
end;
$$;

create or replace function public.delete_comment(p_comment_id uuid, p_reason text default 'author_delete', p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := app_private.current_user_id();
  v_comment public.comments;
begin
  select * into v_comment from public.comments where id = p_comment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'comment not found'; end if;
  if not ((v_comment.author_id = v_user_id and app_private.current_account_active()
           and not app_private.is_service_account()) or app_private.has_permission('content.moderate')) then
    raise exception using errcode = '42501', message = 'comment delete denied';
  end if;
  update public.comments set is_deleted = true, body = '',
    deleted_reason = left(coalesce(p_reason, 'author_delete'), 500), updated_at = now()
  where id = p_comment_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome)
  values (p_trace_id, 'user', v_user_id, 'community.comment.delete', 'comment', p_comment_id, 'success');
  return jsonb_build_object('id', p_comment_id, 'isDeleted', true);
end;
$$;

create or replace function public.set_post_reaction(p_post_id uuid, p_type public.reaction_type default 'like')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id();
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account()
     or not exists (select 1 from public.posts where id = p_post_id and status = 'published') then
    raise exception using errcode = '42501', message = 'reaction denied';
  end if;
  insert into public.reactions (post_id, user_id, type) values (p_post_id, v_user_id, p_type)
  on conflict do nothing;
  return jsonb_build_object('postId', p_post_id, 'type', p_type, 'active', true);
end;
$$;

create or replace function public.remove_post_reaction(p_post_id uuid, p_type public.reaction_type default 'like')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id();
begin
  delete from public.reactions where post_id = p_post_id and user_id = v_user_id and type = p_type;
  return jsonb_build_object('postId', p_post_id, 'type', p_type, 'active', false);
end;
$$;

create or replace function public.set_post_bookmark(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id();
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account()
     or not exists (select 1 from public.posts where id = p_post_id and status = 'published') then
    raise exception using errcode = '42501', message = 'bookmark denied';
  end if;
  insert into public.bookmarks (post_id, user_id) values (p_post_id, v_user_id) on conflict do nothing;
  return jsonb_build_object('postId', p_post_id, 'active', true);
end;
$$;

create or replace function public.remove_post_bookmark(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id();
begin
  delete from public.bookmarks where post_id = p_post_id and user_id = v_user_id;
  return jsonb_build_object('postId', p_post_id, 'active', false);
end;
$$;

create or replace function public.submit_content_report(
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_reason_code text default null,
  p_details text default '',
  p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id(); v_report_id uuid;
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account()
     or ((p_post_id is null) = (p_comment_id is null))
     or length(trim(coalesce(p_reason_code, ''))) not between 2 and 50
     or length(coalesce(p_details, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid report';
  end if;
  if p_post_id is not null and not exists (select 1 from public.posts where id = p_post_id and status = 'published') then
    raise exception using errcode = 'P0002', message = 'report target not found';
  end if;
  if p_comment_id is not null and not exists (select 1 from public.comments where id = p_comment_id and not is_deleted) then
    raise exception using errcode = 'P0002', message = 'report target not found';
  end if;
  if not ((app_private.consume_api_rate_limit(
    'report', encode(extensions.digest(v_user_id::text, 'sha256'), 'hex'), 10, 3600
  ) ->> 'allowed')::boolean) then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;
  insert into public.reports (reporter_id, post_id, comment_id, reason_code, details)
  values (v_user_id, p_post_id, p_comment_id, trim(p_reason_code), trim(coalesce(p_details, '')))
  returning id into v_report_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted)
  values (p_trace_id, 'user', v_user_id, 'community.report.create', 'report', v_report_id,
          'success', jsonb_build_object('reasonCode', trim(p_reason_code)));
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('community.report.created.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'report', 'id', v_report_id),
    jsonb_build_object('targetType', case when p_post_id is not null then 'post' else 'comment' end,
      'targetId', coalesce(p_post_id, p_comment_id), 'reasonCode', trim(p_reason_code)));
  return jsonb_build_object('id', v_report_id, 'status', 'open');
exception when unique_violation then
  raise exception using errcode = '23505', message = 'open report already exists';
end;
$$;

create or replace function public.begin_post_attachment(
  p_attachment_id uuid,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id();
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account()
     or split_part(p_object_path, '/', 1) <> v_user_id::text
     or split_part(p_object_path, '/', 2) <> p_attachment_id::text
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     or p_size_bytes not between 1 and 10485760
     or length(p_original_name) not between 1 and 255 then
    raise exception using errcode = '42501', message = 'invalid attachment';
  end if;
  if not ((app_private.consume_api_rate_limit(
    'upload', encode(extensions.digest(v_user_id::text, 'sha256'), 'hex'), 20, 3600
  ) ->> 'allowed')::boolean) then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;
  insert into public.attachments
    (id, owner_id, object_path, original_name, mime_type, size_bytes)
  values (p_attachment_id, v_user_id, p_object_path, p_original_name, p_mime_type, p_size_bytes);
  return jsonb_build_object('id', p_attachment_id, 'objectPath', p_object_path, 'status', 'pending');
end;
$$;

create or replace function public.complete_post_attachment(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := app_private.current_user_id(); v_attachment public.attachments;
begin
  select * into v_attachment from public.attachments where id = p_attachment_id for update;
  if not found or v_attachment.owner_id <> v_user_id or v_attachment.post_id is not null then
    raise exception using errcode = '42501', message = 'attachment completion denied';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = v_attachment.bucket_id
      and o.name = v_attachment.object_path and o.owner_id = v_user_id::text
  ) then
    raise exception using errcode = 'P0002', message = 'uploaded object not found';
  end if;
  update public.attachments set status = 'ready', updated_at = now() where id = p_attachment_id;
  return jsonb_build_object('id', p_attachment_id, 'status', 'ready');
end;
$$;

-- 공개/브라우저 노출 범위를 명시한다. 내부 sanitize/rate-limit 함수는 app_authenticator 전용이다.
revoke all on function app_private.escape_html(text) from public, anon, authenticated;
revoke all on function app_private.validate_content_source(jsonb) from public, anon, authenticated;
revoke all on function app_private.render_content_html(jsonb) from public, anon, authenticated;
revoke all on function app_private.content_plain_text(jsonb) from public, anon, authenticated;
revoke all on function app_private.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;

revoke all on function public.create_post(text, uuid, text, jsonb, uuid[], text, text) from public;
revoke all on function public.update_post(uuid, text, jsonb, text) from public;
revoke all on function public.delete_post(uuid, text, text) from public;
revoke all on function public.create_comment(uuid, uuid, uuid, text, text, text) from public;
revoke all on function public.update_comment(uuid, text, text) from public;
revoke all on function public.delete_comment(uuid, text, text) from public;
revoke all on function public.set_post_reaction(uuid, public.reaction_type) from public;
revoke all on function public.remove_post_reaction(uuid, public.reaction_type) from public;
revoke all on function public.set_post_bookmark(uuid) from public;
revoke all on function public.remove_post_bookmark(uuid) from public;
revoke all on function public.submit_content_report(uuid, uuid, text, text, text) from public;
revoke all on function public.begin_post_attachment(uuid, text, text, text, bigint) from public;
revoke all on function public.complete_post_attachment(uuid) from public;

grant execute on function public.create_post(text, uuid, text, jsonb, uuid[], text, text),
  public.update_post(uuid, text, jsonb, text), public.delete_post(uuid, text, text),
  public.create_comment(uuid, uuid, uuid, text, text, text),
  public.update_comment(uuid, text, text), public.delete_comment(uuid, text, text),
  public.set_post_reaction(uuid, public.reaction_type),
  public.remove_post_reaction(uuid, public.reaction_type),
  public.set_post_bookmark(uuid), public.remove_post_bookmark(uuid),
  public.submit_content_report(uuid, uuid, text, text, text),
  public.begin_post_attachment(uuid, text, text, text, bigint),
  public.complete_post_attachment(uuid)
to authenticated;

create or replace function app_private.search_content(
  p_query text default '', p_limit integer default 50, p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := app_private.current_user_id(); v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('content.moderate', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data."createdAt" desc), '[]'::jsonb)
  into v_rows from (
    select p.id, 'post'::text as "targetType", p.title,
      left(p.body, 180) as excerpt, p.status::text as status,
      b.slug as "boardSlug", p.author_id as "authorId", p.created_at as "createdAt"
    from public.posts p join public.boards b on b.id = p.board_id
    where trim(coalesce(p_query, '')) = ''
      or p.title ilike '%' || trim(p_query) || '%' or p.body ilike '%' || trim(p_query) || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'content.search', 'content_query', 'success',
    jsonb_build_object('resultCount', jsonb_array_length(v_rows)), 'content.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.moderate_content(
  p_target_type text,
  p_target_id uuid,
  p_action public.moderation_action_type,
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
  v_post public.posts;
  v_comment public.comments;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('content.moderate', true);
  if p_target_type not in ('post', 'comment') or length(trim(p_reason)) < 3
     or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'invalid moderation input';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'content.moderate'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.resource_id <> p_target_id then
      raise exception using errcode = '23505', message = 'idempotency key resource mismatch';
    end if;
    return v_receipt.response;
  end if;
  if p_target_type = 'post' then
    select * into v_post from public.posts where id = p_target_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'post not found'; end if;
    v_before := jsonb_build_object('status', v_post.status);
    if p_action = 'hide' and v_post.status = 'published' then
      update public.posts set status = 'hidden', updated_at = now() where id = p_target_id;
    elsif p_action = 'restore' and v_post.status = 'hidden' then
      update public.posts set status = 'published', deleted_reason = null, updated_at = now() where id = p_target_id;
    elsif p_action = 'delete' and v_post.status <> 'deleted' then
      update public.posts set status = 'deleted', deleted_reason = trim(p_reason), updated_at = now() where id = p_target_id;
    else
      raise exception using errcode = '23514', message = 'invalid post moderation transition';
    end if;
    select jsonb_build_object('status', status) into v_after from public.posts where id = p_target_id;
  else
    select * into v_comment from public.comments where id = p_target_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'comment not found'; end if;
    v_before := jsonb_build_object('isDeleted', v_comment.is_deleted);
    if p_action = 'restore' and v_comment.is_deleted then
      update public.comments set is_deleted = false, deleted_reason = null, updated_at = now() where id = p_target_id;
    elsif p_action in ('hide', 'delete') and not v_comment.is_deleted then
      update public.comments set is_deleted = true, deleted_reason = trim(p_reason), updated_at = now() where id = p_target_id;
    else
      raise exception using errcode = '23514', message = 'invalid comment moderation transition';
    end if;
    select jsonb_build_object('isDeleted', is_deleted) into v_after from public.comments where id = p_target_id;
  end if;
  insert into public.moderation_actions
    (actor_id, post_id, comment_id, action, reason, before_state, after_state)
  values (v_actor_id,
    case when p_target_type = 'post' then p_target_id end,
    case when p_target_type = 'comment' then p_target_id end,
    p_action, trim(p_reason), v_before, v_after);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'content.moderate', p_target_type, p_target_id,
    'success', v_before, v_after, 'content.moderate', 1);
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('community.content.moderated.v1', p_trace_id,
    jsonb_build_object('type', 'user', 'id', v_actor_id),
    jsonb_build_object('type', p_target_type, 'id', p_target_id),
    jsonb_build_object('action', p_action, 'reason', trim(p_reason)));
  v_response := jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id,
    'action', p_action, 'state', v_after);
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'content.moderate', p_idempotency_key, p_target_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.list_reports(p_limit integer default 50, p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := app_private.current_user_id(); v_rows jsonb;
begin
  perform app_private.assert_admin_tool_access('content.moderate', false);
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data."createdAt"), '[]'::jsonb)
  into v_rows from (
    select r.id, r.reporter_id as "reporterId", r.post_id as "postId",
      r.comment_id as "commentId", r.reason_code as "reasonCode", r.details,
      r.status::text as status, r.assigned_to as "assignedTo", r.created_at as "createdAt"
    from public.reports r where r.status in ('open', 'assigned')
    order by r.created_at limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) row_data;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'report.search', 'report_query', 'success',
    jsonb_build_object('resultCount', jsonb_array_length(v_rows)), 'report.search', 1);
  return jsonb_build_object('rows', v_rows);
end;
$$;

create or replace function app_private.resolve_report(
  p_report_id uuid, p_resolution_note text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_report public.reports;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('content.moderate', true);
  if length(trim(p_resolution_note)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'resolution note and idempotency key required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'report.resolve' and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status not in ('open', 'assigned') then
    raise exception using errcode = '23514', message = 'report is not resolvable';
  end if;
  update public.reports set status = 'resolved', resolution_note = trim(p_resolution_note),
    resolved_at = now(), resolved_by = v_actor_id, updated_at = now() where id = p_report_id;
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
     before_redacted, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor_id, 'report.resolve', 'report', p_report_id, 'success',
    jsonb_build_object('status', v_report.status), jsonb_build_object('status', 'resolved'),
    'report.resolve', 1);
  v_response := jsonb_build_object('reportId', p_report_id, 'status', 'resolved');
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'report.resolve', p_idempotency_key, p_report_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.disable_service_account(
  p_service_account_id uuid, p_reason text, p_idempotency_key text, p_trace_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := app_private.current_user_id();
  v_account public.service_accounts;
  v_response jsonb;
  v_receipt app_private.admin_command_receipts;
begin
  perform app_private.assert_admin_tool_access('service_account.manage', true);
  if length(trim(p_reason)) < 3 or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = '22023', message = 'reason and idempotency key required';
  end if;
  select * into v_receipt from app_private.admin_command_receipts
  where actor_id = v_actor_id and tool_name = 'service-account.disable'
    and idempotency_key = p_idempotency_key;
  if found then return v_receipt.response; end if;
  select * into v_account from public.service_accounts where id = p_service_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'service account not found'; end if;
  if v_account.status <> 'disabled' then
    update public.service_accounts set status = 'disabled', disabled_at = now(),
      disabled_reason = trim(p_reason) where id = p_service_account_id;
    delete from auth.sessions where user_id = v_account.user_id;
    insert into public.audit_events
      (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome,
       before_redacted, after_redacted, tool_id, tool_version)
    values (p_trace_id, 'user', v_actor_id, 'service-account.disable', 'service_account',
      p_service_account_id, 'success', jsonb_build_object('status', v_account.status),
      jsonb_build_object('status', 'disabled'), 'service-account.disable', 1);
    insert into public.outbox_events (type, trace_id, actor, subject, data)
    values ('identity.service-account.disabled.v1', p_trace_id,
      jsonb_build_object('type', 'user', 'id', v_actor_id),
      jsonb_build_object('type', 'service_account', 'id', p_service_account_id),
      jsonb_build_object('reason', trim(p_reason)));
  end if;
  v_response := jsonb_build_object('serviceAccountId', p_service_account_id, 'status', 'disabled');
  insert into app_private.admin_command_receipts
    (actor_id, tool_name, idempotency_key, resource_id, response)
  values (v_actor_id, 'service-account.disable', p_idempotency_key, p_service_account_id, v_response);
  return v_response;
end;
$$;

revoke all on function app_private.search_content(text, integer, text),
  app_private.moderate_content(text, uuid, public.moderation_action_type, text, text, text),
  app_private.list_reports(integer, text),
  app_private.resolve_report(uuid, text, text, text),
  app_private.disable_service_account(uuid, text, text, text)
from public, anon, authenticated;
