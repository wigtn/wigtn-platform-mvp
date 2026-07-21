// AI 지연 답변 스케줄 store + 팬아웃 멱등 헬퍼 + post 스냅샷 조회 DB 함수 검증 (PROD-535 게이트 Q).
// superuser 풀로 app_private 함수를 직접 호출한다(실배선 워커는 outbox_worker role).
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { pool, POSTS, BOARDS, USERS, asUser } from "./helpers";

const TEST_CONSUMER = "test-ai-schedule";
// ai_pending_answers.post_id는 posts FK가 없어 합성 uuid 사용 가능(cleanup 용이).
const P1 = "aaaa0000-0000-0000-0000-000000000001";
const P2 = "aaaa0000-0000-0000-0000-000000000002";
const EVT = "bbbb0000-0000-0000-0000-000000000001";

function envelope(postId: string) {
  return {
    specVersion: "1",
    id: EVT,
    type: "community.post.created.v1",
    occurredAt: "2026-07-20T00:00:00.000Z",
    traceId: "t",
    actor: { type: "user", id: USERS.member },
    subject: { type: "post", id: postId },
    data: {
      postId,
      boardType: "qna",
      authorId: USERS.member,
      createdAt: "2026-07-20T00:00:00.000Z",
    },
  };
}

async function schedule(postId: string, dueAt: string) {
  await pool.query(
    "select app_private.schedule_ai_answer($1, $2::jsonb, $3::timestamptz)",
    [postId, JSON.stringify(envelope(postId)), dueAt],
  );
}

afterEach(async () => {
  await pool.query(
    "delete from public.ai_pending_answers where post_id = any($1::uuid[])",
    [[P1, P2]],
  );
  await pool.query("delete from public.consumed_events where consumer = $1", [
    TEST_CONSUMER,
  ]);
});
afterAll(async () => {
  await pool.end();
});

describe("ai_pending_answers store (게이트 Q, C3)", () => {
  it("만기 도래 답변만 claim하고 lease를 잡는다(삭제 아님). 재claim은 lease로 차단", async () => {
    await schedule(P1, "2020-01-01T00:00:00Z"); // 과거 = due
    await schedule(P2, "2999-01-01T00:00:00Z"); // 미래 = not due

    const claimed = await pool.query(
      "select post_id from app_private.claim_due_ai_answers(25)",
    );
    const ids = claimed.rows.map((r) => r.post_id);
    expect(ids).toContain(P1);
    expect(ids).not.toContain(P2);

    // claim은 삭제하지 않고 lease만 잡는다 — P1·P2 모두 여전히 존재, P1은 lease/attempt 갱신됨.
    const rows = await pool.query(
      "select post_id, attempt_count, lease_expires_at from public.ai_pending_answers where post_id = any($1::uuid[]) order by post_id",
      [[P1, P2]],
    );
    expect(rows.rows).toHaveLength(2);
    const p1 = rows.rows.find((r) => r.post_id === P1);
    expect(p1.attempt_count).toBe(1);
    expect(p1.lease_expires_at).not.toBeNull();

    // lease 유효 동안 재claim되지 않는다.
    const again = await pool.query(
      "select post_id from app_private.claim_due_ai_answers(25)",
    );
    expect(again.rows.map((r) => r.post_id)).not.toContain(P1);

    // 처리 성공 시 워커가 delete_ai_answers로 소비 확정.
    const del = await pool.query(
      "select app_private.delete_ai_answers($1::uuid[]) as n",
      [[P1]],
    );
    expect(del.rows[0].n).toBe(1);
    const remain = await pool.query(
      "select post_id from public.ai_pending_answers where post_id = any($1::uuid[])",
      [[P1, P2]],
    );
    expect(remain.rows.map((r) => r.post_id)).toEqual([P2]);
  });

  it("처리 실패(delete 미호출) 시 답변이 유실되지 않고 lease 만료 후 재claim된다 (no-loss)", async () => {
    await schedule(P1, "2020-01-01T00:00:00Z"); // 과거 = due

    // 1차 claim → lease만 잡음(삭제 아님). 처리 실패를 모사: delete_ai_answers를 호출하지 않는다.
    const first = await pool.query(
      "select post_id from app_private.claim_due_ai_answers(25)",
    );
    expect(first.rows.map((r) => r.post_id)).toContain(P1);

    // 실패했으므로 행은 그대로 남아있어야 한다(유실 0).
    const survived = await pool.query(
      "select 1 from public.ai_pending_answers where post_id=$1",
      [P1],
    );
    expect(survived.rows).toHaveLength(1);

    // lease 만료 → 2차 재claim에서 다시 잡힌다(재시도 가능). attempt_count는 누적된다.
    await pool.query(
      "update public.ai_pending_answers set lease_expires_at = now() - interval '1 minute' where post_id=$1",
      [P1],
    );
    const retry = await pool.query(
      "select post_id from app_private.claim_due_ai_answers(25)",
    );
    expect(retry.rows.map((r) => r.post_id)).toContain(P1); // 재claim됨 — 유실 없음
    // attempt_count는 함수 반환값이 아니라 테이블에서 확인(1차+2차 = 2)
    const attempt = await pool.query(
      "select attempt_count from public.ai_pending_answers where post_id=$1",
      [P1],
    );
    expect(attempt.rows[0].attempt_count).toBe(2);

    // max_attempts 초과 시 더는 claim되지 않는다(무한 재시도 차단).
    await pool.query(
      "update public.ai_pending_answers set attempt_count = max_attempts, lease_expires_at = now() - interval '1 minute' where post_id=$1",
      [P1],
    );
    const dead = await pool.query(
      "select post_id from app_private.claim_due_ai_answers(25)",
    );
    expect(dead.rows.map((r) => r.post_id)).not.toContain(P1);
  });

  it("같은 post 재예약은 upsert(due_at·event 갱신)한다", async () => {
    await schedule(P1, "2999-01-01T00:00:00Z");
    await schedule(P1, "2020-01-01T00:00:00Z"); // 과거로 갱신 → 이제 due

    const rows = await pool.query(
      "select count(*)::int as n from public.ai_pending_answers where post_id=$1",
      [P1],
    );
    expect(rows.rows[0].n).toBe(1); // 중복 행 없음
    const claimed = await pool.query(
      "select post_id, event from app_private.claim_due_ai_answers(25)",
    );
    expect(claimed.rows.map((r) => r.post_id)).toContain(P1);
  });

  it("cancel은 대기 답변을 삭제하고 삭제 여부를 반환한다", async () => {
    await schedule(P1, "2999-01-01T00:00:00Z");
    const first = await pool.query(
      "select app_private.cancel_ai_answer($1) as c",
      [P1],
    );
    expect(first.rows[0].c).toBe(true);
    const second = await pool.query(
      "select app_private.cancel_ai_answer($1) as c",
      [P1],
    );
    expect(second.rows[0].c).toBe(false);
  });
});

describe("fetch_post_snapshot (§1.2 ① 답변 직전 재조회)", () => {
  it("published 글은 available=true + board slug를 준다", async () => {
    const r = await pool.query(
      "select board_type, available from app_private.fetch_post_snapshot($1)",
      [POSTS.memberPublished],
    );
    expect(r.rows[0]).toMatchObject({ board_type: "qna", available: true });
  });

  it("draft 글은 available=false", async () => {
    const r = await pool.query(
      "select available from app_private.fetch_post_snapshot($1)",
      [POSTS.memberDraft],
    );
    expect(r.rows[0].available).toBe(false);
  });

  it("없는 글은 행 없음(→ 소비측에서 available=false 처리)", async () => {
    const r = await pool.query(
      "select * from app_private.fetch_post_snapshot($1)",
      [P1],
    );
    expect(r.rows).toHaveLength(0);
  });
});

describe("consumed_events 멱등 헬퍼 (§4.5 팬아웃)", () => {
  it("mark 이후 is_consumed=true, mark는 멱등", async () => {
    expect(
      (
        await pool.query("select app_private.is_event_consumed($1,$2) c", [
          TEST_CONSUMER,
          EVT,
        ])
      ).rows[0].c,
    ).toBe(false);
    await pool.query("select app_private.mark_event_consumed($1,$2)", [
      TEST_CONSUMER,
      EVT,
    ]);
    await pool.query("select app_private.mark_event_consumed($1,$2)", [
      TEST_CONSUMER,
      EVT,
    ]); // 재호출 no-op
    expect(
      (
        await pool.query("select app_private.is_event_consumed($1,$2) c", [
          TEST_CONSUMER,
          EVT,
        ])
      ).rows[0].c,
    ).toBe(true);
    const n = await pool.query(
      "select count(*)::int n from public.consumed_events where consumer=$1 and event_id=$2",
      [TEST_CONSUMER, EVT],
    );
    expect(n.rows[0].n).toBe(1);
  });
});

describe("봇 서비스계정 공개 댓글 멱등 (게이트 B — RPC 레벨, AC-107)", () => {
  it("같은 Idempotency-Key 재요청은 같은 댓글을 반환한다(중복 답글 0)", async () => {
    // 봇(서비스계정)은 qna 화이트리스트 → 답글 생성 허용. withCtx가 트랜잭션 롤백으로 격리.
    await asUser(USERS.serviceAccount)(async (client) => {
      const key = "evt-idem-0001"; // >= 8자
      const first = await client.query(
        "select public.create_comment($1,$2,$3,$4,$5,$6) as r",
        [
          crypto.randomUUID(),
          POSTS.memberPublished,
          null,
          "AI 답변입니다.",
          key,
          crypto.randomUUID(),
        ],
      );
      const second = await client.query(
        "select public.create_comment($1,$2,$3,$4,$5,$6) as r",
        [
          crypto.randomUUID(),
          POSTS.memberPublished,
          null,
          "AI 답변입니다.",
          key,
          crypto.randomUUID(),
        ],
      );
      expect(first.rows[0].r.id).toBe(second.rows[0].r.id);
    });
  });
});
