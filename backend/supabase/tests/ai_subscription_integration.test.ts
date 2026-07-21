// AI 구독 실배선 E2E (PROD-535): post.created → 지연 예약 → 만기 처리 → 봇 write-back,
// 재전달 멱등(consumed_events, AC-107), 사람 댓글 시 마중물 취소.
// 실 DB pending store + 팬아웃 registry에 mock provider·mock comment client를 주입해
// HTTP/OpenAI 없이 배선 전체를 구동한다(게시판 코드에 AI 0줄 — 이 파일은 ops 레이어 테스트).
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockChatProvider,
  SALES_COMMUNITY_RULE,
  type CommentApiClient,
  type GuardrailRule,
} from "@demo/ai-pipeline-sdk";
import type { OutboxEvent } from "@demo/backoffice-frame";

import { pool, POSTS, USERS } from "./helpers";
import {
  createAiConsumer,
  AI_CONSUMER,
} from "../../apps/admin/lib/ai/register";
import {
  buildFanoutHandlers,
  type ConsumedGuard,
} from "../../apps/admin/lib/outbox/registry";
import type { WorkerPendingStore } from "../../apps/admin/lib/ai/pending-store";

const POST_CREATED = "community.post.created.v1";
const COMMENT_CREATED = "community.comment.created.v1";
const POST = POSTS.memberPublished; // qna·published 시드 글
const E1 = "e1111111-1111-1111-1111-111111111111";
const E2 = "e2222222-2222-2222-2222-222222222222";
const E3 = "e3333333-3333-3333-3333-333333333333";
const CE = "ce000000-0000-0000-0000-000000000001";

// 즉시 만기(delaySeconds 0) 룰 — 예약과 동시에 claim 가능.
const fastRule: GuardrailRule = {
  ...SALES_COMMUNITY_RULE,
  triggers: { ...SALES_COMMUNITY_RULE.triggers, delaySeconds: 0 },
};

function outboxPostEvent(eventId: string, postId: string): OutboxEvent {
  return {
    id: eventId,
    type: POST_CREATED,
    specVersion: 1,
    occurredAt: "2026-07-20T00:00:00.000Z",
    traceId: "trace",
    actor: { type: "user", id: USERS.member },
    subject: { type: "post", id: postId },
    data: { boardId: "b", boardSlug: "qna", aiReplyEnabled: true },
    attemptCount: 1,
    maxAttempts: 8,
  };
}

function outboxCommentEvent(
  eventId: string,
  postId: string,
  actorType: "user" | "service",
): OutboxEvent {
  return {
    id: eventId,
    type: COMMENT_CREATED,
    specVersion: 1,
    occurredAt: "2026-07-20T00:01:00.000Z",
    traceId: "trace",
    actor: { type: actorType, id: USERS.member },
    subject: { type: "comment", id: "cmt" },
    data: { postId, boardId: "b", parentId: null },
    attemptCount: 1,
    maxAttempts: 8,
  };
}

// consumed_events 기반 실 멱등 가드(worker.ts와 동일 배선).
const guard: ConsumedGuard = {
  async isConsumed(consumer, eventId) {
    const r = await pool.query<{ c: boolean }>(
      "select app_private.is_event_consumed($1,$2) c",
      [consumer, eventId],
    );
    return r.rows[0]?.c ?? false;
  },
  async markConsumed(consumer, eventId) {
    await pool.query("select app_private.mark_event_consumed($1,$2)", [
      consumer,
      eventId,
    ]);
  },
};

// fastRule(delaySeconds 0)의 dueAt은 SDK가 JS 시계(Date.now())로 잡는데 claim은 DB now()로 판정한다.
// CI에서 두 컨테이너 시계가 몇 ms만 어긋나도 due 경계 레이스로 claim이 비게 된다 → claim 직전 due를
// 과거로 못박아 결정적으로 만든다(프로덕션은 delaySeconds=90이라 무관, 테스트 전용 안정화).
const makeDue = () =>
  pool.query(
    "update public.ai_pending_answers set due_at = now() - interval '1 second' where post_id=$1",
    [POST],
  );

let posted: Array<{ postId: string; content: string; idempotencyKey: string }>;
let mockClient: CommentApiClient;
let handlers: Record<string, (e: OutboxEvent) => Promise<void>>;
let store: WorkerPendingStore;
// 워커 happy path 모사: due 고정 → processDue(lease+처리) → 성공 시 commitProcessed로 소비 확정(삭제).
let processDue: (max?: number) => Promise<unknown[]>;

beforeEach(() => {
  posted = [];
  mockClient = {
    async postComment(input) {
      posted.push(input);
      return { commentId: `mock-${posted.length}` };
    },
  };
  const consumer = createAiConsumer(pool, {
    rule: fastRule,
    provider: new MockChatProvider({ answer: "테스트 답변입니다" }),
    commentClient: mockClient,
  });
  handlers = buildFanoutHandlers(
    consumer.registrations,
    guard,
  ) as typeof handlers;
  store = consumer.pendingStore;
  processDue = async (max) => {
    await makeDue(); // 시계 스큐 제거 — claim이 결정적으로 due를 집게 한다
    const results = await consumer.processDue(max);
    await store.commitProcessed(); // 전량 성공 → 소비 확정(삭제)
    return results;
  };
});

afterEach(async () => {
  await pool.query("delete from public.ai_pending_answers where post_id = $1", [
    POST,
  ]);
  await pool.query(
    "delete from public.consumed_events where event_id = any($1::uuid[])",
    [[E1, E2, E3, CE]],
  );
});
afterAll(async () => {
  await pool.end();
});

describe("AI 구독 실배선 체인", () => {
  it("post.created → 예약 → 만기 처리 → 봇 write-back(Idempotency-Key=event.id)", async () => {
    await handlers[POST_CREATED](outboxPostEvent(E1, POST));

    const pending = await pool.query(
      "select post_id from public.ai_pending_answers where post_id=$1",
      [POST],
    );
    expect(pending.rows).toHaveLength(1); // 지연 예약됨

    const results = (await processDue()) as Array<{ action: string }>;
    expect(results.some((r) => r.action === "post")).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ postId: POST, idempotencyKey: E1 });

    // 처리 성공 → commitProcessed로 소비 확정(삭제)
    const after = await pool.query(
      "select 1 from public.ai_pending_answers where post_id=$1",
      [POST],
    );
    expect(after.rows).toHaveLength(0);
  });

  it("동일 이벤트 재전달 시 중복 예약·중복 답글 0 (AC-107)", async () => {
    await handlers[POST_CREATED](outboxPostEvent(E1, POST));
    await processDue();
    expect(posted).toHaveLength(1);

    // 같은 event.id 재전달 → consumed_events가 스킵 → 재예약 안 됨
    await handlers[POST_CREATED](outboxPostEvent(E1, POST));
    const pending = await pool.query(
      "select 1 from public.ai_pending_answers where post_id=$1",
      [POST],
    );
    expect(pending.rows).toHaveLength(0);
    await processDue();
    expect(posted).toHaveLength(1); // 추가 답글 없음
  });

  it("사람 댓글(actor=user) 도래 시 마중물 취소 → 답글 안 나감", async () => {
    await handlers[POST_CREATED](outboxPostEvent(E2, POST));
    await handlers[COMMENT_CREATED](outboxCommentEvent(CE, POST, "user"));

    const pending = await pool.query(
      "select 1 from public.ai_pending_answers where post_id=$1",
      [POST],
    );
    expect(pending.rows).toHaveLength(0); // 취소됨
    const results = (await processDue()) as unknown[];
    expect(results).toHaveLength(0);
    expect(posted).toHaveLength(0);
  });

  it("봇/시스템 댓글(actor=service)은 마중물을 취소하지 않는다", async () => {
    await handlers[POST_CREATED](outboxPostEvent(E3, POST));
    await handlers[COMMENT_CREATED](outboxCommentEvent(CE, POST, "service"));

    const pending = await pool.query(
      "select 1 from public.ai_pending_answers where post_id=$1",
      [POST],
    );
    expect(pending.rows).toHaveLength(1); // 유지
    await processDue();
    expect(posted).toHaveLength(1); // 정상 답글
  });
});
