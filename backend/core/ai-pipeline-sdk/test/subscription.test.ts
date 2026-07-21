import { describe, expect, it } from "vitest";

import {
  MockChatProvider,
  onPostCreated,
  onCommentCreated,
  processDueAnswers,
  getPromptPack,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
  type CommentApiClient,
  type PendingAnswerStore,
  type PipelineDeps,
  type PostCreatedEvent,
  type CommentCreatedEvent,
  type SubscriptionDeps,
} from "../src/index";

// 인메모리 지연 저장소(테스트용) — 실제는 현상 outbox process_after.
function memStore(): PendingAnswerStore & { size: () => number } {
  const map = new Map<
    string,
    { event: PostCreatedEvent; dueAt: number; enqueuedAt: number }
  >();
  let clock = 1000;
  return {
    async schedule({ postId, event, dueAt }) {
      map.set(postId, { event, dueAt, enqueuedAt: clock });
    },
    async cancel(postId) {
      return map.delete(postId);
    },
    async claimDue(nowMs, max) {
      const due = [...map.values()]
        .filter((e) => e.dueAt <= nowMs)
        .slice(0, max);
      for (const e of due) map.delete(e.event.data.postId);
      return due.map((e) => ({ event: e.event, enqueuedAt: e.enqueuedAt }));
    },
    size: () => map.size,
  };
}

function mockCommentClient(): CommentApiClient & {
  calls: Array<{ postId: string; idempotencyKey: string }>;
} {
  const calls: Array<{ postId: string; idempotencyKey: string }> = [];
  return {
    calls,
    async postComment({ postId, idempotencyKey }) {
      calls.push({ postId, idempotencyKey });
      return { commentId: `cmt-${calls.length}` };
    },
  };
}

const pipelineDeps = (answer: string): PipelineDeps => ({
  provider: new MockChatProvider({ answer }),
  denylists: SAMPLE_DENYLISTS,
  promptPack: getPromptPack("sales-mentor-v1"),
  fetchPost: async (postId) => ({
    postId,
    boardType: "qna",
    title: "제목",
    body: "본문",
    available: true,
  }),
  newId: () => "log-1",
  now: () => "2026-07-19T00:00:00.000Z",
});

const postEvent: PostCreatedEvent = {
  specVersion: "1",
  id: "evt-1",
  type: "community.post.created.v1",
  occurredAt: "x",
  traceId: "t",
  actor: { type: "user", id: "u1" },
  subject: { type: "post", id: "p1" },
  data: { postId: "p1", boardType: "qna", authorId: "u1", createdAt: "x" },
};
const humanComment: CommentCreatedEvent = {
  specVersion: "1",
  id: "c1",
  type: "community.comment.created.v1",
  occurredAt: "x",
  traceId: "t",
  actor: { type: "user", id: "u2" },
  subject: { type: "comment", id: "c1" },
  data: { postId: "p1", commentId: "c1" },
};

describe("구독 계층 (§1.2 Track B)", () => {
  const deps = (answer = "상황에 따라 다를 수 있어요"): SubscriptionDeps => ({
    rule: SALES_COMMUNITY_RULE,
    pipeline: pipelineDeps(answer),
    commentClient: mockCommentClient(),
    pending: memStore(),
    nowMs: () => 2000,
  });

  it("post.created → 지연 예약(즉시 답변 안 함)", async () => {
    const d = deps();
    const r = await onPostCreated(postEvent, d);
    expect(r.scheduled).toBe(true);
    expect(
      (d.commentClient as ReturnType<typeof mockCommentClient>).calls,
    ).toHaveLength(0);
  });

  it("트리거 아닌 board는 예약 안 함", async () => {
    const r = await onPostCreated(
      { ...postEvent, data: { ...postEvent.data, boardType: "free" } },
      deps(),
    );
    expect(r.scheduled).toBe(false);
  });

  it("사람 댓글 → 마중물 취소, 만기 처리 시 답변 없음", async () => {
    const d = deps();
    await onPostCreated(postEvent, d);
    const cancel = await onCommentCreated(humanComment, d);
    expect(cancel.cancelled).toBe(true);
    const results = await processDueAnswers({ ...d, nowMs: () => 999_999 });
    expect(results).toHaveLength(0); // 취소돼서 만기 대상 없음
  });

  it("취소 없으면 만기 시 pipeline 실행 + write-back(멱등키=이벤트id)", async () => {
    const client = mockCommentClient();
    const d: SubscriptionDeps = {
      ...deps(),
      commentClient: client,
      pending: memStore(),
    };
    await onPostCreated(postEvent, d);
    const results = await processDueAnswers({ ...d, nowMs: () => 999_999 });
    expect(results[0]?.status).toBe("posted");
    expect(client.calls[0]?.idempotencyKey).toBe("evt-1"); // §1.3 멱등
    expect(results[0]?.log?.latency.queuedMs).toBeGreaterThan(0); // 실계측
  });

  it("봇 댓글은 취소하지 않음", async () => {
    const bot: CommentCreatedEvent = {
      ...humanComment,
      actor: { type: "service", id: "bot" },
    };
    const r = await onCommentCreated(bot, deps());
    expect(r.cancelled).toBe(false);
  });
});
