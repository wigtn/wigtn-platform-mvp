import { describe, expect, it } from "vitest";

import {
  MockChatProvider,
  runAnswerPipeline,
  isHumanAnswerCancel,
  getPromptPack,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
  type PostCreatedEvent,
  type CommentCreatedEvent,
  type PipelineDeps,
  type PostSnapshot,
} from "../src/index";

let seq = 0;
const deps = (overrides: Partial<PipelineDeps> = {}): PipelineDeps => ({
  provider: new MockChatProvider({
    answer: "상황에 따라 다를 수 있어요. 커뮤니티 의견도 참고하세요.",
  }),
  denylists: SAMPLE_DENYLISTS,
  promptPack: getPromptPack("sales-mentor-v1"),
  fetchPost: async (postId): Promise<PostSnapshot> => ({
    postId,
    boardType: "qna",
    title: "영업 초반 어떻게 접근하나요",
    body: "신규 고객 콜드콜이 어렵습니다.",
    available: true,
  }),
  newId: () => `log-${++seq}`,
  now: () => "2026-07-19T00:00:00.000Z",
  ...overrides,
});

const postEvent = (
  data: Partial<PostCreatedEvent["data"]> = {},
): PostCreatedEvent => ({
  specVersion: "1",
  id: "evt-1",
  type: "community.post.created.v1",
  occurredAt: "2026-07-19T00:00:00.000Z",
  traceId: "trace-1",
  actor: { type: "user", id: "u1" },
  subject: { type: "post", id: "p1" },
  data: {
    postId: "p1",
    boardType: "qna",
    authorId: "u1",
    createdAt: "2026-07-19T00:00:00.000Z",
    ...data,
  },
});

describe("파이프라인 (§1)", () => {
  it("트리거 아닌 board는 ignored (로그 없음)", async () => {
    const r = await runAnswerPipeline(
      postEvent({ boardType: "free" }),
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(r.action).toBe("ignored");
    expect(r.log).toBeUndefined();
  });

  it("정상 흐름: 답변 등록 + 멱등키=이벤트id + posted 로그", async () => {
    const r = await runAnswerPipeline(
      postEvent(),
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(r.action).toBe("post");
    expect(r.comment?.idempotencyKey).toBe("evt-1"); // §1.1 멱등키 재사용
    expect(r.comment?.content).toContain("커뮤니티");
    expect(r.log?.status).toBe("posted");
    expect(r.log?.projectId).toBe("sales-community"); // 룰에서 주입(§1.1)
  });

  it("원글 삭제/블라인드 → skipped_post_unavailable", async () => {
    const d = deps({
      fetchPost: async (postId) => ({
        postId,
        boardType: "qna",
        title: "",
        body: "",
        available: false,
      }),
    });
    const r = await runAnswerPipeline(postEvent(), SALES_COMMUNITY_RULE, d);
    expect(r.action).toBe("skip");
    expect(r.log?.status).toBe("skipped_post_unavailable");
  });

  it("pre 모더레이션 차단 → skipped_pre_moderation", async () => {
    const d = deps({
      provider: new MockChatProvider({ triggerCategories: { hate: ["증오"] } }),
      fetchPost: async (postId) => ({
        postId,
        boardType: "qna",
        title: "증오 표현 질문",
        body: "증오",
        available: true,
      }),
    });
    const r = await runAnswerPipeline(postEvent(), SALES_COMMUNITY_RULE, d);
    expect(r.log?.status).toBe("skipped_pre_moderation");
    expect(r.log?.guardrail.preBlocked).toBe(true);
  });

  it("post 가드 차단(회사 실명) → skipped_post_moderation", async () => {
    const d = deps({
      provider: new MockChatProvider({ answer: "삼성전자가 답입니다" }),
    });
    const r = await runAnswerPipeline(postEvent(), SALES_COMMUNITY_RULE, d);
    expect(r.action).toBe("skip");
    expect(r.log?.status).toBe("skipped_post_moderation");
    expect(r.log?.guardrail.reasons).toContain("company_name");
  });

  it("provider timeout → failed_timeout", async () => {
    const d = deps({ provider: new MockChatProvider({ fail: "timeout" }) });
    const r = await runAnswerPipeline(postEvent(), SALES_COMMUNITY_RULE, d);
    expect(r.log?.status).toBe("failed_timeout");
  });

  it("마중물 취소: 사람 댓글이면 취소, 봇 댓글이면 유지", () => {
    const human: CommentCreatedEvent = {
      specVersion: "1",
      id: "c1",
      type: "community.comment.created.v1",
      occurredAt: "x",
      traceId: "t",
      actor: { type: "user", id: "u2" },
      subject: { type: "comment", id: "c1" },
      data: { postId: "p1", commentId: "c1" },
    };
    const bot: CommentCreatedEvent = {
      ...human,
      actor: { type: "service", id: "bot" },
    };
    expect(isHumanAnswerCancel(human, SALES_COMMUNITY_RULE)).toBe(true);
    expect(isHumanAnswerCancel(bot, SALES_COMMUNITY_RULE)).toBe(false);
  });
});
