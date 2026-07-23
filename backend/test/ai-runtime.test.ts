import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutboxEvent } from "@wigtn/backoffice-frame";
import {
  __test,
  OpenAiResponsesProvider,
} from "../src/ai/openai-responses-provider.js";
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

afterEach(() => vi.restoreAllMocks());

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

  it("caps output cost and sends a pseudonymous safety identifier", async () => {
    let requestBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          output_text: "승인자와 검토 순서를 먼저 확인해 보세요.",
          model: "gpt-5.6-terra",
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const provider = new OpenAiResponsesProvider({ apiKey: "test-key" });
    const result = await provider.complete({
      messages: [
        { role: "system", content: "안전하게 답하세요." },
        { role: "user", content: "첫 미팅 질문" },
      ],
      model: "gpt-5.6-terra",
      timeoutMs: 1_000,
      safetyIdentifier: "anonymous-user-id",
      responseFormat: {
        name: "sales_answer",
        schema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
          additionalProperties: false,
        },
      },
    });
    expect(requestBody).toMatchObject({
      model: "gpt-5.6-terra",
      reasoning: { effort: "medium" },
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "sales_answer",
          strict: true,
        },
      },
      // 1,100 에서 올렸다. 성공한 답변의 출력 토큰이 평균 522, 최대 584 라
      // 여유가 거의 없었고, 조금만 길어지면 응답이 중간에 끊겨 JSON 이
      // 완성되지 않았다(21건 중 4건). 상한을 지키는지 보는 확인이므로 값은
      // 그대로 박아 둔다 - 또 올릴 때 여기가 같이 걸리는 게 맞다.
      max_output_tokens: 2_400,
      safety_identifier: "fieldnote_anonymous-user-id",
    });
    expect(result.tokens.total).toBe(30);
  });

  it("fails closed when the provider returns no answer text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new OpenAiResponsesProvider({ apiKey: "test-key" });
    await expect(
      provider.complete({
        messages: [{ role: "user", content: "질문" }],
        model: "gpt-5.6-terra",
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("empty response");
  });
});
