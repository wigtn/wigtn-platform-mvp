create type "public"."grade_application_status" as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled');


  create table "public"."consent_documents" (
    "id" uuid not null default gen_random_uuid(),
    "kind" text not null,
    "version" integer not null,
    "title" text not null,
    "content_url" text not null,
    "is_required" boolean not null default true,
    "published_at" timestamp with time zone not null default now(),
    "retired_at" timestamp with time zone
      );


alter table "public"."consent_documents" enable row level security;


  create table "public"."grade_application_documents" (
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


alter table "public"."grade_application_documents" enable row level security;


  create table "public"."grade_applications" (
    "id" uuid not null,
    "user_id" uuid not null,
    "grade_id" uuid not null,
    "grade_config_version" integer not null,
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


alter table "public"."grade_applications" enable row level security;


  create table "public"."membership_grades" (
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


alter table "public"."membership_grades" enable row level security;


  create table "public"."user_consents" (
    "user_id" uuid not null,
    "document_id" uuid not null,
    "accepted_at" timestamp with time zone not null default now(),
    "evidence" jsonb not null default '{}'::jsonb
      );


alter table "public"."user_consents" enable row level security;


  create table "public"."user_membership_grades" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "grade_id" uuid not null,
    "application_id" uuid not null,
    "granted_at" timestamp with time zone not null default now(),
    "granted_by" uuid,
    "revoked_at" timestamp with time zone,
    "revoked_by" uuid
      );


alter table "public"."user_membership_grades" enable row level security;

-- 새 테이블 생성 시 Supabase 기본 privilege를 먼저 모두 회수한다.
-- RLS가 막지 못하는 TRUNCATE까지 포함하므로 allowlist grant보다 반드시 앞서야 한다.
revoke all on table public.consent_documents from anon, authenticated;
revoke all on table public.grade_application_documents from anon, authenticated;
revoke all on table public.grade_applications from anon, authenticated;
revoke all on table public.membership_grades from anon, authenticated;
revoke all on table public.user_consents from anon, authenticated;
revoke all on table public.user_membership_grades from anon, authenticated;

CREATE UNIQUE INDEX consent_documents_kind_version_key ON public.consent_documents USING btree (kind, version);

CREATE UNIQUE INDEX consent_documents_pkey ON public.consent_documents USING btree (id);

CREATE INDEX grade_application_documents_application_idx ON public.grade_application_documents USING btree (application_id);

CREATE UNIQUE INDEX grade_application_documents_bucket_id_object_path_key ON public.grade_application_documents USING btree (bucket_id, object_path);

CREATE UNIQUE INDEX grade_application_documents_pkey ON public.grade_application_documents USING btree (id);

CREATE UNIQUE INDEX grade_applications_pkey ON public.grade_applications USING btree (id);

CREATE INDEX grade_applications_review_queue_idx ON public.grade_applications USING btree (status, submitted_at) WHERE (status = ANY (ARRAY['submitted'::public.grade_application_status, 'under_review'::public.grade_application_status]));

CREATE UNIQUE INDEX grade_applications_user_id_submit_idempotency_key_key ON public.grade_applications USING btree (user_id, submit_idempotency_key);

CREATE INDEX grade_applications_user_idx ON public.grade_applications USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX membership_grades_key_version_key ON public.membership_grades USING btree (key, version);

CREATE UNIQUE INDEX membership_grades_pkey ON public.membership_grades USING btree (id);

CREATE UNIQUE INDEX user_consents_pkey ON public.user_consents USING btree (user_id, document_id);

CREATE INDEX user_consents_user_idx ON public.user_consents USING btree (user_id, accepted_at DESC);

CREATE UNIQUE INDEX user_membership_grades_application_id_key ON public.user_membership_grades USING btree (application_id);

CREATE UNIQUE INDEX user_membership_grades_one_active_idx ON public.user_membership_grades USING btree (user_id) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX user_membership_grades_pkey ON public.user_membership_grades USING btree (id);

alter table "public"."consent_documents" add constraint "consent_documents_pkey" PRIMARY KEY using index "consent_documents_pkey";

alter table "public"."grade_application_documents" add constraint "grade_application_documents_pkey" PRIMARY KEY using index "grade_application_documents_pkey";

alter table "public"."grade_applications" add constraint "grade_applications_pkey" PRIMARY KEY using index "grade_applications_pkey";

alter table "public"."membership_grades" add constraint "membership_grades_pkey" PRIMARY KEY using index "membership_grades_pkey";

alter table "public"."user_consents" add constraint "user_consents_pkey" PRIMARY KEY using index "user_consents_pkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_pkey" PRIMARY KEY using index "user_membership_grades_pkey";

alter table "public"."consent_documents" add constraint "consent_documents_kind_version_key" UNIQUE using index "consent_documents_kind_version_key";

alter table "public"."consent_documents" add constraint "consent_documents_version_check" CHECK ((version > 0)) not valid;

alter table "public"."consent_documents" validate constraint "consent_documents_version_check";

alter table "public"."grade_application_documents" add constraint "grade_application_documents_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.grade_applications(id) ON DELETE CASCADE not valid;

alter table "public"."grade_application_documents" validate constraint "grade_application_documents_application_id_fkey";

alter table "public"."grade_application_documents" add constraint "grade_application_documents_bucket_id_object_path_key" UNIQUE using index "grade_application_documents_bucket_id_object_path_key";

alter table "public"."grade_application_documents" add constraint "grade_application_documents_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."grade_application_documents" validate constraint "grade_application_documents_owner_id_fkey";

alter table "public"."grade_application_documents" add constraint "grade_application_documents_size_bytes_check" CHECK (((size_bytes > 0) AND (size_bytes <= 10485760))) not valid;

alter table "public"."grade_application_documents" validate constraint "grade_application_documents_size_bytes_check";

alter table "public"."grade_applications" add constraint "grade_applications_grade_id_fkey" FOREIGN KEY (grade_id) REFERENCES public.membership_grades(id) not valid;

alter table "public"."grade_applications" validate constraint "grade_applications_grade_id_fkey";

alter table "public"."grade_applications" add constraint "grade_applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) not valid;

alter table "public"."grade_applications" validate constraint "grade_applications_reviewed_by_fkey";

alter table "public"."grade_applications" add constraint "grade_applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."grade_applications" validate constraint "grade_applications_user_id_fkey";

alter table "public"."grade_applications" add constraint "grade_applications_user_id_submit_idempotency_key_key" UNIQUE using index "grade_applications_user_id_submit_idempotency_key_key";

alter table "public"."membership_grades" add constraint "membership_grades_approval_mode_check" CHECK ((approval_mode = ANY (ARRAY['automatic'::text, 'manual'::text]))) not valid;

alter table "public"."membership_grades" validate constraint "membership_grades_approval_mode_check";

alter table "public"."membership_grades" add constraint "membership_grades_key_version_key" UNIQUE using index "membership_grades_key_version_key";

alter table "public"."membership_grades" add constraint "membership_grades_version_check" CHECK ((version > 0)) not valid;

alter table "public"."membership_grades" validate constraint "membership_grades_version_check";

alter table "public"."user_consents" add constraint "user_consents_document_id_fkey" FOREIGN KEY (document_id) REFERENCES public.consent_documents(id) not valid;

alter table "public"."user_consents" validate constraint "user_consents_document_id_fkey";

alter table "public"."user_consents" add constraint "user_consents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."user_consents" validate constraint "user_consents_user_id_fkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.grade_applications(id) not valid;

alter table "public"."user_membership_grades" validate constraint "user_membership_grades_application_id_fkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_application_id_key" UNIQUE using index "user_membership_grades_application_id_key";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_grade_id_fkey" FOREIGN KEY (grade_id) REFERENCES public.membership_grades(id) not valid;

alter table "public"."user_membership_grades" validate constraint "user_membership_grades_grade_id_fkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_membership_grades" validate constraint "user_membership_grades_granted_by_fkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_membership_grades" validate constraint "user_membership_grades_revoked_by_fkey";

alter table "public"."user_membership_grades" add constraint "user_membership_grades_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."user_membership_grades" validate constraint "user_membership_grades_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.current_claims()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$function$
;

CREATE OR REPLACE FUNCTION app_private.handle_auth_user_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.has_current_required_consents(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.has_recent_totp(p_max_age interval DEFAULT '00:10:00'::interval, p_clock_skew interval DEFAULT '00:01:00'::interval)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app_private.current_session_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.complete_member_onboarding(p_handle text, p_display_name text, p_consent_document_ids uuid[], p_trace_id text DEFAULT NULL::text)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_grade_application(p_application_id uuid, p_grade_id uuid, p_form_data jsonb, p_evidence jsonb, p_idempotency_key text, p_trace_id text DEFAULT NULL::text)
 RETURNS public.grade_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_current_user(p_confirmation text, p_trace_id text DEFAULT NULL::text)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

grant select on table "public"."consent_documents" to "anon";

grant select on table "public"."consent_documents" to "authenticated";

grant delete on table "public"."consent_documents" to "service_role";

grant insert on table "public"."consent_documents" to "service_role";

grant references on table "public"."consent_documents" to "service_role";

grant select on table "public"."consent_documents" to "service_role";

grant trigger on table "public"."consent_documents" to "service_role";

grant truncate on table "public"."consent_documents" to "service_role";

grant update on table "public"."consent_documents" to "service_role";

grant select on table "public"."grade_application_documents" to "authenticated";

grant delete on table "public"."grade_application_documents" to "service_role";

grant insert on table "public"."grade_application_documents" to "service_role";

grant references on table "public"."grade_application_documents" to "service_role";

grant select on table "public"."grade_application_documents" to "service_role";

grant trigger on table "public"."grade_application_documents" to "service_role";

grant truncate on table "public"."grade_application_documents" to "service_role";

grant update on table "public"."grade_application_documents" to "service_role";

grant select on table "public"."grade_applications" to "authenticated";

grant delete on table "public"."grade_applications" to "service_role";

grant insert on table "public"."grade_applications" to "service_role";

grant references on table "public"."grade_applications" to "service_role";

grant select on table "public"."grade_applications" to "service_role";

grant trigger on table "public"."grade_applications" to "service_role";

grant truncate on table "public"."grade_applications" to "service_role";

grant update on table "public"."grade_applications" to "service_role";

grant select on table "public"."membership_grades" to "anon";

grant select on table "public"."membership_grades" to "authenticated";

grant delete on table "public"."membership_grades" to "service_role";

grant insert on table "public"."membership_grades" to "service_role";

grant references on table "public"."membership_grades" to "service_role";

grant select on table "public"."membership_grades" to "service_role";

grant trigger on table "public"."membership_grades" to "service_role";

grant truncate on table "public"."membership_grades" to "service_role";

grant update on table "public"."membership_grades" to "service_role";

grant select on table "public"."user_consents" to "authenticated";

grant delete on table "public"."user_consents" to "service_role";

grant insert on table "public"."user_consents" to "service_role";

grant references on table "public"."user_consents" to "service_role";

grant select on table "public"."user_consents" to "service_role";

grant trigger on table "public"."user_consents" to "service_role";

grant truncate on table "public"."user_consents" to "service_role";

grant update on table "public"."user_consents" to "service_role";

grant select on table "public"."user_membership_grades" to "authenticated";

grant delete on table "public"."user_membership_grades" to "service_role";

grant insert on table "public"."user_membership_grades" to "service_role";

grant references on table "public"."user_membership_grades" to "service_role";

grant select on table "public"."user_membership_grades" to "service_role";

grant trigger on table "public"."user_membership_grades" to "service_role";

grant truncate on table "public"."user_membership_grades" to "service_role";

grant update on table "public"."user_membership_grades" to "service_role";


  create policy "consent_documents_current_read"
  on "public"."consent_documents"
  as permissive
  for select
  to anon, authenticated
using (((published_at <= now()) AND ((retired_at IS NULL) OR (retired_at > now()))));



  create policy "grade_documents_owner_or_reviewer_read"
  on "public"."grade_application_documents"
  as permissive
  for select
  to authenticated
using (((owner_id = app_private.current_user_id()) OR app_private.has_permission('grade.approve'::text)));



  create policy "grade_applications_owner_or_reviewer_read"
  on "public"."grade_applications"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('grade.approve'::text)));



  create policy "membership_grades_active_read"
  on "public"."membership_grades"
  as permissive
  for select
  to anon, authenticated
using ((is_active OR app_private.has_permission('grade.approve'::text)));



  create policy "user_consents_self_read"
  on "public"."user_consents"
  as permissive
  for select
  to authenticated
using ((user_id = app_private.current_user_id()));



  create policy "user_membership_grades_read"
  on "public"."user_membership_grades"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('grade.approve'::text)));


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.handle_auth_user_created();


  create policy "grade_evidence_delete_owner_before_review"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'grade-evidence'::text) AND (owner_id = (app_private.current_user_id())::text) AND (NOT (EXISTS ( SELECT 1
   FROM (public.grade_application_documents d
     JOIN public.grade_applications a ON ((a.id = d.application_id)))
  WHERE ((d.bucket_id = objects.bucket_id) AND (d.object_path = objects.name) AND (a.status = ANY (ARRAY['submitted'::public.grade_application_status, 'under_review'::public.grade_application_status, 'approved'::public.grade_application_status]))))))));



  create policy "grade_evidence_insert_owner"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'grade-evidence'::text) AND ((storage.foldername(name))[1] = (app_private.current_user_id())::text) AND app_private.current_account_active()));



  create policy "grade_evidence_select_owner_or_reviewer"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'grade-evidence'::text) AND ((owner_id = (app_private.current_user_id())::text) OR app_private.has_permission('grade.approve'::text))));


-- db diff는 함수 EXECUTE allowlist를 안정적으로 보존하지 않으므로 수동 검토로 명시한다.
-- public 함수의 기본 PUBLIC EXECUTE를 닫지 않으면 anon이 SECURITY DEFINER 명령을 호출할 수 있다.
revoke all on function app_private.current_claims() from public;
revoke all on function app_private.handle_auth_user_created() from public;
revoke all on function app_private.has_current_required_consents(uuid) from public;
revoke all on function app_private.has_recent_totp(interval, interval) from public;
revoke all on function app_private.current_session_active() from public;
grant execute on function app_private.current_claims() to authenticated;
grant execute on function app_private.has_current_required_consents(uuid) to authenticated;
grant execute on function app_private.has_recent_totp(interval, interval) to authenticated;

revoke all on function public.complete_member_onboarding(text, text, uuid[], text) from public;
revoke all on function public.submit_grade_application(uuid, uuid, jsonb, jsonb, text, text) from public;
revoke all on function app_private.approve_grade_application(uuid, text, text, text) from public;
revoke all on function public.withdraw_current_user(text, text) from public;
grant execute on function public.complete_member_onboarding(text, text, uuid[], text) to authenticated;
grant execute on function public.submit_grade_application(uuid, uuid, jsonb, jsonb, text, text) to authenticated;
grant usage on schema app_private to app_authenticator;
grant execute on function app_private.approve_grade_application(uuid, text, text, text) to app_authenticator;
grant execute on function public.withdraw_current_user(text, text) to authenticated;
