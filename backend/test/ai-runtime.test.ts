import { describe, expect, it } from "vitest";
import type { OutboxEvent } from "@wigtn/backoffice-frame";
import { __test } from "../src/ai/openai-responses-provider.js";
import { toCommentCreated, toPostCreated } from "../src/ai/runtime.js";

const event = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: "event-1",
  type: "community.post.created.v1",
  specVersion: 1,
  occurredAt: "2026-07-21T00:00:00.000Z",
  traceId: "trace-1",
  actor: { type: "user", id: "user-1" },
  subject: { type: "post", id: "post-1" },
  data: { boardId: "board-id", boardSlug: "qna" },
  attemptCount: 0,
  maxAttempts: 8,
  ...overrides,
});

describe("AI runtime mapping", () => {
  it("uses the board slug and subject id for post events", () => {
    expect(toPostCreated(event()).data).toMatchObject({
      postId: "post-1",
      boardType: "qna",
      authorId: "user-1",
    });
  });
  it("fails closed to a human actor for unknown comment actor types", () => {
    expect(
      toCommentCreated(
        event({
          actor: { type: "future-bot", id: "bot" },
          data: { postId: "post-1" },
        }),
      ).actor.type,
    ).toBe("user");
  });
  it("extracts text from a raw Responses API payload", () => {
    expect(
      __test.responseText({
        output: [{ content: [{ type: "output_text", text: "답변입니다." }] }],
      }),
    ).toBe("답변입니다.");
  });
});
