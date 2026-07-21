import {
  MockChatProvider,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
  getPromptPack,
  onCommentCreated,
  onPostCreated,
  processDueAnswers,
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

type ClaimRow = { post_id: string; event: PostCreatedEvent; enqueued_at: Date };
type WorkerPendingStore = PendingAnswerStore & {
  commitProcessed(): Promise<number>;
  resetClaim(): void;
};

function pendingStore(pool: Pool): WorkerPendingStore {
  let claimed: string[] = [];
  return {
    async schedule({ postId, event, dueAt }) {
      await pool.query(
        "select app_private.schedule_ai_answer($1, $2::jsonb, to_timestamp($3 / 1000.0))",
        [postId, JSON.stringify(event), dueAt],
      );
    },
    async cancel(postId) {
      const result = await pool.query<{ cancelled: boolean }>(
        "select app_private.cancel_ai_answer($1) as cancelled",
        [postId],
      );
      return result.rows[0]?.cancelled ?? false;
    },
    async claimDue(_nowMs, max) {
      const result = await pool.query<ClaimRow>(
        "select post_id, event, enqueued_at from app_private.claim_due_ai_answers($1)",
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
        "select app_private.delete_ai_answers($1::uuid[]) as deleted",
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
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
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
      "select post_id, board_type, title, body, available from app_private.fetch_post_snapshot($1)",
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
