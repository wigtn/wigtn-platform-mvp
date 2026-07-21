-- 45_outbox.sql — outbox 워커 claim 프리미티브 (PRD §9.2, C3)
-- 전달 보장 at-least-once. lease 기반 claim으로 두 워커의 동시 claim과 crash 후 재획득을 안전히 처리.
-- backoffice-frame batch runner가 이 함수를 호출한다(도메인 코드는 배포 SDK를 import하지 않음).
-- 내부 전용: authenticated/anon에는 부여하지 않는다(§10.2 internal worker 분리).

-- 한정 batch를 claim한다. pending 또는 lease 만료된 claimed 중 process_after가 도래한 행을,
-- FOR UPDATE SKIP LOCKED로 서로 다른 워커가 겹치지 않게 집는다. attempt_count 증가.
create or replace function app_private.claim_outbox_batch(
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

-- 처리 성공 ack. 성공한 워커만 done으로 넘긴다.
create or replace function app_private.ack_outbox(p_id uuid, p_worker text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.outbox_events
    set status = 'done'
    where id = p_id and claimed_by = p_worker and status = 'claimed'
    returning 1
  )
  select exists (select 1 from upd);
$$;

-- 실패 기록. max_attempts 초과 시 dead-letter, 아니면 지수 backoff로 재시도 예약.
create or replace function app_private.fail_outbox(p_id uuid, p_worker text, p_error text)
returns public.outbox_status
language sql
security definer
set search_path = ''
as $$
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
$$;

-- 내부 전용: PUBLIC/anon/authenticated 차단. 내부 worker 역할에만 부여(배포 시 별도 role).
revoke all on function app_private.claim_outbox_batch(text, integer, interval, text[]) from public;
revoke all on function app_private.ack_outbox(uuid, text) from public;
revoke all on function app_private.fail_outbox(uuid, text, text) from public;
