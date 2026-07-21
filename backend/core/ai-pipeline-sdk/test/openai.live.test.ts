/**
 * OpenAI 라이브 테스트 — 실제 API 호출(유료). OPENAI_API_KEY가 있을 때만 실행, 없으면 skip.
 * 키는 env 우선, 없으면 projects/demo/.env.local(gitignore)에서 프로그램적으로만 읽는다(값 미노출).
 * CI(키 없음)에선 자동 skip → 예산·안전. 실행: OPENAI_API_KEY=... 또는 .env.local 준비 후 `pnpm test`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  OpenAiChatProvider,
  runAnswerPipeline,
  getPromptPack,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
  type PostCreatedEvent,
} from "../src/index";

function resolveKey(): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(
      join(here, "..", "..", "..", ".env.local"),
      "utf-8",
    );
    const match = text.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
    return match?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const key = resolveKey();
let seq = 0;

const event: PostCreatedEvent = {
  specVersion: "1",
  id: "live-evt-1",
  type: "community.post.created.v1",
  occurredAt: "2026-07-19T00:00:00.000Z",
  traceId: "t",
  actor: { type: "user", id: "u1" },
  subject: { type: "post", id: "p1" },
  data: {
    postId: "p1",
    boardType: "qna",
    authorId: "u1",
    createdAt: "2026-07-19T00:00:00.000Z",
  },
};

describe.skipIf(!key)("OpenAI 라이브 (실호출·유료·키 있을 때만)", () => {
  it("실제 답변 생성 → posted 또는 가드 스킵", async () => {
    const provider = new OpenAiChatProvider({ apiKey: key });
    const result = await runAnswerPipeline(event, SALES_COMMUNITY_RULE, {
      provider,
      denylists: SAMPLE_DENYLISTS,
      promptPack: getPromptPack("sales-mentor-v1"),
      fetchPost: async (postId) => ({
        postId,
        boardType: "qna",
        title: "영업 초반 콜드콜이 어렵습니다",
        body: "신규 고객에게 처음 연락할 때 어떻게 접근하면 좋을까요?",
        available: true,
      }),
      newId: () => `live-log-${++seq}`,
      now: () => new Date().toISOString(),
      costPerToken: 0.0000006,
    });
    // 실제 응답을 눈으로 확인(키는 출력하지 않음)
    console.log("\n[LIVE] status:", result.status);
    console.log(
      "[LIVE] answer:\n",
      result.comment?.content ??
        `(skip — ${result.log?.guardrail.reasons.join(",")})`,
    );
    console.log(
      "[LIVE] tokens:",
      JSON.stringify(result.log?.tokens),
      "· cost$:",
      result.log?.costUsd,
    );
    expect(["posted", "skipped_post_moderation"]).toContain(result.status);
  }, 40_000);
});
