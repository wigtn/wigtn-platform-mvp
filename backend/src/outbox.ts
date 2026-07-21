import {
  runOutboxBatch,
  type JsonObject,
  type OutboxEvent,
  type OutboxStore,
} from "@wigtn/backoffice-frame";
import pg from "pg";
import { createAiRuntime } from "./ai/runtime.js";

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
        "select * from app_private.claim_outbox_batch($1, $2, make_interval(secs => $3), $4::text[])",
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
        "select app_private.ack_outbox($1, $2) as acknowledged",
        [eventId, workerId],
      );
      return result.rows[0]?.acknowledged ?? false;
    },
    async fail(eventId, workerId, error) {
      const result = await pool.query<{ status: "pending" | "dead" }>(
        "select app_private.fail_outbox($1, $2, $3) as status",
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
      return { outbox, due };
    },
    close: () => pool.end(),
  };
}
