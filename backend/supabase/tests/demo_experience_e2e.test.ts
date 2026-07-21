import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { asUser, expectRlsDenied, USERS } from "./helpers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://127.0.0.1:55321";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

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
      p_payload: { postId: firstPost.data.id },
      p_idempotency_key: "demo-ai-request",
    });
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    const aiPoll = await first.rpc("execute_demo_action", {
      p_action: "ai.answer.poll",
      p_payload: { requestId: aiRequest.data.requestId },
      p_idempotency_key: "demo-ai-poll-ready",
    });
    expect(aiPoll.data.status).toBe("ready");
    expect(aiPoll.data.answer).toContain("목표 고객");

    const reset = await first.rpc("reset_demo_experience");
    const resetState = await first.rpc("get_demo_experience");
    expect(reset.data.reset).toBe(true);
    expect(resetState.data.actions).toHaveLength(0);
  });
});
