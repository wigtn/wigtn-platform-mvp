-- 20260720000000_prod535_ai_answer_wiring.sql
-- PROD-535 상우 실결선 게이트 개방 — AI 지연 답변 스케줄 store(게이트 Q, C3) +
-- consumer 팬아웃 멱등 헬퍼 + 봇 워커용 post 스냅샷 조회.
-- 게시판/콘텐츠 코어(20/39)와 분리된 ops 레이어 — 게시판 코드에 AI 코드 0줄 유지(§2.5).
-- 선언형 원본: schemas/46_ai_answer_schedule.sql + schemas/90_grants_roles.sql(outbox_worker grant).

-- ── AI 지연 답변 대기 store (§9.2 process_after 패턴, 전용 테이블) ──────
-- outbox 소비 라이프사이클과 섞지 않는다: processDueAnswers는 ack가 없으므로 claim=소비(delete).
-- 재답변 중복 방지는 공개 댓글 API의 Idempotency-Key(=event.id)가 최종 보장한다(AC-107).
create table if not exists public.ai_pending_answers (
  post_id      uuid primary key,             -- post당 대기 답변 1건(재예약은 upsert)
  event            jsonb not null,           -- 저장된 PostCreatedEvent 봉투(claimDue가 그대로 반환)
  due_at           timestamptz not null,     -- process_after 의미: 이전엔 claim 대상 아님
  enqueued_at      timestamptz not null default now(),
  -- lease 기반 claim(§9.2): claim은 삭제하지 않고 lease만 잡는다. 처리 성공 시에만 워커가 delete.
  -- 처리 도중 실패/타임아웃이면 lease 만료 후 재claim → 답변 유실 없음. 중복 답글은 Idempotency-Key로 차단(AC-107).
  attempt_count    integer not null default 0,
  max_attempts     integer not null default 8,
  claimed_at       timestamptz,
  lease_expires_at timestamptz,
  created_at       timestamptz not null default now()
);
-- claim 대상(lease 없거나 만료 + 시도 여유) 스캔 인덱스
create index if not exists ai_pending_answers_due_idx
  on public.ai_pending_answers (due_at);

alter table public.ai_pending_answers enable row level security;
-- 워커 전용: SECURITY DEFINER 함수로만 접근. Data API(anon/authenticated) 직접 접근 차단.
revoke all on public.ai_pending_answers from anon, authenticated;

-- 지연 답변 예약. 같은 post 재수신 시 due_at·event 갱신(멱등 upsert).
create or replace function app_private.schedule_ai_answer(
  p_post_id uuid,
  p_event jsonb,
  p_due_at timestamptz
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.ai_pending_answers (post_id, event, due_at, enqueued_at)
  values (p_post_id, p_event, p_due_at, now())
  on conflict (post_id) do update
    set event = excluded.event,
        due_at = excluded.due_at,
        enqueued_at = now(),
        attempt_count = 0,
        claimed_at = null,
        lease_expires_at = null;
$$;

-- 사람 댓글 도래 시 마중물 취소 — 대기 답변 삭제. 삭제됐으면 true.
create or replace function app_private.cancel_ai_answer(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.ai_pending_answers where post_id = p_post_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- 만기 도래 답변 claim(lease). 삭제하지 않고 lease만 잡는다 → 처리 실패/크래시 시 만기 후 재claim(유실 없음).
-- 대상: due_at<=now + (lease 없거나 만료) + attempt 여유. attempt_count를 증가시켜 무한 재시도를 max_attempts로 막는다.
create or replace function app_private.claim_due_ai_answers(
  p_max integer default 25,
  p_lease interval default interval '60 seconds'
)
returns table (post_id uuid, event jsonb, enqueued_at timestamptz)
language sql security definer set search_path = ''
as $$
  update public.ai_pending_answers a
  set claimed_at = now(),
      lease_expires_at = now() + p_lease,
      attempt_count = a.attempt_count + 1
  where a.post_id in (
    select post_id
    from public.ai_pending_answers
    where due_at <= now()
      and (lease_expires_at is null or lease_expires_at < now())
      and attempt_count < max_attempts
    order by due_at
    for update skip locked
    limit greatest(p_max, 0)
  )
  returning a.post_id, a.event, a.enqueued_at;
$$;

-- 처리 성공한 답변 소비 확정 — 워커가 pipeline write-back 성공 후 호출(claim=소비 아님, 성공=소비).
create or replace function app_private.delete_ai_answers(p_post_ids uuid[])
returns integer
language sql security definer set search_path = ''
as $$
  with removed as (
    delete from public.ai_pending_answers
    where post_id = any(p_post_ids)
    returning 1
  )
  select count(*)::int from removed;
$$;

-- 답변 직전 재조회(§1.2 ①). 워커는 posts 직접 select 불가 → SECURITY DEFINER로 스냅샷만 노출.
-- available = 게시 상태(published)만 true. 삭제/블라인드/미존재면 false.
create or replace function app_private.fetch_post_snapshot(p_post_id uuid)
returns table (post_id uuid, board_type text, title text, body text, available boolean)
language sql security definer set search_path = ''
as $$
  select p.id, b.slug, p.title, p.body, (p.status = 'published')
  from public.posts p
  join public.boards b on b.id = p.board_id
  where p.id = p_post_id;
$$;

-- consumer 팬아웃 멱등(§4.5): 같은 이벤트를 여러 consumer가 각자 1회만 처리한다.
create or replace function app_private.is_event_consumed(p_consumer text, p_event_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consumed_events
    where consumer = p_consumer and event_id = p_event_id
  );
$$;

create or replace function app_private.mark_event_consumed(p_consumer text, p_event_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.consumed_events (consumer, event_id)
  values (p_consumer, p_event_id)
  on conflict (consumer, event_id) do nothing;
$$;

-- 기본 PUBLIC EXECUTE 회수(90_grants_roles.sql의 마지막 일괄 revoke와 이중 안전).
revoke all on function
  app_private.schedule_ai_answer(uuid, jsonb, timestamptz),
  app_private.cancel_ai_answer(uuid),
  app_private.claim_due_ai_answers(integer, interval),
  app_private.delete_ai_answers(uuid[]),
  app_private.fetch_post_snapshot(uuid),
  app_private.is_event_consumed(text, uuid),
  app_private.mark_event_consumed(text, uuid)
  from public, anon, authenticated;

-- outbox cron 전용 role만 실행 가능(§3.5) — 앱/Data API에는 노출되지 않는다.
grant execute on function
  app_private.schedule_ai_answer(uuid, jsonb, timestamptz),
  app_private.cancel_ai_answer(uuid),
  app_private.claim_due_ai_answers(integer, interval),
  app_private.delete_ai_answers(uuid[]),
  app_private.fetch_post_snapshot(uuid),
  app_private.is_event_consumed(text, uuid),
  app_private.mark_event_consumed(text, uuid)
  to outbox_worker;
