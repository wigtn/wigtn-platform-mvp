// outbox 워커 claim 테스트 (PRD §9.2, C3) — at-least-once, lease, backoff, dead-letter.
// 내부 worker 경로(§10.2)이므로 privileged 연결(postgres)로 claim 프리미티브를 호출한다.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  max: 6,
});
const workerPool = new Pool({
  connectionString:
    process.env.OUTBOX_DATABASE_URL ??
    "postgresql://outbox_worker:outbox_local_dev_pw@127.0.0.1:55322/postgres",
  max: 2,
});

afterAll(async () => {
  await Promise.all([pool.end(), workerPool.end()]);
});

async function seedEvents(n: number, processAfter = "now()") {
  await pool.query("delete from public.outbox_events");
  const values = Array.from(
    { length: n },
    (_, i) => `('community.post.created.v1', ${processAfter}, '{"i":${i}}')`,
  ).join(",");
  await pool.query(
    `insert into public.outbox_events (type, process_after, data) values ${values}`,
  );
}

const claim = (
  worker: string,
  batch: number,
  lease = "30 seconds",
  eventTypes: string[] | null = null,
) =>
  pool
    .query(
      "select id from app_private.claim_outbox_batch($1, $2, $3::interval, $4::text[])",
      [worker, batch, lease, eventTypes],
    )
    .then((r) => r.rows.map((x) => x.id as string));

describe("outbox claim (§9.2)", () => {
  beforeEach(async () => {
    await seedEvents(5);
  });

  it("두 워커의 동시 claim이 같은 행을 겹쳐 잡지 않는다 (FOR UPDATE SKIP LOCKED)", async () => {
    const [a, b] = await Promise.all([claim("w1", 3), claim("w2", 3)]);
    const overlap = a.filter((id) => b.includes(id));
    expect(overlap).toEqual([]); // 중복 claim 0
    expect(new Set([...a, ...b]).size).toBe(5); // 총 5개 모두 claim, 중복 없음
  });

  it("process_after가 미래면 claim 대상이 아니다 (지연 등록 C3)", async () => {
    await seedEvents(3, "now() + interval '1 hour'");
    const claimed = await claim("w1", 10);
    expect(claimed).toEqual([]);
  });

  it("등록된 consumer의 이벤트 타입만 claim한다", async () => {
    await pool.query(
      `insert into public.outbox_events (type)
       values ('identity.user.registered.v1')`,
    );
    const claimed = await claim("w1", 10, "30 seconds", [
      "identity.user.registered.v1",
    ]);
    expect(claimed).toHaveLength(1);
    const untouched = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from public.outbox_events
        where type = 'community.post.created.v1' and status = 'pending'`,
    );
    expect(untouched.rows[0].count).toBe(5);
  });

  it("lease 만료 전에는 재claim되지 않고, 만료 후 다른 워커가 재획득한다", async () => {
    await seedEvents(1);
    const first = await claim("w1", 1, "1 seconds");
    expect(first.length).toBe(1);
    // 만료 전 즉시 재claim → 없음
    expect(await claim("w2", 1, "30 seconds")).toEqual([]);
    // lease 강제 만료
    await pool.query(
      "update public.outbox_events set lease_expires_at = now() - interval '1 second'",
    );
    const reclaim = await claim("w2", 1, "30 seconds");
    expect(reclaim).toEqual(first); // 같은 이벤트를 다른 워커가 재획득
  });

  it("ack는 성공 워커만, done으로 넘긴다", async () => {
    const [id] = await claim("w1", 1);
    const ok = await pool.query("select app_private.ack_outbox($1,$2) v", [
      id,
      "w1",
    ]);
    expect(ok.rows[0].v).toBe(true);
    // 다른 워커의 ack는 무효
    const bad = await pool.query("select app_private.ack_outbox($1,$2) v", [
      id,
      "w2",
    ]);
    expect(bad.rows[0].v).toBe(false);
    const st = await pool.query(
      "select status from public.outbox_events where id=$1",
      [id],
    );
    expect(st.rows[0].status).toBe("done");
  });

  it("fail: max_attempts 미만이면 backoff로 pending 재예약, 이상이면 dead-letter", async () => {
    await seedEvents(1);
    // max_attempts=8, attempt_count는 claim마다 +1
    const [id] = await claim("w1", 1);
    const r1 = await pool.query("select app_private.fail_outbox($1,$2,$3) v", [
      id,
      "w1",
      "boom",
    ]);
    expect(r1.rows[0].v).toBe("pending"); // 1회 실패 → 재시도 예약
    // max_attempts를 강제로 낮추고 즉시 claim 가능하게(backoff process_after 되돌림)
    await pool.query(
      "update public.outbox_events set max_attempts = 0, process_after = now() where id=$1",
      [id],
    );
    const [id2] = await claim("w1", 1, "30 seconds"); // attempt_count += 1 (claim 필요)
    const r2 = await pool.query("select app_private.fail_outbox($1,$2,$3) v", [
      id2,
      "w1",
      "boom2",
    ]);
    expect(r2.rows[0].v).toBe("dead");
  });

  it("consumer 중복 처리 방지: 같은 (consumer,event_id)는 unique로 막힌다 (§4.5)", async () => {
    const [id] = await claim("w1", 1);
    await pool.query(
      "insert into public.consumed_events (consumer, event_id) values ($1,$2)",
      ["notifier", id],
    );
    await expect(
      pool.query(
        "insert into public.consumed_events (consumer, event_id) values ($1,$2)",
        ["notifier", id],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("전용 worker role은 outbox 함수만 실행하고 앱 테이블은 읽지 못한다", async () => {
    const claimed = await workerPool.query<{ id: string }>(
      `select id
         from app_private.claim_outbox_batch($1, $2, $3::interval, $4::text[])`,
      ["role-worker", 1, "30 seconds", ["community.post.created.v1"]],
    );
    expect(claimed.rows).toHaveLength(1);
    await expect(
      workerPool.query("select user_id from public.profiles limit 1"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      workerPool.query("select app_private.current_admin_context()"),
    ).rejects.toThrow(/permission denied/i);
  });
});
