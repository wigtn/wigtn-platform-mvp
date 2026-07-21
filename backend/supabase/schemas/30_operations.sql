-- 30_operations.sql — 감사로그 + outbox 골격 (PRD §4.6, §9)
-- Gate 1은 스키마·RLS·claim/lease 컬럼까지. worker 실행 로직은 backoffice-frame(Gate 3)에서.

-- ── 감사로그 (§4.6) — append-only, 일반 로그와 분리 ──────────────────
create table public.audit_events (
  id                 uuid primary key default gen_random_uuid(),
  occurred_at        timestamptz not null default now(),
  trace_id           text,
  actor_type         text not null,               -- user | service | system
  actor_id           uuid,
  actor_role_snapshot text,
  action             text not null,
  resource_type      text not null,
  resource_id        uuid,
  outcome            text not null,               -- success | error | denied
  reason_code        text,
  before_redacted    jsonb,
  after_redacted     jsonb,
  ip_hash            text,
  user_agent_summary text,
  tool_id            text,
  tool_version       integer
);
create index audit_events_resource_idx on public.audit_events (resource_type, resource_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, occurred_at desc);

-- ── outbox (§9.2) — 도메인 변경과 같은 트랜잭션에 기록, at-least-once ─────
create type public.outbox_status as enum ('pending', 'claimed', 'done', 'dead');

create table public.outbox_events (
  id               uuid primary key default gen_random_uuid(),
  type             text not null,                 -- community.post.created.v1 형식
  spec_version     integer not null default 1,
  occurred_at      timestamptz not null default now(),
  trace_id         text,
  actor            jsonb not null default '{}'::jsonb,
  subject          jsonb not null default '{}'::jsonb,
  data             jsonb not null default '{}'::jsonb,
  status           public.outbox_status not null default 'pending',
  -- 지연 등록(C3): AI 답변 1~2분 딜레이 등. process_after 이전엔 claim 대상이 아니다.
  process_after    timestamptz not null default now(),
  -- lease 기반 claim (§9.2): FOR UPDATE SKIP LOCKED 워커가 채운다
  claimed_by       text,
  claimed_at       timestamptz,
  lease_expires_at timestamptz,
  attempt_count    integer not null default 0,
  max_attempts     integer not null default 8,
  last_error       text,
  created_at       timestamptz not null default now()
);
-- claim 대상(pending 또는 lease 만료된 claimed)을 process_after 순으로 스캔하는 인덱스
create index outbox_claimable_idx on public.outbox_events (process_after)
  where status in ('pending', 'claimed');

-- consumer의 중복 처리 방지(§4.5): 이벤트 ID 소비 기록
create table public.consumed_events (
  consumer     text not null,
  event_id     uuid not null,
  consumed_at  timestamptz not null default now(),
  primary key (consumer, event_id)
);

alter table public.audit_events    enable row level security;
alter table public.outbox_events   enable row level security;
alter table public.consumed_events enable row level security;
