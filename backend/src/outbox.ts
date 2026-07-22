import {
  runOutboxBatch,
  type JsonObject,
  type OutboxEvent,
  type OutboxStore,
} from "@wigtn/backoffice-frame";
import pg from "pg";
import { createAiRuntime } from "./ai/runtime.js";

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

type Row = {
  id: string;
  type: string;
  spec_version: number;
  occurred_at: Date;
  trace_id: string | null;
  actor: JsonObject;
  subject: JsonObject;
  data: JsonObject;
  attempt_count: number;
  max_attempts: number;
};

export function createWorker(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    statement_timeout: 10_000,
    application_name: "wigtn-platform-outbox",
  });
  const ai = createAiRuntime(pool);
  const store: OutboxStore = {
    async claim({ workerId, batchSize, leaseSeconds, eventTypes }) {
      const result = await pool.query<Row>(
        `select * from ${PRIVATE_SCHEMA}.claim_outbox_batch($1, $2, make_interval(secs => $3), $4::text[])`,
        [workerId, batchSize, leaseSeconds, eventTypes],
      );
      return result.rows.map((row): OutboxEvent => ({
        id: row.id,
        type: row.type,
        specVersion: row.spec_version,
        occurredAt: row.occurred_at.toISOString(),
        traceId: row.trace_id,
        actor: row.actor,
        subject: row.subject,
        data: row.data,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
      }));
    },
    async ack(eventId, workerId) {
      const result = await pool.query<{ acknowledged: boolean }>(
        `select ${PRIVATE_SCHEMA}.ack_outbox($1, $2) as acknowledged`,
        [eventId, workerId],
      );
      return result.rows[0]?.acknowledged ?? false;
    },
    async fail(eventId, workerId, error) {
      const result = await pool.query<{ status: "pending" | "dead" }>(
        `select ${PRIVATE_SCHEMA}.fail_outbox($1, $2, $3) as status`,
        [eventId, workerId, error],
      );
      if (!result.rows[0]) throw new Error(`outbox lease lost: ${eventId}`);
      return result.rows[0].status;
    },
  };
  return {
    async tick() {
      const outbox = await runOutboxBatch({
        store,
        handlers: ai.handlers,
        workerId: `sales-ai-${process.pid}`,
        batchSize: Number(process.env.WORKER_BATCH_SIZE ?? 25),
        leaseSeconds: 45,
        maxExecutionMs: 45_000,
      });
      const due = await ai.processDue();
      const demo = await ai.processDemoRequests();
      return { outbox, due, demo };
    },
    close: () => pool.end(),
  };
}
