import {
  MockChatProvider,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
  getPromptPack,
  onCommentCreated,
  onPostCreated,
  processDueAnswers,
  runAnswerPipeline,
  type ActorType,
  type CommentApiClient,
  type PendingAnswerStore,
  type PostCreatedEvent,
  type SubscriptionDeps,
} from "@wigtn/ai-pipeline-sdk";
import type {
  JsonObject,
  OutboxEvent,
  OutboxHandler,
} from "@wigtn/backoffice-frame";
import type { Pool } from "pg";
import { OpenAiResponsesProvider } from "./openai-responses-provider.js";

/**
 * RLS 를 우회하는 함수들이 사는 스키마.
 *
 * SQL 문자열에 `app_private.` 를 그대로 박아 뒀었다. 전용 Supabase
 * 프로젝트면 맞는데, 공용 프로젝트에 여러 서비스를 얹으면 스키마가
 * 프로젝트마다 다르다(이 데모는 stg_fieldnote_private).
 *
 * 그래서 워커가 배포본과 다른 DB 를 보고 있었다. 방문자가 질문을 올리면
 * 큐에는 쌓이는데 아무도 처리하지 않는다 - 화면은 "답변을 만들고 있습니다"
 * 에서 멈춘다. 오류가 안 나서 원인이 안 드러난다.
 *
 * 기본값은 그대로 `app_private` 다. 로컬 개발은 아무것도 안 바꿔도 된다.
 */
const PRIVATE_SCHEMA = process.env.DB_PRIVATE_SCHEMA ?? "app_private";

type ClaimRow = { post_id: string; event: PostCreatedEvent; enqueued_at: Date };
type DemoAiClaimRow = {
  request_id: string;
  user_id: string;
  title: string;
  body: string;
  attempt_count: number;
  enqueued_at: Date;
};

const DEMO_ANSWER_FORMAT = {
  name: "fieldnote_sales_answer",
  description: "영업 질문에 대한 근거 있는 판단과 다음 미팅 실행안",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description:
          "질문 속 의사결정 구조와 막힌 지점을 짚는 두세 문장의 핵심 판단",
      },
      clarifyingQuestions: {
        type: "array",
        description:
          "다음 미팅에서 상대에게 그대로 물어볼 수 있는 구체적인 확인 질문 세 가지",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
      actions: {
        type: "array",
        description:
          "질문자가 다음 미팅 전후에 실행할 수 있는 구체적인 행동 세 가지",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
      caution: {
        type: "string",
        description: "실행할 때 놓치기 쉬운 주의점 한두 문장",
      },
      missingContext: {
        type: "array",
        description:
          "정확한 판단을 위해 질문자에게 추가로 필요한 정보. 충분하면 빈 배열",
        minItems: 0,
        maxItems: 3,
        items: { type: "string" },
      },
    },
    required: [
      "summary",
      "clarifyingQuestions",
      "actions",
      "caution",
      "missingContext",
    ],
  },
} as const;
type WorkerPendingStore = PendingAnswerStore & {
  commitProcessed(): Promise<number>;
  resetClaim(): void;
};

function pendingStore(pool: Pool): WorkerPendingStore {
  let claimed: string[] = [];
  return {
    async schedule({ postId, event, dueAt }) {
      await pool.query(
        `select ${PRIVATE_SCHEMA}.schedule_ai_answer($1, $2::jsonb, to_timestamp($3 / 1000.0))`,
        [postId, JSON.stringify(event), dueAt],
      );
    },
    async cancel(postId) {
      const result = await pool.query<{ cancelled: boolean }>(
        `select ${PRIVATE_SCHEMA}.cancel_ai_answer($1) as cancelled`,
        [postId],
      );
      return result.rows[0]?.cancelled ?? false;
    },
    async claimDue(_nowMs, max) {
      const result = await pool.query<ClaimRow>(
        `select post_id, event, enqueued_at from ${PRIVATE_SCHEMA}.claim_due_ai_answers($1)`,
        [max],
      );
      claimed = result.rows.map((row) => row.post_id);
      return result.rows.map((row) => ({
        event: row.event,
        enqueuedAt: row.enqueued_at.getTime(),
      }));
    },
    async commitProcessed() {
      if (claimed.length === 0) return 0;
      const ids = claimed;
      claimed = [];
      const result = await pool.query<{ deleted: number }>(
        `select ${PRIVATE_SCHEMA}.delete_ai_answers($1::uuid[]) as deleted`,
        [ids],
      );
      return result.rows[0]?.deleted ?? 0;
    },
    resetClaim() {
      claimed = [];
    },
  };
}

let botToken: { value: string; expiresAt: number } | undefined;
async function getBotToken(): Promise<string> {
  if (botToken && botToken.expiresAt > Date.now() + 60_000)
    return botToken.value;
  const baseUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY;
  const email = process.env.AI_BOT_EMAIL ?? "ai-bot@demo.test";
  const password = process.env.AI_BOT_PASSWORD ?? "password";
  if (!baseUrl || !apiKey)
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok)
    throw new Error(`AI bot sign-in failed: ${response.status}`);
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token)
    throw new Error("AI bot sign-in returned no access token");
  botToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return botToken.value;
}

function commentClient(): CommentApiClient {
  return {
    async postComment(input) {
      const baseUrl = process.env.SUPABASE_URL;
      const apiKey = process.env.SUPABASE_ANON_KEY;
      if (!baseUrl || !apiKey)
        throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
      const id = crypto.randomUUID();
      const response = await fetch(`${baseUrl}/rest/v1/rpc/create_comment`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${await getBotToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_comment_id: id,
          p_post_id: input.postId,
          p_parent_id: null,
          p_body: input.content,
          p_idempotency_key: input.idempotencyKey,
          p_trace_id: input.idempotencyKey,
        }),
      });
      if (!response.ok)
        throw new Error(`comment RPC failed: ${response.status}`);
      return { commentId: id };
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function actor(value: unknown): ActorType {
  return ["user", "admin", "service", "system"].includes(string(value))
    ? (string(value) as ActorType)
    : "user";
}
function envelope(event: OutboxEvent) {
  const eventActor = object(event.actor);
  const subject = object(event.subject);
  return {
    specVersion: "1" as const,
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    traceId: event.traceId ?? "",
    actor: { type: actor(eventActor.type), id: string(eventActor.id) },
    subject: { type: string(subject.type), id: string(subject.id) },
  };
}

export function toPostCreated(event: OutboxEvent) {
  const base = envelope(event);
  const data = object(event.data);
  return {
    ...base,
    data: {
      postId: base.subject.id,
      boardType: string(data.boardSlug),
      authorId: base.actor.id,
      createdAt: event.occurredAt,
    },
  };
}
export function toCommentCreated(event: OutboxEvent) {
  const base = envelope(event);
  const data = object(event.data);
  return {
    ...base,
    data: { postId: string(data.postId), commentId: base.subject.id },
  };
}

export function createAiRuntime(pool: Pool) {
  const pending = pendingStore(pool);
  const provider = process.env.OPENAI_API_KEY
    ? new OpenAiResponsesProvider({ apiKey: process.env.OPENAI_API_KEY })
    : new MockChatProvider();
  const rule = {
    ...SALES_COMMUNITY_RULE,
    provider: {
      ...SALES_COMMUNITY_RULE.provider,
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    },
  };
  const fetchPost: SubscriptionDeps["pipeline"]["fetchPost"] = async (
    postId,
  ) => {
    const result = await pool.query<{
      post_id: string;
      board_type: string;
      title: string;
      body: string;
      available: boolean;
    }>(
      `select post_id, board_type, title, body, available from ${PRIVATE_SCHEMA}.fetch_post_snapshot($1)`,
      [postId],
    );
    const row = result.rows[0];
    return row
      ? {
          postId: row.post_id,
          boardType: row.board_type,
          title: row.title,
          body: row.body,
          available: row.available,
        }
      : { postId, boardType: "", title: "", body: "", available: false };
  };
  const deps: SubscriptionDeps = {
    rule,
    pipeline: {
      provider,
      denylists: SAMPLE_DENYLISTS,
      promptPack: getPromptPack(rule.promptPack),
      fetchPost,
      newId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      clock: () => Date.now(),
    },
    commentClient: commentClient(),
    pending,
    nowMs: () => Date.now(),
  };
  const handlers: Record<string, OutboxHandler> = {
    "community.post.created.v1": async (event) => {
      await onPostCreated(toPostCreated(event), deps);
    },
    "community.comment.created.v1": async (event) => {
      await onCommentCreated(toCommentCreated(event), deps);
    },
  };
  return {
    handlers,
    async processDemoRequests() {
      const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 25);
      const claimed = await pool.query<DemoAiClaimRow>(
        `select * from ${PRIVATE_SCHEMA}.claim_demo_ai_requests($1, $2)`,
        [batchSize, 45],
      );
      let ready = 0;
      let blocked = 0;
      let failed = 0;
      for (const row of claimed.rows) {
        const event: PostCreatedEvent = {
          specVersion: "1",
          id: `demo-ai:${row.request_id}:${row.attempt_count}`,
          type: "community.post.created.v1",
          occurredAt: row.enqueued_at.toISOString(),
          traceId: row.request_id,
          actor: { type: "user", id: row.user_id },
          subject: { type: "post", id: row.request_id },
          data: {
            postId: row.request_id,
            boardType: "qna",
            authorId: row.user_id,
            createdAt: row.enqueued_at.toISOString(),
          },
        };
        try {
          const result = await runAnswerPipeline(event, rule, {
            ...deps.pipeline,
            promptPack: {
              ...deps.pipeline.promptPack,
              guardText: [
                deps.pipeline.promptPack.guardText,
                "질문의 표면적인 표현을 반복하지 말고, 의사결정자·사용자·검토 기준·다음 합의 중 무엇이 막혔는지 판단합니다.",
                "확인 질문은 질문자가 다음 미팅에서 상대에게 그대로 말할 수 있는 문장으로 씁니다.",
                "행동은 담당자와 완료 조건이 드러나도록 쓰고, 모호한 조언이나 일반론은 제외합니다.",
                "질문에 없는 사실을 만들지 않습니다. 판단에 필요한 정보가 빠졌다면 missingContext에 짧게 적습니다.",
                "Markdown 기호나 제목 표시는 쓰지 않고 각 필드 안에는 자연스러운 문장만 작성합니다.",
              ].join("\n"),
            },
            responseFormat: DEMO_ANSWER_FORMAT,
            fetchPost: async () => ({
              postId: row.request_id,
              boardType: "qna",
              title: row.title,
              body: row.body,
              available: true,
            }),
          });
          const reasons = result.log?.guardrail.reasons ?? [];
          if (result.action === "post" && result.comment) {
            await pool.query(
              `select ${PRIVATE_SCHEMA}.complete_demo_ai_request($1, 'ready', $2, $3::jsonb, $4, $5::jsonb)`,
              [
                row.request_id,
                result.comment.content,
                JSON.stringify(reasons),
                result.log?.model ?? rule.provider.model,
                JSON.stringify(result.log?.tokens ?? {}),
              ],
            );
            ready += 1;
          } else if (result.status.startsWith("skipped_")) {
            await pool.query(
              `select ${PRIVATE_SCHEMA}.complete_demo_ai_request($1, 'blocked', null, $2::jsonb, $3, $4::jsonb)`,
              [
                row.request_id,
                JSON.stringify(reasons),
                result.log?.model ?? rule.provider.model,
                JSON.stringify(result.log?.tokens ?? {}),
              ],
            );
            blocked += 1;
          } else {
            await pool.query(
              `select ${PRIVATE_SCHEMA}.fail_demo_ai_request($1, $2)`,
              [row.request_id, String(result.status)],
            );
            failed += 1;
          }
        } catch (error) {
          await pool.query(
            `select ${PRIVATE_SCHEMA}.fail_demo_ai_request($1, $2)`,
            [
              row.request_id,
              error instanceof Error ? error.name : "worker_error",
            ],
          );
          failed += 1;
        }
      }
      return { claimed: claimed.rowCount ?? 0, ready, blocked, failed };
    },
    async processDue() {
      try {
        const results = await processDueAnswers(
          deps,
          Number(process.env.WORKER_BATCH_SIZE ?? 25),
        );
        const committed = await pending.commitProcessed();
        return {
          processed: results.length,
          posted: results.filter((result) => result.action === "post").length,
          committed,
        };
      } catch (error) {
        pending.resetClaim();
        throw error;
      }
    },
  };
}

export type { JsonObject };
