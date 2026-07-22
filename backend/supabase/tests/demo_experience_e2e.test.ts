import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asUser, expectRlsDenied, USERS } from "./helpers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://127.0.0.1:55321";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const workerPool = new Pool({
  connectionString:
    process.env.OUTBOX_DATABASE_URL ??
    "postgresql://outbox_worker:outbox_local_dev_pw@127.0.0.1:55322/postgres",
});

afterAll(async () => workerPool.end());

if (SUPABASE_URL.startsWith("https://127.0.0.1:")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function demoClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe("로그인 없는 격리 데모 E2E", () => {
  it("영구 회원은 데모 RPC를 호출해 실제 권한 경계를 우회하지 못한다", async () => {
    await asUser(USERS.member, async (client) => {
      await expectRlsDenied(
        client.query("select public.bootstrap_demo_experience()"),
      );
    });
  });

  it("방문자별 상태를 격리하고 실제 운영 command 권한은 열지 않는다", async () => {
    const first = demoClient();
    const second = demoClient();
    const publicClient = demoClient();

    const firstSignIn = await first.auth.signInAnonymously();
    const secondSignIn = await second.auth.signInAnonymously();
    expect(firstSignIn.error).toBeNull();
    expect(secondSignIn.error).toBeNull();
    expect(firstSignIn.data.user?.is_anonymous).toBe(true);

    const firstBootstrap = await first.rpc("bootstrap_demo_experience");
    const secondBootstrap = await second.rpc("bootstrap_demo_experience");
    expect(firstBootstrap.error).toBeNull();
    expect(secondBootstrap.error).toBeNull();
    expect(firstBootstrap.data.mode).toBe("isolated-demo");
    expect(firstBootstrap.data.realCommandAccess).toBe(false);

    const publicBootstrap = await publicClient.rpc("bootstrap_demo_experience");
    expect(publicBootstrap.error).not.toBeNull();

    const firstPost = await first.rpc("execute_demo_action", {
      p_action: "community.post.create",
      p_payload: { title: "체험 질문", board: "qna" },
      p_idempotency_key: "demo-post-one",
    });
    const firstPostRetry = await first.rpc("execute_demo_action", {
      p_action: "community.post.create",
      p_payload: { title: "중복 요청", board: "qna" },
      p_idempotency_key: "demo-post-one",
    });
    expect(firstPost.error).toBeNull();
    expect(firstPostRetry.data.id).toBe(firstPost.data.id);
    expect(firstPost.data.scope).toBe("visitor-only");

    const secondPost = await second.rpc("execute_demo_action", {
      p_action: "community.post.create",
      p_payload: { title: "두 번째 방문자", board: "qna" },
      p_idempotency_key: "demo-post-one",
    });
    expect(secondPost.data.id).not.toBe(firstPost.data.id);

    const firstState = await first.rpc("get_demo_experience");
    const secondState = await second.rpc("get_demo_experience");
    expect(firstState.data.actions).toHaveLength(1);
    expect(secondState.data.actions).toHaveLength(1);
    expect(firstState.data.actions[0].request.title).toBe("체험 질문");
    expect(secondState.data.actions[0].request.title).toBe("두 번째 방문자");

    const realPost = await first.rpc("create_post", {
      p_board_slug: "qna",
      p_post_id: crypto.randomUUID(),
      p_title: "실데이터 오염 시도",
      p_source: {
        version: 1,
        blocks: [{ type: "paragraph", text: "차단되어야 함" }],
      },
      p_attachment_ids: [],
      p_idempotency_key: "real-command-denied",
      p_trace_id: "demo-real-command-denied",
    });
    expect(realPost.error?.message).toContain("active member required");

    const adminDemo = await first.rpc("execute_demo_action", {
      p_action: "admin.member.review",
      p_payload: { applicationId: crypto.randomUUID(), decision: "approved" },
      p_idempotency_key: "demo-admin-review",
    });
    expect(adminDemo.data).toMatchObject({
      status: "approved",
      simulated: true,
    });

    const aiRequest = await first.rpc("execute_demo_action", {
      p_action: "ai.answer.request",
      p_payload: {
        title: "첫 미팅에서 예산 질문을 꺼내는 방법",
        body: "고객이 필요성은 인정하지만 예산 대화는 미루고 있습니다. 어떤 순서로 질문해야 할까요?",
      },
      p_idempotency_key: "demo-ai-request",
    });
    expect(aiRequest.error).toBeNull();
    expect(aiRequest.data.status).toBe("pending");

    const crossVisitorPoll = await second.rpc("execute_demo_action", {
      p_action: "ai.answer.poll",
      p_payload: { requestId: aiRequest.data.requestId },
      p_idempotency_key: "demo-ai-cross-visitor-poll",
    });
    expect(crossVisitorPoll.error).not.toBeNull();

    const claimed = await workerPool.query<{
      request_id: string;
      title: string;
    }>("select * from app_private.claim_demo_ai_requests($1, $2)", [10, 45]);
    const claimedRequest = claimed.rows.find(
      (row) => row.request_id === aiRequest.data.requestId,
    );
    expect(claimedRequest?.title).toBe("첫 미팅에서 예산 질문을 꺼내는 방법");
    await workerPool.query(
      "select app_private.complete_demo_ai_request($1, 'ready', $2, '[]'::jsonb, $3, $4::jsonb)",
      [
        aiRequest.data.requestId,
        "승인자와 검토 순서를 차례로 확인해 보세요.",
        "gpt-5.6-terra",
        JSON.stringify({ prompt: 20, completion: 10, total: 30 }),
      ],
    );
    const aiPoll = await first.rpc("execute_demo_action", {
      p_action: "ai.answer.poll",
      p_payload: { requestId: aiRequest.data.requestId },
      p_idempotency_key: "demo-ai-poll-ready",
    });
    expect(aiPoll.data.status).toBe("ready");
    expect(aiPoll.data.answer).toContain("승인자");
    expect(aiPoll.data.model).toBe("gpt-5.6-terra");

    const reset = await first.rpc("reset_demo_experience");
    const resetState = await first.rpc("get_demo_experience");
    expect(reset.data.reset).toBe(true);
    expect(resetState.data.actions).toHaveLength(0);
  });

  it("익명 사용자 한 명의 AI 비용을 시간당 세 건으로 제한한다", async () => {
    const client = demoClient();
    expect((await client.auth.signInAnonymously()).error).toBeNull();
    expect((await client.rpc("bootstrap_demo_experience")).error).toBeNull();
    for (let index = 0; index < 3; index += 1) {
      const result = await client.rpc("execute_demo_action", {
        p_action: "ai.answer.request",
        p_payload: {
          title: `예산 대화를 시작하는 질문 방법 ${index + 1}`,
          body: "고객의 승인 절차와 다음 미팅 참석자를 확인하려고 합니다. 어떤 순서로 물으면 좋을까요?",
        },
        p_idempotency_key: `quota-ai-request-${index}`,
      });
      expect(result.error).toBeNull();
    }
    const exceeded = await client.rpc("execute_demo_action", {
      p_action: "ai.answer.request",
      p_payload: {
        title: "예산 대화를 시작하는 네 번째 질문",
        body: "고객의 승인 절차와 다음 미팅 참석자를 확인하려고 합니다. 어떤 순서로 물으면 좋을까요?",
      },
      p_idempotency_key: "quota-ai-request-exceeded",
    });
    expect(exceeded.error?.message).toContain("quota exceeded");
    await client.rpc("reset_demo_experience");
  });
});
