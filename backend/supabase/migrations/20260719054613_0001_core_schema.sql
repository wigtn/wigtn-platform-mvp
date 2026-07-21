create extension if not exists "citext" with schema "extensions";

create extension if not exists "pg_trgm" with schema "extensions";

create schema if not exists "app_private";

create type "public"."account_status" as enum ('pending_verification', 'active', 'suspended', 'withdrawn');

create type "public"."outbox_status" as enum ('pending', 'claimed', 'done', 'dead');

create type "public"."post_status" as enum ('draft', 'published', 'hidden', 'deleted');

create type "public"."service_account_status" as enum ('active', 'disabled');


  create table "public"."account_state_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "from_status" public.account_status,
    "to_status" public.account_status not null,
    "reason_code" text not null,
    "operator_note" text,
    "actor_id" uuid,
    "occurred_at" timestamp with time zone not null default now()
      );


alter table "public"."account_state_events" enable row level security;


  create table "public"."audit_events" (
    "id" uuid not null default gen_random_uuid(),
    "occurred_at" timestamp with time zone not null default now(),
    "trace_id" text,
    "actor_type" text not null,
    "actor_id" uuid,
    "actor_role_snapshot" text,
    "action" text not null,
    "resource_type" text not null,
    "resource_id" uuid,
    "outcome" text not null,
    "reason_code" text,
    "before_redacted" jsonb,
    "after_redacted" jsonb,
    "ip_hash" text,
    "user_agent_summary" text,
    "tool_id" text,
    "tool_version" integer
      );


alter table "public"."audit_events" enable row level security;


  create table "public"."boards" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "title" text not null,
    "is_active" boolean not null default true,
    "ai_reply_enabled" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."boards" enable row level security;


  create table "public"."comments" (
    "id" uuid not null default gen_random_uuid(),
    "post_id" uuid not null,
    "board_id" uuid not null,
    "author_id" uuid not null,
    "parent_id" uuid,
    "body" text not null,
    "is_deleted" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."comments" enable row level security;


  create table "public"."consumed_events" (
    "consumer" text not null,
    "event_id" uuid not null,
    "consumed_at" timestamp with time zone not null default now()
      );


alter table "public"."consumed_events" enable row level security;


  create table "public"."outbox_events" (
    "id" uuid not null default gen_random_uuid(),
    "type" text not null,
    "spec_version" integer not null default 1,
    "occurred_at" timestamp with time zone not null default now(),
    "trace_id" text,
    "actor" jsonb not null default '{}'::jsonb,
    "subject" jsonb not null default '{}'::jsonb,
    "data" jsonb not null default '{}'::jsonb,
    "status" public.outbox_status not null default 'pending'::public.outbox_status,
    "process_after" timestamp with time zone not null default now(),
    "claimed_by" text,
    "claimed_at" timestamp with time zone,
    "lease_expires_at" timestamp with time zone,
    "attempt_count" integer not null default 0,
    "max_attempts" integer not null default 8,
    "last_error" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."outbox_events" enable row level security;


  create table "public"."permissions" (
    "key" text not null,
    "description" text not null default ''::text
      );


alter table "public"."permissions" enable row level security;


  create table "public"."posts" (
    "id" uuid not null default gen_random_uuid(),
    "board_id" uuid not null,
    "author_id" uuid not null,
    "title" text not null,
    "body" text not null default ''::text,
    "status" public.post_status not null default 'published'::public.post_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."posts" enable row level security;


  create table "public"."profiles" (
    "user_id" uuid not null,
    "handle" extensions.citext,
    "display_name" text not null default ''::text,
    "account_status" public.account_status not null default 'pending_verification'::public.account_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."role_permissions" (
    "role_id" uuid not null,
    "permission_key" text not null
      );


alter table "public"."role_permissions" enable row level security;


  create table "public"."service_account_boards" (
    "service_account_id" uuid not null,
    "board_id" uuid not null
      );


alter table "public"."service_account_boards" enable row level security;


  create table "public"."service_accounts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "label" text not null,
    "status" public.service_account_status not null default 'active'::public.service_account_status,
    "allowed_reply_create" boolean not null default true,
    "disabled_at" timestamp with time zone,
    "disabled_reason" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."service_accounts" enable row level security;


  create table "public"."system_roles" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "title" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."system_roles" enable row level security;


  create table "public"."user_roles" (
    "user_id" uuid not null,
    "role_id" uuid not null,
    "granted_at" timestamp with time zone not null default now(),
    "granted_by" uuid
      );


alter table "public"."user_roles" enable row level security;

CREATE UNIQUE INDEX account_state_events_pkey ON public.account_state_events USING btree (id);

CREATE INDEX account_state_events_user_idx ON public.account_state_events USING btree (user_id, occurred_at DESC);

CREATE INDEX audit_events_actor_idx ON public.audit_events USING btree (actor_id, occurred_at DESC);

CREATE UNIQUE INDEX audit_events_pkey ON public.audit_events USING btree (id);

CREATE INDEX audit_events_resource_idx ON public.audit_events USING btree (resource_type, resource_id, occurred_at DESC);

CREATE UNIQUE INDEX boards_pkey ON public.boards USING btree (id);

CREATE UNIQUE INDEX boards_slug_key ON public.boards USING btree (slug);

CREATE UNIQUE INDEX comments_pkey ON public.comments USING btree (id);

CREATE INDEX comments_post_idx ON public.comments USING btree (post_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX consumed_events_pkey ON public.consumed_events USING btree (consumer, event_id);

CREATE INDEX outbox_claimable_idx ON public.outbox_events USING btree (process_after) WHERE (status = ANY (ARRAY['pending'::public.outbox_status, 'claimed'::public.outbox_status]));

CREATE UNIQUE INDEX outbox_events_pkey ON public.outbox_events USING btree (id);

CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (key);

CREATE INDEX posts_author_idx ON public.posts USING btree (author_id);

CREATE INDEX posts_board_created_idx ON public.posts USING btree (board_id, created_at DESC, id DESC);

CREATE INDEX posts_body_trgm_idx ON public.posts USING gin (body extensions.gin_trgm_ops);

CREATE UNIQUE INDEX posts_pkey ON public.posts USING btree (id);

CREATE UNIQUE INDEX profiles_handle_key ON public.profiles USING btree (handle);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, permission_key);

CREATE UNIQUE INDEX service_account_boards_pkey ON public.service_account_boards USING btree (service_account_id, board_id);

CREATE UNIQUE INDEX service_accounts_pkey ON public.service_accounts USING btree (id);

CREATE UNIQUE INDEX service_accounts_user_id_key ON public.service_accounts USING btree (user_id);

CREATE UNIQUE INDEX system_roles_key_key ON public.system_roles USING btree (key);

CREATE UNIQUE INDEX system_roles_pkey ON public.system_roles USING btree (id);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (user_id, role_id);

alter table "public"."account_state_events" add constraint "account_state_events_pkey" PRIMARY KEY using index "account_state_events_pkey";

alter table "public"."audit_events" add constraint "audit_events_pkey" PRIMARY KEY using index "audit_events_pkey";

alter table "public"."boards" add constraint "boards_pkey" PRIMARY KEY using index "boards_pkey";

alter table "public"."comments" add constraint "comments_pkey" PRIMARY KEY using index "comments_pkey";

alter table "public"."consumed_events" add constraint "consumed_events_pkey" PRIMARY KEY using index "consumed_events_pkey";

alter table "public"."outbox_events" add constraint "outbox_events_pkey" PRIMARY KEY using index "outbox_events_pkey";

alter table "public"."permissions" add constraint "permissions_pkey" PRIMARY KEY using index "permissions_pkey";

alter table "public"."posts" add constraint "posts_pkey" PRIMARY KEY using index "posts_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."service_account_boards" add constraint "service_account_boards_pkey" PRIMARY KEY using index "service_account_boards_pkey";

alter table "public"."service_accounts" add constraint "service_accounts_pkey" PRIMARY KEY using index "service_accounts_pkey";

alter table "public"."system_roles" add constraint "system_roles_pkey" PRIMARY KEY using index "system_roles_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."account_state_events" add constraint "account_state_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) not valid;

alter table "public"."account_state_events" validate constraint "account_state_events_actor_id_fkey";

alter table "public"."account_state_events" add constraint "account_state_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."account_state_events" validate constraint "account_state_events_user_id_fkey";

alter table "public"."boards" add constraint "boards_slug_key" UNIQUE using index "boards_slug_key";

alter table "public"."comments" add constraint "comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) not valid;

alter table "public"."comments" validate constraint "comments_author_id_fkey";

alter table "public"."comments" add constraint "comments_board_id_fkey" FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE not valid;

alter table "public"."comments" validate constraint "comments_board_id_fkey";

alter table "public"."comments" add constraint "comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE not valid;

alter table "public"."comments" validate constraint "comments_parent_id_fkey";

alter table "public"."comments" add constraint "comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE not valid;

alter table "public"."comments" validate constraint "comments_post_id_fkey";

alter table "public"."posts" add constraint "posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) not valid;

alter table "public"."posts" validate constraint "posts_author_id_fkey";

alter table "public"."posts" add constraint "posts_board_id_fkey" FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE not valid;

alter table "public"."posts" validate constraint "posts_board_id_fkey";

alter table "public"."profiles" add constraint "profiles_handle_key" UNIQUE using index "profiles_handle_key";

alter table "public"."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_user_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_permission_key_fkey" FOREIGN KEY (permission_key) REFERENCES public.permissions(key) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_permission_key_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.system_roles(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_id_fkey";

alter table "public"."service_account_boards" add constraint "service_account_boards_board_id_fkey" FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE not valid;

alter table "public"."service_account_boards" validate constraint "service_account_boards_board_id_fkey";

alter table "public"."service_account_boards" add constraint "service_account_boards_service_account_id_fkey" FOREIGN KEY (service_account_id) REFERENCES public.service_accounts(id) ON DELETE CASCADE not valid;

alter table "public"."service_account_boards" validate constraint "service_account_boards_service_account_id_fkey";

alter table "public"."service_accounts" add constraint "service_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."service_accounts" validate constraint "service_accounts_user_id_fkey";

alter table "public"."service_accounts" add constraint "service_accounts_user_id_key" UNIQUE using index "service_accounts_user_id_key";

alter table "public"."system_roles" add constraint "system_roles_key_key" UNIQUE using index "system_roles_key_key";

alter table "public"."user_roles" add constraint "user_roles_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_roles" validate constraint "user_roles_granted_by_fkey";

alter table "public"."user_roles" add constraint "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.system_roles(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_role_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.ack_outbox(p_id uuid, p_worker text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with upd as (
    update public.outbox_events
    set status = 'done'
    where id = p_id and claimed_by = p_worker and status = 'claimed'
    returning 1
  )
  select exists (select 1 from upd);
$function$
;

CREATE OR REPLACE FUNCTION app_private.claim_outbox_batch(p_worker text, p_batch integer DEFAULT 10, p_lease interval DEFAULT '00:00:30'::interval)
 RETURNS SETOF public.outbox_events
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    order by process_after
    for update skip locked
    limit greatest(p_batch, 0)
  )
  returning o.*;
$function$
;

CREATE OR REPLACE FUNCTION app_private.current_account_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = app_private.current_user_id()
      and p.account_status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION app_private.current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$function$
;

CREATE OR REPLACE FUNCTION app_private.fail_outbox(p_id uuid, p_worker text, p_error text)
 RETURNS public.outbox_status
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.outbox_events o
  set last_error = p_error,
      status = case when o.attempt_count >= o.max_attempts
                    then 'dead'::public.outbox_status
                    else 'pending'::public.outbox_status end,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      -- 지수 backoff(초): 2^attempt, 최대 1시간
      process_after = now() + make_interval(secs => least(power(2, o.attempt_count)::int, 3600))
  where o.id = p_id and o.claimed_by = p_worker
  returning o.status;
$function$
;

CREATE OR REPLACE FUNCTION app_private.has_permission(perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = app_private.current_user_id()
      and rp.permission_key = perm
  );
$function$
;

CREATE OR REPLACE FUNCTION app_private.is_service_account()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.service_accounts sa
    where sa.user_id = app_private.current_user_id()
  );
$function$
;

CREATE OR REPLACE FUNCTION app_private.service_account_can_reply(target_board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.service_accounts sa
    join public.service_account_boards sab on sab.service_account_id = sa.id
    where sa.user_id = app_private.current_user_id()
      and sa.status = 'active'
      and sa.allowed_reply_create           -- 전용 permission: 답글 생성만
      and sab.board_id = target_board_id
  );
$function$
;

grant delete on table "public"."account_state_events" to "anon";

grant insert on table "public"."account_state_events" to "anon";

grant references on table "public"."account_state_events" to "anon";

grant select on table "public"."account_state_events" to "anon";

grant trigger on table "public"."account_state_events" to "anon";

grant truncate on table "public"."account_state_events" to "anon";

grant update on table "public"."account_state_events" to "anon";

grant delete on table "public"."account_state_events" to "authenticated";

grant insert on table "public"."account_state_events" to "authenticated";

grant references on table "public"."account_state_events" to "authenticated";

grant select on table "public"."account_state_events" to "authenticated";

grant trigger on table "public"."account_state_events" to "authenticated";

grant truncate on table "public"."account_state_events" to "authenticated";

grant update on table "public"."account_state_events" to "authenticated";

grant delete on table "public"."account_state_events" to "service_role";

grant insert on table "public"."account_state_events" to "service_role";

grant references on table "public"."account_state_events" to "service_role";

grant select on table "public"."account_state_events" to "service_role";

grant trigger on table "public"."account_state_events" to "service_role";

grant truncate on table "public"."account_state_events" to "service_role";

grant update on table "public"."account_state_events" to "service_role";

grant delete on table "public"."audit_events" to "anon";

grant insert on table "public"."audit_events" to "anon";

grant references on table "public"."audit_events" to "anon";

grant select on table "public"."audit_events" to "anon";

grant trigger on table "public"."audit_events" to "anon";

grant truncate on table "public"."audit_events" to "anon";

grant update on table "public"."audit_events" to "anon";

grant delete on table "public"."audit_events" to "authenticated";

grant insert on table "public"."audit_events" to "authenticated";

grant references on table "public"."audit_events" to "authenticated";

grant select on table "public"."audit_events" to "authenticated";

grant trigger on table "public"."audit_events" to "authenticated";

grant truncate on table "public"."audit_events" to "authenticated";

grant update on table "public"."audit_events" to "authenticated";

grant delete on table "public"."audit_events" to "service_role";

grant insert on table "public"."audit_events" to "service_role";

grant references on table "public"."audit_events" to "service_role";

grant select on table "public"."audit_events" to "service_role";

grant trigger on table "public"."audit_events" to "service_role";

grant truncate on table "public"."audit_events" to "service_role";

grant update on table "public"."audit_events" to "service_role";

grant delete on table "public"."boards" to "anon";

grant insert on table "public"."boards" to "anon";

grant references on table "public"."boards" to "anon";

grant select on table "public"."boards" to "anon";

grant trigger on table "public"."boards" to "anon";

grant truncate on table "public"."boards" to "anon";

grant update on table "public"."boards" to "anon";

grant delete on table "public"."boards" to "authenticated";

grant insert on table "public"."boards" to "authenticated";

grant references on table "public"."boards" to "authenticated";

grant select on table "public"."boards" to "authenticated";

grant trigger on table "public"."boards" to "authenticated";

grant truncate on table "public"."boards" to "authenticated";

grant update on table "public"."boards" to "authenticated";

grant delete on table "public"."boards" to "service_role";

grant insert on table "public"."boards" to "service_role";

grant references on table "public"."boards" to "service_role";

grant select on table "public"."boards" to "service_role";

grant trigger on table "public"."boards" to "service_role";

grant truncate on table "public"."boards" to "service_role";

grant update on table "public"."boards" to "service_role";

grant delete on table "public"."comments" to "anon";

grant insert on table "public"."comments" to "anon";

grant references on table "public"."comments" to "anon";

grant select on table "public"."comments" to "anon";

grant trigger on table "public"."comments" to "anon";

grant truncate on table "public"."comments" to "anon";

grant update on table "public"."comments" to "anon";

grant delete on table "public"."comments" to "authenticated";

grant insert on table "public"."comments" to "authenticated";

grant references on table "public"."comments" to "authenticated";

grant select on table "public"."comments" to "authenticated";

grant trigger on table "public"."comments" to "authenticated";

grant truncate on table "public"."comments" to "authenticated";

grant update on table "public"."comments" to "authenticated";

grant delete on table "public"."comments" to "service_role";

grant insert on table "public"."comments" to "service_role";

grant references on table "public"."comments" to "service_role";

grant select on table "public"."comments" to "service_role";

grant trigger on table "public"."comments" to "service_role";

grant truncate on table "public"."comments" to "service_role";

grant update on table "public"."comments" to "service_role";

grant delete on table "public"."consumed_events" to "anon";

grant insert on table "public"."consumed_events" to "anon";

grant references on table "public"."consumed_events" to "anon";

grant select on table "public"."consumed_events" to "anon";

grant trigger on table "public"."consumed_events" to "anon";

grant truncate on table "public"."consumed_events" to "anon";

grant update on table "public"."consumed_events" to "anon";

grant delete on table "public"."consumed_events" to "authenticated";

grant insert on table "public"."consumed_events" to "authenticated";

grant references on table "public"."consumed_events" to "authenticated";

grant select on table "public"."consumed_events" to "authenticated";

grant trigger on table "public"."consumed_events" to "authenticated";

grant truncate on table "public"."consumed_events" to "authenticated";

grant update on table "public"."consumed_events" to "authenticated";

grant delete on table "public"."consumed_events" to "service_role";

grant insert on table "public"."consumed_events" to "service_role";

grant references on table "public"."consumed_events" to "service_role";

grant select on table "public"."consumed_events" to "service_role";

grant trigger on table "public"."consumed_events" to "service_role";

grant truncate on table "public"."consumed_events" to "service_role";

grant update on table "public"."consumed_events" to "service_role";

grant delete on table "public"."outbox_events" to "anon";

grant insert on table "public"."outbox_events" to "anon";

grant references on table "public"."outbox_events" to "anon";

grant select on table "public"."outbox_events" to "anon";

grant trigger on table "public"."outbox_events" to "anon";

grant truncate on table "public"."outbox_events" to "anon";

grant update on table "public"."outbox_events" to "anon";

grant delete on table "public"."outbox_events" to "authenticated";

grant insert on table "public"."outbox_events" to "authenticated";

grant references on table "public"."outbox_events" to "authenticated";

grant select on table "public"."outbox_events" to "authenticated";

grant trigger on table "public"."outbox_events" to "authenticated";

grant truncate on table "public"."outbox_events" to "authenticated";

grant update on table "public"."outbox_events" to "authenticated";

grant delete on table "public"."outbox_events" to "service_role";

grant insert on table "public"."outbox_events" to "service_role";

grant references on table "public"."outbox_events" to "service_role";

grant select on table "public"."outbox_events" to "service_role";

grant trigger on table "public"."outbox_events" to "service_role";

grant truncate on table "public"."outbox_events" to "service_role";

grant update on table "public"."outbox_events" to "service_role";

grant delete on table "public"."permissions" to "anon";

grant insert on table "public"."permissions" to "anon";

grant references on table "public"."permissions" to "anon";

grant select on table "public"."permissions" to "anon";

grant trigger on table "public"."permissions" to "anon";

grant truncate on table "public"."permissions" to "anon";

grant update on table "public"."permissions" to "anon";

grant delete on table "public"."permissions" to "authenticated";

grant insert on table "public"."permissions" to "authenticated";

grant references on table "public"."permissions" to "authenticated";

grant select on table "public"."permissions" to "authenticated";

grant trigger on table "public"."permissions" to "authenticated";

grant truncate on table "public"."permissions" to "authenticated";

grant update on table "public"."permissions" to "authenticated";

grant delete on table "public"."permissions" to "service_role";

grant insert on table "public"."permissions" to "service_role";

grant references on table "public"."permissions" to "service_role";

grant select on table "public"."permissions" to "service_role";

grant trigger on table "public"."permissions" to "service_role";

grant truncate on table "public"."permissions" to "service_role";

grant update on table "public"."permissions" to "service_role";

grant delete on table "public"."posts" to "anon";

grant insert on table "public"."posts" to "anon";

grant references on table "public"."posts" to "anon";

grant select on table "public"."posts" to "anon";

grant trigger on table "public"."posts" to "anon";

grant truncate on table "public"."posts" to "anon";

grant update on table "public"."posts" to "anon";

grant delete on table "public"."posts" to "authenticated";

grant insert on table "public"."posts" to "authenticated";

grant references on table "public"."posts" to "authenticated";

grant select on table "public"."posts" to "authenticated";

grant trigger on table "public"."posts" to "authenticated";

grant truncate on table "public"."posts" to "authenticated";

grant update on table "public"."posts" to "authenticated";

grant delete on table "public"."posts" to "service_role";

grant insert on table "public"."posts" to "service_role";

grant references on table "public"."posts" to "service_role";

grant select on table "public"."posts" to "service_role";

grant trigger on table "public"."posts" to "service_role";

grant truncate on table "public"."posts" to "service_role";

grant update on table "public"."posts" to "service_role";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."service_account_boards" to "anon";

grant insert on table "public"."service_account_boards" to "anon";

grant references on table "public"."service_account_boards" to "anon";

grant select on table "public"."service_account_boards" to "anon";

grant trigger on table "public"."service_account_boards" to "anon";

grant truncate on table "public"."service_account_boards" to "anon";

grant update on table "public"."service_account_boards" to "anon";

grant delete on table "public"."service_account_boards" to "authenticated";

grant insert on table "public"."service_account_boards" to "authenticated";

grant references on table "public"."service_account_boards" to "authenticated";

grant select on table "public"."service_account_boards" to "authenticated";

grant trigger on table "public"."service_account_boards" to "authenticated";

grant truncate on table "public"."service_account_boards" to "authenticated";

grant update on table "public"."service_account_boards" to "authenticated";

grant delete on table "public"."service_account_boards" to "service_role";

grant insert on table "public"."service_account_boards" to "service_role";

grant references on table "public"."service_account_boards" to "service_role";

grant select on table "public"."service_account_boards" to "service_role";

grant trigger on table "public"."service_account_boards" to "service_role";

grant truncate on table "public"."service_account_boards" to "service_role";

grant update on table "public"."service_account_boards" to "service_role";

grant delete on table "public"."service_accounts" to "anon";

grant insert on table "public"."service_accounts" to "anon";

grant references on table "public"."service_accounts" to "anon";

grant select on table "public"."service_accounts" to "anon";

grant trigger on table "public"."service_accounts" to "anon";

grant truncate on table "public"."service_accounts" to "anon";

grant update on table "public"."service_accounts" to "anon";

grant delete on table "public"."service_accounts" to "authenticated";

grant insert on table "public"."service_accounts" to "authenticated";

grant references on table "public"."service_accounts" to "authenticated";

grant select on table "public"."service_accounts" to "authenticated";

grant trigger on table "public"."service_accounts" to "authenticated";

grant truncate on table "public"."service_accounts" to "authenticated";

grant update on table "public"."service_accounts" to "authenticated";

grant delete on table "public"."service_accounts" to "service_role";

grant insert on table "public"."service_accounts" to "service_role";

grant references on table "public"."service_accounts" to "service_role";

grant select on table "public"."service_accounts" to "service_role";

grant trigger on table "public"."service_accounts" to "service_role";

grant truncate on table "public"."service_accounts" to "service_role";

grant update on table "public"."service_accounts" to "service_role";

grant delete on table "public"."system_roles" to "anon";

grant insert on table "public"."system_roles" to "anon";

grant references on table "public"."system_roles" to "anon";

grant select on table "public"."system_roles" to "anon";

grant trigger on table "public"."system_roles" to "anon";

grant truncate on table "public"."system_roles" to "anon";

grant update on table "public"."system_roles" to "anon";

grant delete on table "public"."system_roles" to "authenticated";

grant insert on table "public"."system_roles" to "authenticated";

grant references on table "public"."system_roles" to "authenticated";

grant select on table "public"."system_roles" to "authenticated";

grant trigger on table "public"."system_roles" to "authenticated";

grant truncate on table "public"."system_roles" to "authenticated";

grant update on table "public"."system_roles" to "authenticated";

grant delete on table "public"."system_roles" to "service_role";

grant insert on table "public"."system_roles" to "service_role";

grant references on table "public"."system_roles" to "service_role";

grant select on table "public"."system_roles" to "service_role";

grant trigger on table "public"."system_roles" to "service_role";

grant truncate on table "public"."system_roles" to "service_role";

grant update on table "public"."system_roles" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";


  create policy "account_state_select"
  on "public"."account_state_events"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('member.manage'::text)));
  create policy "audit_admin_read"
  on "public"."audit_events"
  as permissive
  for select
  to authenticated
using (app_private.has_permission('audit.read'::text));



  create policy "audit_append"
  on "public"."audit_events"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "boards_admin_write"
  on "public"."boards"
  as permissive
  for all
  to authenticated
using (app_private.has_permission('content.moderate'::text))
with check (app_private.has_permission('content.moderate'::text));



  create policy "boards_select_public"
  on "public"."boards"
  as permissive
  for select
  to anon, authenticated
using ((is_active OR app_private.has_permission('content.moderate'::text)));



  create policy "comments_insert_member"
  on "public"."comments"
  as permissive
  for insert
  to authenticated
with check (((author_id = app_private.current_user_id()) AND ((app_private.current_account_active() AND (NOT app_private.is_service_account())) OR app_private.service_account_can_reply(board_id))));



  create policy "comments_select"
  on "public"."comments"
  as permissive
  for select
  to anon, authenticated
using (((NOT is_deleted) OR (author_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text)));



  create policy "comments_update_owner"
  on "public"."comments"
  as permissive
  for update
  to authenticated
using ((((author_id = app_private.current_user_id()) AND app_private.current_account_active()) OR app_private.has_permission('content.moderate'::text)))
with check ((((author_id = app_private.current_user_id()) AND app_private.current_account_active()) OR app_private.has_permission('content.moderate'::text)));



  create policy "consumed_insert"
  on "public"."consumed_events"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "outbox_append"
  on "public"."outbox_events"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "permissions_admin_read"
  on "public"."permissions"
  as permissive
  for select
  to authenticated
using (app_private.has_permission('member.manage'::text));



  create policy "posts_delete_owner"
  on "public"."posts"
  as permissive
  for delete
  to authenticated
using ((((author_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())) OR app_private.has_permission('content.moderate'::text)));



  create policy "posts_insert_owner"
  on "public"."posts"
  as permissive
  for insert
  to authenticated
with check (((author_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())));



  create policy "posts_select_anon"
  on "public"."posts"
  as permissive
  for select
  to anon
using ((status = 'published'::public.post_status));



  create policy "posts_select_member"
  on "public"."posts"
  as permissive
  for select
  to authenticated
using (((status = 'published'::public.post_status) OR (author_id = app_private.current_user_id()) OR app_private.has_permission('content.moderate'::text)));



  create policy "posts_update_owner"
  on "public"."posts"
  as permissive
  for update
  to authenticated
using ((((author_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())) OR app_private.has_permission('content.moderate'::text)))
with check ((((author_id = app_private.current_user_id()) AND app_private.current_account_active() AND (NOT app_private.is_service_account())) OR app_private.has_permission('content.moderate'::text)));



  create policy "profiles_admin_all"
  on "public"."profiles"
  as permissive
  for all
  to authenticated
using (app_private.has_permission('member.manage'::text))
with check (app_private.has_permission('member.manage'::text));



  create policy "profiles_select_authenticated"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "profiles_update_self"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((user_id = app_private.current_user_id()))
with check ((user_id = app_private.current_user_id()));



  create policy "role_permissions_admin_read"
  on "public"."role_permissions"
  as permissive
  for select
  to authenticated
using (app_private.has_permission('member.manage'::text));



  create policy "sa_boards_admin_all"
  on "public"."service_account_boards"
  as permissive
  for all
  to authenticated
using (app_private.has_permission('service_account.manage'::text))
with check (app_private.has_permission('service_account.manage'::text));



  create policy "sa_boards_self_read"
  on "public"."service_account_boards"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.service_accounts sa
  WHERE ((sa.id = service_account_boards.service_account_id) AND (sa.user_id = app_private.current_user_id())))));



  create policy "service_accounts_admin_all"
  on "public"."service_accounts"
  as permissive
  for all
  to authenticated
using (app_private.has_permission('service_account.manage'::text))
with check (app_private.has_permission('service_account.manage'::text));



  create policy "service_accounts_self_read"
  on "public"."service_accounts"
  as permissive
  for select
  to authenticated
using ((user_id = app_private.current_user_id()));



  create policy "roles_admin_read"
  on "public"."system_roles"
  as permissive
  for select
  to authenticated
using (app_private.has_permission('member.manage'::text));



  create policy "user_roles_admin_write"
  on "public"."user_roles"
  as permissive
  for all
  to authenticated
using (app_private.has_permission('role.manage'::text))
with check (app_private.has_permission('role.manage'::text));



  create policy "user_roles_select_self"
  on "public"."user_roles"
  as permissive
  for select
  to authenticated
using (((user_id = app_private.current_user_id()) OR app_private.has_permission('member.manage'::text)));
