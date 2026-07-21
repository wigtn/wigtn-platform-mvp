-- 10_identity.sql — 인증/회원 코어 (PRD §5)
-- 역할 모델 분리(§5.1): 계정상태 / 회원등급 / 시스템역할 / 개별권한을 하나의 role 문자열로 합치지 않는다.
-- Auth 비밀번호·토큰은 Supabase Auth(auth.users)가 소유하고 여기 복제하지 않는다(§5.2).

-- ── 계정 상태 (§5.3) ────────────────────────────────────────────────
create type public.account_status as enum ('pending_verification', 'active', 'suspended', 'withdrawn');

-- profiles: auth.users와 1:1 서비스 프로필
create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  handle         citext unique,
  display_name   text not null default '',
  account_status public.account_status not null default 'pending_verification',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Supabase Auth identity의 도메인 snapshot. 비밀번호/token은 복제하지 않는다.
create table public.auth_provider_links (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (user_id) on delete cascade,
  provider          text not null,
  provider_subject  text not null,
  email_snapshot    text,
  linked_at         timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (user_id, provider, provider_subject)
);
create index auth_provider_links_user_idx on public.auth_provider_links (user_id, linked_at);

-- Auth 가입 직후 서비스 프로필을 pending 상태로 만든다. 사용자 입력은 신뢰하지 않으며,
-- 이메일 확인 + 최신 필수동의가 끝난 뒤 complete_member_onboarding 명령이 active로 전이한다.
create or replace function app_private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_auth_user_created();

revoke all on function app_private.handle_auth_user_created() from public;

-- 계정 상태 변경 이력 (§5.2 account_states). 상태는 명시적 명령으로만 바뀐다(§4.2).
create table public.account_state_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (user_id) on delete cascade,
  from_status    public.account_status,
  to_status      public.account_status not null,
  reason_code    text not null,
  operator_note  text,
  actor_id       uuid references auth.users (id),
  occurred_at    timestamptz not null default now()
);
create index account_state_events_user_idx on public.account_state_events (user_id, occurred_at desc);

-- ── 관리자 권한 (§5.1, §5.2) ────────────────────────────────────────
create table public.system_roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,          -- member | moderator | admin
  title       text not null,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  key         text primary key,              -- member.suspend | report.resolve ...
  description text not null default ''
);

create table public.role_permissions (
  role_id        uuid not null references public.system_roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.user_roles (
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  role_id     uuid not null references public.system_roles (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id),
  primary key (user_id, role_id)
);

-- ── 동의 문서 (§5.2, AUTH-FR-104) ──────────────────────────────────
create table public.consent_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  version       integer not null check (version > 0),
  title         text not null,
  content_url   text not null,
  is_required   boolean not null default true,
  published_at  timestamptz not null default now(),
  retired_at    timestamptz,
  unique (kind, version)
);

create table public.user_consents (
  user_id       uuid not null references public.profiles (user_id) on delete cascade,
  document_id   uuid not null references public.consent_documents (id),
  accepted_at   timestamptz not null default now(),
  evidence      jsonb not null default '{}'::jsonb,
  primary key (user_id, document_id)
);
create index user_consents_user_idx on public.user_consents (user_id, accepted_at desc);

-- ── 회원 등급과 신청 (§5.2, AUTH-FR-105~107) ──────────────────────
create type public.grade_application_status as enum (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled'
);

create table public.membership_grades (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null,
  version             integer not null check (version > 0),
  title               text not null,
  description         text not null default '',
  application_schema  jsonb not null default '{}'::jsonb,
  required_evidence   jsonb not null default '[]'::jsonb,
  approval_mode       text not null check (approval_mode in ('automatic', 'manual')),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (key, version)
);

create table public.grade_applications (
  id                      uuid primary key,
  user_id                 uuid not null references public.profiles (user_id) on delete cascade,
  grade_id                uuid not null references public.membership_grades (id),
  grade_config_version    integer not null,
  status                  public.grade_application_status not null default 'draft',
  form_data               jsonb not null default '{}'::jsonb,
  submit_idempotency_key  text not null,
  submitted_at            timestamptz,
  reviewed_at             timestamptz,
  reviewed_by             uuid references auth.users (id),
  review_note             text,
  review_idempotency_key  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, submit_idempotency_key)
);
create index grade_applications_user_idx
  on public.grade_applications (user_id, created_at desc);
create index grade_applications_review_queue_idx
  on public.grade_applications (status, submitted_at)
  where status in ('submitted', 'under_review');

create table public.grade_application_documents (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.grade_applications (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  bucket_id       text not null,
  object_path     text not null,
  original_name   text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at      timestamptz not null default now(),
  unique (bucket_id, object_path)
);
create index grade_application_documents_application_idx
  on public.grade_application_documents (application_id);

create table public.user_membership_grades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (user_id) on delete cascade,
  grade_id        uuid not null references public.membership_grades (id),
  application_id  uuid not null unique references public.grade_applications (id),
  granted_at      timestamptz not null default now(),
  granted_by      uuid references auth.users (id),
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users (id)
);
create unique index user_membership_grades_one_active_idx
  on public.user_membership_grades (user_id)
  where revoked_at is null;

-- ── 회원 뱃지와 신청 (§5.2, AUTH-FR-111) ──────────────────────────
-- 등급은 한 시점에 하나, 뱃지는 여러 개를 동시에 가질 수 있다.
create table public.membership_badges (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null,
  version             integer not null check (version > 0),
  title               text not null,
  description         text not null default '',
  application_schema  jsonb not null default '{}'::jsonb,
  required_evidence   jsonb not null default '[]'::jsonb,
  approval_mode       text not null check (approval_mode in ('automatic', 'manual')),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (key, version)
);

create table public.badge_applications (
  id                      uuid primary key,
  user_id                 uuid not null references public.profiles (user_id) on delete cascade,
  badge_id                uuid not null references public.membership_badges (id),
  badge_config_version    integer not null,
  status                  public.grade_application_status not null default 'draft',
  form_data               jsonb not null default '{}'::jsonb,
  submit_idempotency_key  text not null,
  submitted_at            timestamptz,
  reviewed_at             timestamptz,
  reviewed_by             uuid references auth.users (id),
  review_note             text,
  review_idempotency_key  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, submit_idempotency_key)
);
create index badge_applications_user_idx
  on public.badge_applications (user_id, created_at desc);
create index badge_applications_review_queue_idx
  on public.badge_applications (status, submitted_at)
  where status in ('submitted', 'under_review');

create table public.badge_application_documents (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.badge_applications (id) on delete cascade,
  owner_id        uuid not null references public.profiles (user_id) on delete cascade,
  bucket_id       text not null,
  object_path     text not null,
  original_name   text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at      timestamptz not null default now(),
  unique (bucket_id, object_path)
);
create index badge_application_documents_application_idx
  on public.badge_application_documents (application_id);

create table public.user_badges (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (user_id) on delete cascade,
  badge_id           uuid not null references public.membership_badges (id),
  application_id     uuid references public.badge_applications (id),
  granted_at         timestamptz not null default now(),
  granted_by         uuid references auth.users (id),
  revoked_at         timestamptz,
  revoked_by         uuid references auth.users (id),
  revoke_reason      text,
  revoke_idempotency_key text
);
create unique index user_badges_one_active_badge_idx
  on public.user_badges (user_id, badge_id)
  where revoked_at is null;

-- ── 서비스 계정 (§3.7, §5.2) ────────────────────────────────────────
-- AI 답변봇 = 서비스 계정 회원. 일반 회원과 동일한 RLS 경로, 단 전용 permission으로 축소.
create type public.service_account_status as enum ('active', 'disabled');

create table public.service_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  label                 text not null,
  status                public.service_account_status not null default 'active',
  allowed_reply_create  boolean not null default true,   -- 권한 상한: 답글 생성만(§3.7)
  disabled_at           timestamptz,
  disabled_reason       text,
  created_at            timestamptz not null default now()
);

-- (서비스 계정 ↔ 게시판 화이트리스트 join 테이블 service_account_boards는
--  boards 정의 이후 20_community.sql에 둔다 — 로드 순서 의존.)

alter table public.profiles              enable row level security;
alter table public.auth_provider_links   enable row level security;
alter table public.account_state_events  enable row level security;
alter table public.system_roles          enable row level security;
alter table public.permissions           enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.user_roles            enable row level security;
alter table public.service_accounts      enable row level security;
alter table public.consent_documents     enable row level security;
alter table public.user_consents         enable row level security;
alter table public.membership_grades     enable row level security;
alter table public.grade_applications    enable row level security;
alter table public.grade_application_documents enable row level security;
alter table public.user_membership_grades enable row level security;
alter table public.membership_badges enable row level security;
alter table public.badge_applications enable row level security;
alter table public.badge_application_documents enable row level security;
alter table public.user_badges enable row level security;
