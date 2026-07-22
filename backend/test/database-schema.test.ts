import { afterEach, describe, expect, it } from "vitest";
import { privateFunction } from "../src/database-schema.js";

const originalSchema = process.env.OUTBOX_PRIVATE_SCHEMA;

afterEach(() => {
  if (originalSchema === undefined) delete process.env.OUTBOX_PRIVATE_SCHEMA;
  else process.env.OUTBOX_PRIVATE_SCHEMA = originalSchema;
});

describe("privateFunction", () => {
  it("uses the local app_private default", () => {
    delete process.env.OUTBOX_PRIVATE_SCHEMA;
    expect(privateFunction("claim_demo_ai_requests")).toBe(
      '"app_private"."claim_demo_ai_requests"',
    );
  });

  it("supports a namespaced Supabase private schema", () => {
    process.env.OUTBOX_PRIVATE_SCHEMA = "stg_fieldnote_private";
    expect(privateFunction("claim_demo_ai_requests")).toBe(
      '"stg_fieldnote_private"."claim_demo_ai_requests"',
    );
  });

  it("rejects identifiers that could alter the SQL statement", () => {
    process.env.OUTBOX_PRIVATE_SCHEMA = "stg_fieldnote_private; drop schema";
    expect(() => privateFunction("claim_demo_ai_requests")).toThrow(
      "lowercase Postgres identifier",
    );
  });
});
