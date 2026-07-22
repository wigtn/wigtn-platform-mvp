import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createWorker } from "../src/outbox.js";

const enabled = process.env.RUN_OPENAI_LIVE === "1";
const supabaseUrl = "https://127.0.0.1:55321";
const publishableKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

describe.skipIf(!enabled)("실제 OpenAI 데모 경로", () => {
  it("익명 질문을 비공개 큐에서 처리해 안전성 검사된 답변을 반환한다", async () => {
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY is required for live test");
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await client.auth.signInAnonymously();
    expect(signedIn.error).toBeNull();
    expect((await client.rpc("bootstrap_demo_experience")).error).toBeNull();

    const request = await client.rpc("execute_demo_action", {
      p_action: "ai.answer.request",
      p_payload: {
        title: "첫 미팅에서 예산 대화를 시작하는 방법",
        body: "고객이 문제의 필요성은 인정하지만 예산 이야기를 미룹니다. 다음 미팅에서 어떤 순서로 질문하면 좋을까요?",
      },
      p_idempotency_key: `live-ai-${crypto.randomUUID()}`,
    });
    expect(request.error).toBeNull();

    const worker = createWorker(
      process.env.OUTBOX_DATABASE_URL ??
        "postgresql://outbox_worker:outbox_local_dev_pw@127.0.0.1:55322/postgres",
    );
    try {
      const result = await worker.tick();
      expect(result.demo.claimed).toBeGreaterThanOrEqual(1);
    } finally {
      await worker.close();
    }

    const poll = await client.rpc("execute_demo_action", {
      p_action: "ai.answer.poll",
      p_payload: { requestId: request.data.requestId },
      p_idempotency_key: `live-poll-${crypto.randomUUID()}`,
    });
    expect(poll.error).toBeNull();
    expect(poll.data.status).toBe("ready");
    expect(poll.data.model).toContain("gpt-5.6-terra");
    const answer = JSON.parse(poll.data.answer) as {
      summary: string;
      clarifyingQuestions: string[];
      actions: string[];
      caution: string;
      missingContext: string[];
    };
    expect(answer.summary.length).toBeGreaterThan(20);
    expect(answer.clarifyingQuestions).toHaveLength(3);
    expect(answer.actions).toHaveLength(3);
    expect(answer.caution.length).toBeGreaterThan(10);
    expect(Array.isArray(answer.missingContext)).toBe(true);
    expect(poll.data.answer).not.toMatch(/\*\*|^#|^>/m);
    await client.rpc("reset_demo_experience");
  }, 60_000);
});
