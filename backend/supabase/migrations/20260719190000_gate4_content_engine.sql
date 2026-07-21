create type "public"."attachment_status" as enum ('pending', 'ready', 'rejected');

create type "public"."moderation_action_type" as enum ('hide', 'restore', 'delete');

create type "public"."reaction_type" as enum ('like');

create type "public"."report_status" as enum ('open', 'assigned', 'resolved', 'closed');


  create table "app_private"."api_rate_limit_buckets" (
    "scope" text not null,
    "subject_hash" text not null,
    "window_started_at" timestamp with time zone not null,
    "request_count" integer not null,
    "expires_at" timestamp with time zone not null
      );



  create table "public"."attachments" (
    "id" uuid not null,
    "owner_id" uuid not null,
    "post_id" uuid,
    "bucket_id" text not null default 'post-attachments'::text,
    "object_path" text not null,
    "original_name" text not null,
    "mime_type" text not null,
    "size_bytes" bigint not null,
    "status" public.attachment_status not null default 'pending'::public.attachment_status,
    "rejection_reason" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."attachments" enable row level security;


  create table "public"."auth_provider_links" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "provider" text not null,
    "provider_subject" text not null,
    "email_snapshot" text,
    "linked_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now()
      );


alter table "public"."auth_provider_links" enable row level security;


  create table "public"."bookmarks" (
    "post_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."bookmarks" enable row level security;


  create table "public"."moderation_actions" (
    "id" uuid not null default gen_random_uuid(),
    "actor_id" uuid not null,
    "post_id" uuid,
    "comment_id" uuid,
    "action" public.moderation_action_type not null,
    "reason" text not null,
    "before_state" jsonb not null,
    "after_state" jsonb not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."moderation_actions" enable row level security;


  create table "public"."post_contents" (
    "post_id" uuid not null,
    "source" jsonb not null,
    "sanitized_html" text not null,
    "format_version" integer not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."post_contents" enable row level security;


  create table "public"."post_revisions" (
    "id" uuid not null default gen_random_uuid(),
    "post_id" uuid not null,
    "revision_number" integer not null,
    "title" text not null,
    "source" jsonb not null,
    "sanitized_html" text not null,
    "format_version" integer not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_revisions" enable row level security;


  create table "public"."reactions" (
    "post_id" uuid not null,
    "user_id" uuid not null,
    "type" public.reaction_type not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."reactions" enable row level security;


  create table "public"."reports" (
    "id" uuid not null default gen_random_uuid(),
    "reporter_id" uuid not null,
    "post_id" uuid,
    "comment_id" uuid,
    "reason_code" text not null,
    "details" text not null default ''::text,
    "status" public.report_status not null default 'open'::public.report_status,
    "assigned_to" uuid,
    "resolution_note" text,
    "resolved_at" timestamp with time zone,
    "resolved_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."reports" enable row level security;

alter table "public"."boards" add column "capabilities" text[] not null default ARRAY['posts'::text, 'comments'::text, 'reactions'::text, 'bookmarks'::text, 'reports'::text];

alter table "public"."boards" add column "config" jsonb not null default '{}'::jsonb;

alter table "public"."boards" add column "config_version" integer not null default 1;

alter table "public"."boards" add column "description" text not null default ''::text;

alter table "public"."boards" add column "position" integer not null default 0;

alter table "public"."boards" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."comments" add column "create_idempotency_key" text;

alter table "public"."comments" add column "deleted_reason" text;

alter table "public"."comments" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."posts" add column "create_idempotency_key" text;

alter table "public"."posts" add column "deleted_reason" text;

CREATE UNIQUE INDEX api_rate_limit_buckets_pkey ON app_private.api_rate_limit_buckets USING btree (scope, subject_hash, window_started_at);

CREATE INDEX api_rate_limit_expiry_idx ON app_private.api_rate_limit_buckets USING btree (expires_at);

CREATE UNIQUE INDEX attachments_bucket_id_object_path_key ON public.attachments USING btree (bucket_id, object_path);

CREATE INDEX attachments_owner_status_idx ON public.attachments USING btree (owner_id, status, created_at);

CREATE UNIQUE INDEX attachments_pkey ON public.attachments USING btree (id);

CREATE INDEX attachments_post_idx ON public.attachments USING btree (post_id) WHERE (post_id IS NOT NULL);

CREATE UNIQUE INDEX auth_provider_links_pkey ON public.auth_provider_links USING btree (id);

CREATE UNIQUE INDEX auth_provider_links_provider_provider_subject_key ON public.auth_provider_links USING btree (provider, provider_subject);

CREATE UNIQUE INDEX auth_provider_links_user_id_provider_provider_subject_key ON public.auth_provider_links USING btree (user_id, provider, provider_subject);

CREATE INDEX auth_provider_links_user_idx ON public.auth_provider_links USING btree (user_id, linked_at);

CREATE UNIQUE INDEX bookmarks_pkey ON public.bookmarks USING btree (post_id, user_id);

CREATE UNIQUE INDEX comments_author_idempotency_idx ON public.comments USING btree (author_id, create_idempotency_key) WHERE (create_idempotency_key IS NOT NULL);

CREATE INDEX moderation_actions_comment_idx ON public.moderation_actions USING btree (comment_id, created_at DESC);

CREATE UNIQUE INDEX moderation_actions_pkey ON public.moderation_actions USING btree (id);

CREATE INDEX moderation_actions_post_idx ON public.moderation_actions USING btree (post_id, created_at DESC);

CREATE UNIQUE INDEX post_contents_pkey ON public.post_contents USING btree (post_id);

CREATE UNIQUE INDEX post_revisions_pkey ON public.post_revisions USING btree (id);

CREATE UNIQUE INDEX post_revisions_post_id_revision_number_key ON public.post_revisions USING btree (post_id, revision_number);

CREATE INDEX post_revisions_post_idx ON public.post_revisions USING btree (post_id, revision_number DESC);

CREATE UNIQUE INDEX posts_author_idempotency_idx ON public.posts USING btree (author_id, create_idempotency_key) WHERE (create_idempotency_key IS NOT NULL);

CREATE INDEX posts_title_trgm_idx ON public.posts USING gin (title extensions.gin_trgm_ops);

CREATE UNIQUE INDEX reactions_pkey ON public.reactions USING btree (post_id, user_id, type);

CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id);

CREATE INDEX reports_queue_idx ON public.reports USING btree (status, created_at) WHERE (status = ANY (ARRAY['open'::public.report_status, 'assigned'::public.report_status]));

CREATE UNIQUE INDEX reports_unique_open_comment_idx ON public.reports USING btree (reporter_id, comment_id) WHERE ((comment_id IS NOT NULL) AND (status = ANY (ARRAY['open'::public.report_status, 'assigned'::public.report_status])));

CREATE UNIQUE INDEX reports_unique_open_post_idx ON public.reports USING btree (reporter_id, post_id) WHERE ((post_id IS NOT NULL) AND (status = ANY (ARRAY['open'::public.report_status, 'assigned'::public.report_status])));

alter table "app_private"."api_rate_limit_buckets" add constraint "api_rate_limit_buckets_pkey" PRIMARY KEY using index "api_rate_limit_buckets_pkey";

alter table "public"."attachments" add constraint "attachments_pkey" PRIMARY KEY using index "attachments_pkey";

alter table "public"."auth_provider_links" add constraint "auth_provider_links_pkey" PRIMARY KEY using index "auth_provider_links_pkey";

alter table "public"."bookmarks" add constraint "bookmarks_pkey" PRIMARY KEY using index "bookmarks_pkey";

alter table "public"."moderation_actions" add constraint "moderation_actions_pkey" PRIMARY KEY using index "moderation_actions_pkey";

alter table "public"."post_contents" add constraint "post_contents_pkey" PRIMARY KEY using index "post_contents_pkey";

alter table "public"."post_revisions" add constraint "post_revisions_pkey" PRIMARY KEY using index "post_revisions_pkey";

alter table "public"."reactions" add constraint "reactions_pkey" PRIMARY KEY using index "reactions_pkey";

alter table "public"."reports" add constraint "reports_pkey" PRIMARY KEY using index "reports_pkey";

alter table "app_private"."api_rate_limit_buckets" add constraint "api_rate_limit_buckets_request_count_check" CHECK ((request_count > 0)) not valid;

alter table "app_private"."api_rate_limit_buckets" validate constraint "api_rate_limit_buckets_request_count_check";

alter table "public"."attachments" add constraint "attachments_bucket_id_object_path_key" UNIQUE using index "attachments_bucket_id_object_path_key";

alter table "public"."attachments" add constraint "attachments_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."attachments" validate constraint "attachments_owner_id_fkey";

alter table "public"."attachments" add constraint "attachments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."attachments" validate constraint "attachments_post_id_fkey";

alter table "public"."attachments" add constraint "attachments_size_bytes_check" CHECK (((size_bytes > 0) AND (size_bytes <= 10485760))) not valid;

alter table "public"."attachments" validate constraint "attachments_size_bytes_check";

alter table "public"."auth_provider_links" add constraint "auth_provider_links_provider_provider_subject_key" UNIQUE using index "auth_provider_links_provider_provider_subject_key";

alter table "public"."auth_provider_links" add constraint "auth_provider_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."auth_provider_links" validate constraint "auth_provider_links_user_id_fkey";

alter table "public"."auth_provider_links" add constraint "auth_provider_links_user_id_provider_provider_subject_key" UNIQUE using index "auth_provider_links_user_id_provider_provider_subject_key";

alter table "public"."boards" add constraint "boards_config_version_check" CHECK ((config_version > 0)) not valid;

alter table "public"."boards" validate constraint "boards_config_version_check";

alter table "public"."bookmarks" add constraint "bookmarks_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."bookmarks" validate constraint "bookmarks_post_id_fkey";

alter table "public"."bookmarks" add constraint "bookmarks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."bookmarks" validate constraint "bookmarks_user_id_fkey";

alter table "public"."moderation_actions" add constraint "moderation_actions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) not valid;

alter table "public"."moderation_actions" validate constraint "moderation_actions_actor_id_fkey";

alter table "public"."moderation_actions" add constraint "moderation_actions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE not valid;

alter table "public"."moderation_actions" validate constraint "moderation_actions_comment_id_fkey";

alter table "public"."moderation_actions" add constraint "moderation_actions_one_target" CHECK (((post_id IS NULL) <> (comment_id IS NULL))) not valid;

alter table "public"."moderation_actions" validate constraint "moderation_actions_one_target";

alter table "public"."moderation_actions" add constraint "moderation_actions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."moderation_actions" validate constraint "moderation_actions_post_id_fkey";

alter table "public"."post_contents" add constraint "post_contents_format_version_check" CHECK ((format_version > 0)) not valid;

alter table "public"."post_contents" validate constraint "post_contents_format_version_check";

alter table "public"."post_contents" add constraint "post_contents_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_contents" validate constraint "post_contents_post_id_fkey";

alter table "public"."post_revisions" add constraint "post_revisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) not valid;

alter table "public"."post_revisions" validate constraint "post_revisions_created_by_fkey";

alter table "public"."post_revisions" add constraint "post_revisions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."post_revisions" validate constraint "post_revisions_post_id_fkey";

alter table "public"."post_revisions" add constraint "post_revisions_post_id_revision_number_key" UNIQUE using index "post_revisions_post_id_revision_number_key";

alter table "public"."post_revisions" add constraint "post_revisions_revision_number_check" CHECK ((revision_number > 0)) not valid;

alter table "public"."post_revisions" validate constraint "post_revisions_revision_number_check";

alter table "public"."reactions" add constraint "reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."reactions" validate constraint "reactions_post_id_fkey";

alter table "public"."reactions" add constraint "reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."reactions" validate constraint "reactions_user_id_fkey";

alter table "public"."reports" add constraint "reports_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) not valid;

alter table "public"."reports" validate constraint "reports_assigned_to_fkey";

alter table "public"."reports" add constraint "reports_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE not valid;

alter table "public"."reports" validate constraint "reports_comment_id_fkey";

alter table "public"."reports" add constraint "reports_one_target" CHECK (((post_id IS NULL) <> (comment_id IS NULL))) not valid;

alter table "public"."reports" validate constraint "reports_one_target";

alter table "public"."reports" add constraint "reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."reports" validate constraint "reports_post_id_fkey";

alter table "public"."reports" add constraint "reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."reports" validate constraint "reports_reporter_id_fkey";

alter table "public"."reports" add constraint "reports_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id) not valid;

alter table "public"."reports" validate constraint "reports_resolved_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.consume_api_rate_limit(p_scope text, p_subject_hash text, p_limit integer, p_window_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.content_plain_text(p_source jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.disable_service_account(p_service_account_id uuid, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.escape_html(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select replace(replace(replace(replace(replace(coalesce(p_value, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$
;

CREATE OR REPLACE FUNCTION app_private.list_reports(p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.moderate_content(p_target_type text, p_target_id uuid, p_action public.moderation_action_type, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.reconcile_auth_provider_links_all(p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.reject_badge_application(p_application_id uuid, p_review_note text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.reject_grade_application(p_application_id uuid, p_review_note text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.render_content_html(p_source jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.resolve_report(p_report_id uuid, p_resolution_note text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.search_content(p_query text DEFAULT ''::text, p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.set_member_role(p_user_id uuid, p_role_key text, p_action text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.unsuspend_member(p_user_id uuid, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.validate_content_source(p_source jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.withdraw_member(p_user_id uuid, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.begin_post_attachment(p_attachment_id uuid, p_object_path text, p_original_name text, p_mime_type text, p_size_bytes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_post_attachment(p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_comment(p_comment_id uuid, p_post_id uuid, p_parent_id uuid DEFAULT NULL::uuid, p_body text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    jsonb_build_object('postId', p_post_id, 'boardId', v_post.board_id, 'parentId', p_parent_id));
  return jsonb_build_object('id', p_comment_id, 'postId', p_post_id, 'parentId', p_parent_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_post(p_board_slug text, p_post_id uuid, p_title text, p_source jsonb, p_attachment_ids uuid[] DEFAULT '{}'::uuid[], p_idempotency_key text DEFAULT NULL::text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id uuid, p_reason text DEFAULT 'author_delete'::text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_post(p_post_id uuid, p_reason text DEFAULT 'author_delete'::text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_post_bookmark(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid := app_private.current_user_id();
begin
  delete from public.bookmarks where post_id = p_post_id and user_id = v_user_id;
  return jsonb_build_object('postId', p_post_id, 'active', false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_post_reaction(p_post_id uuid, p_type public.reaction_type DEFAULT 'like'::public.reaction_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid := app_private.current_user_id();
begin
  delete from public.reactions where post_id = p_post_id and user_id = v_user_id and type = p_type;
  return jsonb_build_object('postId', p_post_id, 'type', p_type, 'active', false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_bookmark(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid := app_private.current_user_id();
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account()
     or not exists (select 1 from public.posts where id = p_post_id and status = 'published') then
    raise exception using errcode = '42501', message = 'bookmark denied';
  end if;
  insert into public.bookmarks (post_id, user_id) values (p_post_id, v_user_id) on conflict do nothing;
  return jsonb_build_object('postId', p_post_id, 'active', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_reaction(p_post_id uuid, p_type public.reaction_type DEFAULT 'like'::public.reaction_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_content_report(p_post_id uuid DEFAULT NULL::uuid, p_comment_id uuid DEFAULT NULL::uuid, p_reason_code text DEFAULT NULL::text, p_details text DEFAULT ''::text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_current_auth_provider_links(p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_comment(p_comment_id uuid, p_body text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_post(p_post_id uuid, p_title text, p_source jsonb, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

grant delete on table "public"."attachments" to "authenticated";

grant insert on table "public"."attachments" to "authenticated";

grant select on table "public"."attachments" to "authenticated";

grant update on table "public"."attachments" to "authenticated";

grant delete on table "public"."attachments" to "service_role";

grant insert on table "public"."attachments" to "service_role";

grant references on table "public"."attachments" to "service_role";

grant select on table "public"."attachments" to "service_role";

grant trigger on table "public"."attachments" to "service_role";

grant truncate on table "public"."attachments" to "service_role";

grant update on table "public"."attachments" to "service_role";

grant select on table "public"."auth_provider_links" to "authenticated";

grant delete on table "public"."auth_provider_links" to "service_role";

grant insert on table "public"."auth_provider_links" to "service_role";

grant references on table "public"."auth_provider_links" to "service_role";

grant select on table "public"."auth_provider_links" to "service_role";

grant trigger on table "public"."auth_provider_links" to "service_role";

grant truncate on table "public"."auth_provider_links" to "service_role";

grant update on table "public"."auth_provider_links" to "service_role";

grant delete on table "public"."bookmarks" to "authenticated";

grant insert on table "public"."bookmarks" to "authenticated";

grant select on table "public"."bookmarks" to "authenticated";

grant delete on table "public"."bookmarks" to "service_role";

grant insert on table "public"."bookmarks" to "service_role";

grant references on table "public"."bookmarks" to "service_role";

grant select on table "public"."bookmarks" to "service_role";

grant trigger on table "public"."bookmarks" to "service_role";

grant truncate on table "public"."bookmarks" to "service_role";

grant update on table "public"."bookmarks" to "service_role";

grant select on table "public"."moderation_actions" to "authenticated";

grant delete on table "public"."moderation_actions" to "service_role";

grant insert on table "public"."moderation_actions" to "service_role";

grant references on table "public"."moderation_actions" to "service_role";

grant select on table "public"."moderation_actions" to "service_role";

grant trigger on table "public"."moderation_actions" to "service_role";

grant truncate on table "public"."moderation_actions" to "service_role";

grant update on table "public"."moderation_actions" to "service_role";

grant select on table "public"."post_contents" to "anon";

grant delete on table "public"."post_contents" to "authenticated";

grant insert on table "public"."post_contents" to "authenticated";

grant select on table "public"."post_contents" to "authenticated";

grant update on table "public"."post_contents" to "authenticated";

grant delete on table "public"."post_contents" to "service_role";

grant insert on table "public"."post_contents" to "service_role";

grant references on table "public"."post_contents" to "service_role";

grant select on table "public"."post_contents" to "service_role";

grant trigger on table "public"."post_contents" to "service_role";

grant truncate on table "public"."post_contents" to "service_role";

grant update on table "public"."post_contents" to "service_role";

grant select on table "public"."post_revisions" to "authenticated";

grant delete on table "public"."post_revisions" to "service_role";

grant insert on table "public"."post_revisions" to "service_role";

grant references on table "public"."post_revisions" to "service_role";

grant select on table "public"."post_revisions" to "service_role";

grant trigger on table "public"."post_revisions" to "service_role";

grant truncate on table "public"."post_revisions" to "service_role";

grant update on table "public"."post_revisions" to "service_role";

grant select on table "public"."reactions" to "anon";

grant delete on table "public"."reactions" to "authenticated";

grant insert on table "public"."reactions" to "authenticated";

grant select on table "public"."reactions" to "authenticated";

grant delete on table "public"."reactions" to "service_role";

grant insert on table "public"."reactions" to "service_role";

grant references on table "public"."reactions" to "service_role";

grant select on table "public"."reactions" to "service_role";

grant trigger on table "public"."reactions" to "service_role";

grant truncate on table "public"."reactions" to "service_role";

grant update on table "public"."reactions" to "service_role";

grant insert on table "public"."reports" to "authenticated";

grant select on table "public"."reports" to "authenticated";

grant update on table "public"."reports" to "authenticated";

grant delete on table "public"."reports" to "service_role";

grant insert on table "public"."reports" to "service_role";

grant references on table "public"."reports" to "service_role";

grant select on table "public"."reports" to "service_role";

grant trigger on table "public"."reports" to "service_role";

grant truncate on table "public"."reports" to "service_role";

grant update on table "public"."reports" to "service_role";


  create policy "attachments_owner_delete"
  on "public"."attachments"
  as permissive
  for delete
  to authenticated
using (((owner_id = app_private.current_user_id()) AND (post_id IS NULL)));



  create policy "attachments_owner_insert"
  on "public"."attachments"
  as permissive
  for insert
  to authenticated
with check (((owner_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "attachments_owner_or_reader"
  on "public"."attachments"
  as permissive
  for select
  to authenticated
using (((owner_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text) OR ((status = 'ready'::public.attachment_status) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = attachments.post_id) AND (p.status = 'published'::public.post_status)))))));



  create policy "attachments_owner_update"
  on "public"."attachments"
  as permissive
  for update
  to authenticated
using (((owner_id = app_private.current_user_id()) AND (post_id IS NULL)))
with check ((owner_id = app_private.current_user_id()));



  create policy "auth_provider_links_owner_or_admin_read"
  on "public"."auth_provider_links"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('member.manage'::text)));



  create policy "bookmarks_owner_all"
  on "public"."bookmarks"
  as permissive
  for all
  to authenticated
using ((user_id = app_private.current_user_id()))
with check (((user_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "moderation_actions_moderator_read"
  on "public"."moderation_actions"
  as permissive
  for select
  to authenticated
using (app_private.has_permission('content.moderate'::text));



  create policy "post_contents_owner_write"
  on "public"."post_contents"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_contents.post_id) AND ((p.author_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text))))))
with check ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_contents.post_id) AND ((p.author_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text))))));



  create policy "post_contents_select_with_post"
  on "public"."post_contents"
  as permissive
  for select
  to anon, authenticated
using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE (p.id = post_contents.post_id))));



  create policy "post_revisions_owner_or_moderator"
  on "public"."post_revisions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_revisions.post_id) AND ((p.author_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text))))));



  create policy "reactions_owner_delete"
  on "public"."reactions"
  as permissive
  for delete
  to authenticated
using ((user_id = app_private.current_user_id()));



  create policy "reactions_owner_insert"
  on "public"."reactions"
  as permissive
  for insert
  to authenticated
with check (((user_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "reactions_public_read"
  on "public"."reactions"
  as permissive
  for select
  to anon, authenticated
using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = reactions.post_id) AND (p.status = 'published'::public.post_status)))));



  create policy "reports_moderator_update"
  on "public"."reports"
  as permissive
  for update
  to authenticated
using (app_private.has_permission('content.moderate'::text))
with check (app_private.has_permission('content.moderate'::text));



  create policy "reports_owner_insert"
  on "public"."reports"
  as permissive
  for insert
  to authenticated
with check (((reporter_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "reports_owner_or_moderator_read"
  on "public"."reports"
  as permissive
  for select
  to authenticated
using (((reporter_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text)));



  create policy "post_attachments_delete_pending_owner"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'post-attachments'::text) AND (owner_id = (app_private.current_user_id())::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.attachments a
  WHERE ((a.bucket_id = objects.bucket_id) AND (a.object_path = objects.name) AND (a.post_id IS NOT NULL)))))));



  create policy "post_attachments_insert_owner"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'post-attachments'::text) AND ((storage.foldername(name))[1] = (app_private.current_user_id())::text) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "post_attachments_select_owner_or_reader"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'post-attachments'::text) AND ((owner_id = (app_private.current_user_id())::text) OR app_private.has_permission('content.moderate'::text) OR (EXISTS ( SELECT 1
   FROM (public.attachments a
     JOIN public.posts p ON ((p.id = a.post_id)))
  WHERE ((a.bucket_id = objects.bucket_id) AND (a.object_path = objects.name) AND (a.status = 'ready'::public.attachment_status) AND (p.status = 'published'::public.post_status)))))));


-- The Supabase migration generator materializes default table privileges before
-- the declarative allowlist in 90_grants_roles.sql. Re-apply the same least-
-- privilege boundary so a migration reset and declarative schema load converge.
revoke all on table
  public.attachments,
  public.auth_provider_links,
  public.bookmarks,
  public.moderation_actions,
  public.post_contents,
  public.post_revisions,
  public.reactions,
  public.reports
from anon, authenticated;

grant select on public.post_contents, public.reactions to anon;
grant select, insert, update, delete on public.post_contents to authenticated;
grant select on public.post_revisions to authenticated;
grant select, insert, delete on public.reactions, public.bookmarks to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.moderation_actions, public.auth_provider_links to authenticated;

-- PostgreSQL grants PUBLIC EXECUTE to new functions by default, and the
-- migration generator does not preserve every declarative function ACL.
-- Close both exposed schemas after every Gate 4 function exists, then restore
-- only the browser/RLS helper allowlists.
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

-- Custom LOGIN-role grants are also outside the migration generator's normal
-- schema diff. Keep the server adapter on an exact Gate 4 function allowlist.
grant execute on function
  app_private.unsuspend_member(uuid, text, text, text),
  app_private.withdraw_member(uuid, text, text, text),
  app_private.set_member_role(uuid, text, text, text, text),
  app_private.reject_grade_application(uuid, text, text, text),
  app_private.reject_badge_application(uuid, text, text, text),
  app_private.consume_api_rate_limit(text, text, integer, integer),
  app_private.search_content(text, integer, text),
  app_private.moderate_content(text, uuid, public.moderation_action_type, text, text, text),
  app_private.list_reports(integer, text),
  app_private.resolve_report(uuid, text, text, text),
  app_private.disable_service_account(uuid, text, text, text),
  app_private.reconcile_auth_provider_links_all(text)
to app_authenticator;
