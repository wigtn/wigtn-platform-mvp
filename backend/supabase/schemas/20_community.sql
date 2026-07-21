-- 20_community.sql — 설정 기반 게시판/콘텐츠 코어 (PRD §7, Gate 4).

-- boards: 게시판 인스턴스. 타입은 capability 조합으로 설정(§7.1) — Gate 1은 뼈대만.
create table public.boards (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  is_active     boolean not null default true,
  ai_reply_enabled boolean not null default false,   -- AI 답변 이벤트 발행 여부(§7.1)
  created_at    timestamptz not null default now(),
  description   text not null default '',
  capabilities  text[] not null default array['posts', 'comments', 'reactions', 'bookmarks', 'reports']::text[],
  config_version integer not null default 1 check (config_version > 0),
  config        jsonb not null default '{}'::jsonb,
  position      integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- 콘텐츠 상태(§7.3): draft → published → hidden → published, → deleted
create type public.post_status as enum ('draft', 'published', 'hidden', 'deleted');

create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards (id) on delete cascade,
  author_id    uuid not null references public.profiles (user_id),
  title        text not null,
  body         text not null default '',
  status       public.post_status not null default 'published',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  create_idempotency_key text,
  deleted_reason text,
  constraint posts_id_board_unique unique (id, board_id)
);
create unique index posts_author_idempotency_idx
  on public.posts (author_id, create_idempotency_key)
  where create_idempotency_key is not null;
-- 안정 정렬·RLS·검색 인덱스(§4.4, §10.1)
create index posts_board_created_idx on public.posts (board_id, created_at desc, id desc);
create index posts_author_idx on public.posts (author_id);
create index posts_body_trgm_idx on public.posts using gin (body extensions.gin_trgm_ops);
create index posts_title_trgm_idx on public.posts using gin (title extensions.gin_trgm_ops);

create table public.post_contents (
  post_id          uuid primary key references public.posts (id) on delete cascade,
  source           jsonb not null,
  sanitized_html   text not null,
  format_version   integer not null check (format_version > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.post_revisions (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.posts (id) on delete cascade,
  revision_number  integer not null check (revision_number > 0),
  title            text not null,
  source           jsonb not null,
  sanitized_html   text not null,
  format_version   integer not null,
  created_by       uuid not null references public.profiles (user_id),
  created_at       timestamptz not null default now(),
  unique (post_id, revision_number)
);
create index post_revisions_post_idx on public.post_revisions (post_id, revision_number desc);

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null,
  board_id     uuid not null references public.boards (id) on delete cascade,  -- 서비스계정 predicate용 비정규화
  author_id    uuid not null references public.profiles (user_id),
  parent_id    uuid references public.comments (id) on delete cascade,          -- 대댓글 2단계(§7.2)
  body         text not null,
  is_deleted   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_reason text,
  create_idempotency_key text,
  -- board_id 위조로 서비스계정 whitelist를 우회하지 못하게 post와 board의 정합성을 DB가 강제한다.
  constraint comments_post_board_fk foreign key (post_id, board_id)
    references public.posts (id, board_id) on delete cascade
);
create index comments_post_idx on public.comments (post_id, created_at desc, id desc);
create unique index comments_author_idempotency_idx
  on public.comments (author_id, create_idempotency_key)
  where create_idempotency_key is not null;

create type public.reaction_type as enum ('like');

create table public.reactions (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references public.profiles (user_id) on delete cascade,
  type         public.reaction_type not null,
  created_at   timestamptz not null default now(),
  primary key (post_id, user_id, type)
);

create table public.bookmarks (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references public.profiles (user_id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);

create type public.attachment_status as enum ('pending', 'ready', 'rejected');

create table public.attachments (
  id             uuid primary key,
  owner_id       uuid not null references public.profiles (user_id) on delete cascade,
  post_id        uuid references public.posts (id) on delete cascade,
  bucket_id      text not null default 'post-attachments',
  object_path    text not null,
  original_name  text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status         public.attachment_status not null default 'pending',
  rejection_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (bucket_id, object_path)
);
create index attachments_owner_status_idx on public.attachments (owner_id, status, created_at);
create index attachments_post_idx on public.attachments (post_id) where post_id is not null;

create type public.report_status as enum ('open', 'assigned', 'resolved', 'closed');

create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles (user_id) on delete cascade,
  post_id        uuid references public.posts (id) on delete cascade,
  comment_id     uuid references public.comments (id) on delete cascade,
  reason_code    text not null,
  details        text not null default '',
  status         public.report_status not null default 'open',
  assigned_to    uuid references auth.users (id),
  resolution_note text,
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reports_one_target check ((post_id is null) <> (comment_id is null))
);
create unique index reports_unique_open_post_idx on public.reports (reporter_id, post_id)
  where post_id is not null and status in ('open', 'assigned');
create unique index reports_unique_open_comment_idx on public.reports (reporter_id, comment_id)
  where comment_id is not null and status in ('open', 'assigned');
create index reports_queue_idx on public.reports (status, created_at) where status in ('open', 'assigned');

create type public.moderation_action_type as enum ('hide', 'restore', 'delete');

create table public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references auth.users (id),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  action       public.moderation_action_type not null,
  reason       text not null,
  before_state jsonb not null,
  after_state  jsonb not null,
  created_at   timestamptz not null default now(),
  constraint moderation_actions_one_target check ((post_id is null) <> (comment_id is null))
);
create index moderation_actions_post_idx on public.moderation_actions (post_id, created_at desc);
create index moderation_actions_comment_idx on public.moderation_actions (comment_id, created_at desc);

-- 서비스 계정 ↔ 허용 게시판 화이트리스트 (§3.7 권한 상한 predicate 재료; boards 이후 정의)
create table public.service_account_boards (
  service_account_id uuid not null references public.service_accounts (id) on delete cascade,
  board_id           uuid not null references public.boards (id) on delete cascade,
  primary key (service_account_id, board_id)
);

alter table public.boards                 enable row level security;
alter table public.posts                  enable row level security;
alter table public.post_contents          enable row level security;
alter table public.post_revisions         enable row level security;
alter table public.comments               enable row level security;
alter table public.reactions              enable row level security;
alter table public.bookmarks              enable row level security;
alter table public.attachments            enable row level security;
alter table public.reports                enable row level security;
alter table public.moderation_actions     enable row level security;
alter table public.service_account_boards enable row level security;
