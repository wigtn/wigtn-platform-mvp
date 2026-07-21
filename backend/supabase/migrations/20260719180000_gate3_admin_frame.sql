
  create table "app_private"."admin_command_receipts" (
    "actor_id" uuid not null,
    "tool_name" text not null,
    "idempotency_key" text not null,
    "resource_id" uuid not null,
    "response" jsonb not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."badge_application_documents" (
    "id" uuid not null default gen_random_uuid(),
    "application_id" uuid not null,
    "owner_id" uuid not null,
    "bucket_id" text not null,
    "object_path" text not null,
    "original_name" text not null,
    "mime_type" text not null,
    "size_bytes" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."badge_application_documents" enable row level security;


  create table "public"."badge_applications" (
    "id" uuid not null,
    "user_id" uuid not null,
    "badge_id" uuid not null,
    "badge_config_version" integer not null,
    "status" public.grade_application_status not null default 'draft'::public.grade_application_status,
    "form_data" jsonb not null default '{}'::jsonb,
    "submit_idempotency_key" text not null,
    "submitted_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" uuid,
    "review_note" text,
    "review_idempotency_key" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."badge_applications" enable row level security;


  create table "public"."membership_badges" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "version" integer not null,
    "title" text not null,
    "description" text not null default ''::text,
    "application_schema" jsonb not null default '{}'::jsonb,
    "required_evidence" jsonb not null default '[]'::jsonb,
    "approval_mode" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."membership_badges" enable row level security;


  create table "public"."user_badges" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "badge_id" uuid not null,
    "application_id" uuid,
    "granted_at" timestamp with time zone not null default now(),
    "granted_by" uuid,
    "revoked_at" timestamp with time zone,
    "revoked_by" uuid,
    "revoke_reason" text,
    "revoke_idempotency_key" text
      );


alter table "public"."user_badges" enable row level security;

CREATE UNIQUE INDEX admin_command_receipts_pkey ON app_private.admin_command_receipts USING btree (actor_id, tool_name, idempotency_key);

CREATE INDEX badge_application_documents_application_idx ON public.badge_application_documents USING btree (application_id);

CREATE UNIQUE INDEX badge_application_documents_bucket_id_object_path_key ON public.badge_application_documents USING btree (bucket_id, object_path);

CREATE UNIQUE INDEX badge_application_documents_pkey ON public.badge_application_documents USING btree (id);

CREATE UNIQUE INDEX badge_applications_pkey ON public.badge_applications USING btree (id);

CREATE INDEX badge_applications_review_queue_idx ON public.badge_applications USING btree (status, submitted_at) WHERE (status = ANY (ARRAY['submitted'::public.grade_application_status, 'under_review'::public.grade_application_status]));

CREATE UNIQUE INDEX badge_applications_user_id_submit_idempotency_key_key ON public.badge_applications USING btree (user_id, submit_idempotency_key);

CREATE INDEX badge_applications_user_idx ON public.badge_applications USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX membership_badges_key_version_key ON public.membership_badges USING btree (key, version);

CREATE UNIQUE INDEX membership_badges_pkey ON public.membership_badges USING btree (id);

CREATE UNIQUE INDEX user_badges_one_active_badge_idx ON public.user_badges USING btree (user_id, badge_id) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX user_badges_pkey ON public.user_badges USING btree (id);

alter table "app_private"."admin_command_receipts" add constraint "admin_command_receipts_pkey" PRIMARY KEY using index "admin_command_receipts_pkey";

alter table "public"."badge_application_documents" add constraint "badge_application_documents_pkey" PRIMARY KEY using index "badge_application_documents_pkey";

alter table "public"."badge_applications" add constraint "badge_applications_pkey" PRIMARY KEY using index "badge_applications_pkey";

alter table "public"."membership_badges" add constraint "membership_badges_pkey" PRIMARY KEY using index "membership_badges_pkey";

alter table "public"."user_badges" add constraint "user_badges_pkey" PRIMARY KEY using index "user_badges_pkey";

alter table "app_private"."admin_command_receipts" add constraint "admin_command_receipts_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "app_private"."admin_command_receipts" validate constraint "admin_command_receipts_actor_id_fkey";

alter table "public"."badge_application_documents" add constraint "badge_application_documents_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.badge_applications(id) ON DELETE CASCADE not valid;

alter table "public"."badge_application_documents" validate constraint "badge_application_documents_application_id_fkey";

alter table "public"."badge_application_documents" add constraint "badge_application_documents_bucket_id_object_path_key" UNIQUE using index "badge_application_documents_bucket_id_object_path_key";

alter table "public"."badge_application_documents" add constraint "badge_application_documents_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."badge_application_documents" validate constraint "badge_application_documents_owner_id_fkey";

alter table "public"."badge_application_documents" add constraint "badge_application_documents_size_bytes_check" CHECK (((size_bytes > 0) AND (size_bytes <= 10485760))) not valid;

alter table "public"."badge_application_documents" validate constraint "badge_application_documents_size_bytes_check";

alter table "public"."badge_applications" add constraint "badge_applications_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES public.membership_badges(id) not valid;

alter table "public"."badge_applications" validate constraint "badge_applications_badge_id_fkey";

alter table "public"."badge_applications" add constraint "badge_applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) not valid;

alter table "public"."badge_applications" validate constraint "badge_applications_reviewed_by_fkey";

alter table "public"."badge_applications" add constraint "badge_applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."badge_applications" validate constraint "badge_applications_user_id_fkey";

alter table "public"."badge_applications" add constraint "badge_applications_user_id_submit_idempotency_key_key" UNIQUE using index "badge_applications_user_id_submit_idempotency_key_key";

alter table "public"."membership_badges" add constraint "membership_badges_approval_mode_check" CHECK ((approval_mode = ANY (ARRAY['automatic'::text, 'manual'::text]))) not valid;

alter table "public"."membership_badges" validate constraint "membership_badges_approval_mode_check";

alter table "public"."membership_badges" add constraint "membership_badges_key_version_key" UNIQUE using index "membership_badges_key_version_key";

alter table "public"."membership_badges" add constraint "membership_badges_version_check" CHECK ((version > 0)) not valid;

alter table "public"."membership_badges" validate constraint "membership_badges_version_check";

alter table "public"."user_badges" add constraint "user_badges_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.badge_applications(id) not valid;

alter table "public"."user_badges" validate constraint "user_badges_application_id_fkey";

alter table "public"."user_badges" add constraint "user_badges_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES public.membership_badges(id) not valid;

alter table "public"."user_badges" validate constraint "user_badges_badge_id_fkey";

alter table "public"."user_badges" add constraint "user_badges_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_badges" validate constraint "user_badges_granted_by_fkey";

alter table "public"."user_badges" add constraint "user_badges_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_badges" validate constraint "user_badges_revoked_by_fkey";

alter table "public"."user_badges" add constraint "user_badges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."user_badges" validate constraint "user_badges_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.approve_badge_application(p_application_id uuid, p_review_note text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.assert_admin_tool_access(p_permission text, p_require_step_up boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.current_admin_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.list_active_badges(p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.list_badge_applications(p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.list_grade_applications(p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.outbox_progress(p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.revoke_user_badge(p_user_badge_id uuid, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.search_members(p_query text DEFAULT ''::text, p_limit integer DEFAULT 50, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.suspend_member(p_user_id uuid, p_reason text, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_badge_application(p_application_id uuid, p_badge_id uuid, p_form_data jsonb, p_evidence jsonb, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS public.badge_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.approve_grade_application(p_application_id uuid, p_idempotency_key text, p_review_note text DEFAULT NULL::text, p_trace_id text DEFAULT NULL::text)
 RETURNS public.grade_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

grant select on table "public"."badge_application_documents" to "authenticated";

grant delete on table "public"."badge_application_documents" to "service_role";

grant insert on table "public"."badge_application_documents" to "service_role";

grant references on table "public"."badge_application_documents" to "service_role";

grant select on table "public"."badge_application_documents" to "service_role";

grant trigger on table "public"."badge_application_documents" to "service_role";

grant truncate on table "public"."badge_application_documents" to "service_role";

grant update on table "public"."badge_application_documents" to "service_role";

grant select on table "public"."badge_applications" to "authenticated";

grant delete on table "public"."badge_applications" to "service_role";

grant insert on table "public"."badge_applications" to "service_role";

grant references on table "public"."badge_applications" to "service_role";

grant select on table "public"."badge_applications" to "service_role";

grant trigger on table "public"."badge_applications" to "service_role";

grant truncate on table "public"."badge_applications" to "service_role";

grant update on table "public"."badge_applications" to "service_role";

grant select on table "public"."membership_badges" to "anon";

grant select on table "public"."membership_badges" to "authenticated";

grant delete on table "public"."membership_badges" to "service_role";

grant insert on table "public"."membership_badges" to "service_role";

grant references on table "public"."membership_badges" to "service_role";

grant select on table "public"."membership_badges" to "service_role";

grant trigger on table "public"."membership_badges" to "service_role";

grant truncate on table "public"."membership_badges" to "service_role";

grant update on table "public"."membership_badges" to "service_role";

grant select on table "public"."user_badges" to "authenticated";

grant delete on table "public"."user_badges" to "service_role";

grant insert on table "public"."user_badges" to "service_role";

grant references on table "public"."user_badges" to "service_role";

grant select on table "public"."user_badges" to "service_role";

grant trigger on table "public"."user_badges" to "service_role";

grant truncate on table "public"."user_badges" to "service_role";

grant update on table "public"."user_badges" to "service_role";


  create policy "badge_documents_owner_or_reviewer_read"
  on "public"."badge_application_documents"
  as permissive
  for select
  to authenticated
using (((owner_id = app_private.current_user_id()) OR app_private.has_permission('badge.approve'::text)));



  create policy "badge_applications_owner_or_reviewer_read"
  on "public"."badge_applications"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('badge.approve'::text)));



  create policy "membership_badges_active_read"
  on "public"."membership_badges"
  as permissive
  for select
  to anon, authenticated
using ((is_active OR app_private.has_permission('badge.approve'::text)));



  create policy "user_badges_owner_or_reviewer_read"
  on "public"."user_badges"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('badge.approve'::text) OR app_private.has_permission('badge.revoke'::text)));



  create policy "badge_evidence_delete_owner_before_review"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'badge-evidence'::text) AND (owner_id = (app_private.current_user_id())::text) AND (NOT (EXISTS ( SELECT 1
   FROM (public.badge_application_documents d
     JOIN public.badge_applications a ON ((a.id = d.application_id)))
  WHERE ((d.bucket_id = objects.bucket_id) AND (d.object_path = objects.name) AND (a.status = ANY (ARRAY['submitted'::public.grade_application_status, 'under_review'::public.grade_application_status, 'approved'::public.grade_application_status]))))))));



  create policy "badge_evidence_insert_owner"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'badge-evidence'::text) AND ((storage.foldername(name))[1] = (app_private.current_user_id())::text) AND app_private.current_account_active()));



  create policy "badge_evidence_select_owner_or_reviewer"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'badge-evidence'::text) AND ((owner_id = (app_private.current_user_id())::text) OR app_private.has_permission('badge.approve'::text))));

-- Declarative diff는 default privilege와 함수 EXECUTE를 완전하게 보존하지 못하므로
-- Gate 3 신규 객체의 최소 권한을 명시적으로 다시 고정한다.
revoke all on table app_private.admin_command_receipts from public, anon, authenticated, app_authenticator;
revoke all on table public.membership_badges, public.badge_applications,
  public.badge_application_documents, public.user_badges from anon, authenticated;
grant select on table public.membership_badges to anon, authenticated;
grant select on table public.badge_applications, public.badge_application_documents,
  public.user_badges to authenticated;

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
revoke all on function public.submit_badge_application(uuid, uuid, jsonb, jsonb, text, text) from public;

grant execute on function public.submit_badge_application(uuid, uuid, jsonb, jsonb, text, text)
  to authenticated;
grant execute on function app_private.current_admin_context(),
  app_private.search_members(text, integer, text),
  app_private.list_grade_applications(integer, text),
  app_private.list_badge_applications(integer, text),
  app_private.list_active_badges(integer, text),
  app_private.outbox_progress(text),
  app_private.suspend_member(uuid, text, text, text),
  app_private.approve_badge_application(uuid, text, text, text),
  app_private.revoke_user_badge(uuid, text, text, text)
  to app_authenticator;

-- Gate 3 outbox runner: 지원하는 event type만 claim하고 전용 role로 실행한다.
drop function app_private.claim_outbox_batch(text, integer, interval);

create function app_private.claim_outbox_batch(
  p_worker text,
  p_batch integer default 10,
  p_lease interval default interval '30 seconds',
  p_types text[] default null
)
returns setof public.outbox_events
language sql
security definer
set search_path = ''
as $$
  update public.outbox_events o
  set status = 'claimed',
      claimed_by = p_worker,
      claimed_at = now(),
      lease_expires_at = now() + p_lease,
      attempt_count = o.attempt_count + 1
  where o.id in (
    select id
    from public.outbox_events
    where status in ('pending', 'claimed')
      and process_after <= now()
      and (lease_expires_at is null or lease_expires_at < now())
      and (p_types is null or type = any(p_types))
    order by process_after
    for update skip locked
    limit greatest(p_batch, 0)
  )
  returning o.*;
$$;

revoke all on function app_private.claim_outbox_batch(text, integer, interval, text[]) from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'outbox_worker') then
    -- 원격 migration에는 정적 자격증명을 두지 않는다. 배포 provisioning 또는
    -- 로컬 seed가 환경별 LOGIN/password를 설정한다.
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
alter role outbox_worker set search_path = public, extensions;
