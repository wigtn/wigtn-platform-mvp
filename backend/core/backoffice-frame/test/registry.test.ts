import { describe, expect, it, vi } from "vitest";

import {
  AdminToolError,
  AdminToolRegistry,
  moduleName,
  runOutboxBatch,
  toMcpToolFixture,
  validateAdminScreenConfig,
  type AdminExecutionContext,
  type OutboxEvent,
  type OutboxStore,
  type RegisteredAdminTool,
} from "../src/index";

const handler = vi.fn(async (input: { query: string }) => ({
  rows: [{ id: input.query }],
}));

const memberSearch: RegisteredAdminTool<
  { query: string },
  { rows: Array<{ id: string }> }
> = {
  manifest: {
    name: "member.search",
    version: 1,
    title: "회원 검색",
    description: "회원을 검색한다.",
    kind: "query",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string", minLength: 1 } },
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["rows"],
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id"],
            properties: { id: { type: "string" } },
          },
        },
      },
    },
    permissions: ["member.manage"],
    risk: "low",
    idempotency: "none",
    audit: {
      mode: "always",
      action: "member.search",
      captureBeforeAfter: false,
    },
    executionMode: "sync",
  },
  privateAudit: { redactPaths: ["query"] },
  execution: { handler },
};

const context: AdminExecutionContext = {
  actorId: "44444444-4444-4444-4444-444444444444",
  claims: { sub: "44444444-4444-4444-4444-444444444444" },
  permissions: new Set(["member.manage"]),
  traceId: "trace-1",
  stepUp: { recentTotp: false, activeSession: true },
};

describe("backoffice-frame registry", () => {
  it("exports the module identity", () => {
    expect(moduleName).toBe("backoffice-frame");
  });

  it("validates schemas and executes a registered tool", async () => {
    const registry = new AdminToolRegistry().register(memberSearch);
    await expect(
      registry.execute("member.search", 1, { query: "member" }, context),
    ).resolves.toMatchObject({
      tool: "member.search",
      output: { rows: [{ id: "member" }] },
    });
    await expect(
      registry.execute("member.search", 1, { query: "" }, context),
    ).rejects.toMatchObject<Partial<AdminToolError>>({ code: "INPUT_INVALID" });
  });

  it("rejects missing permission before invoking the handler", async () => {
    const registry = new AdminToolRegistry().register(memberSearch);
    await expect(
      registry.execute(
        "member.search",
        1,
        { query: "member" },
        {
          ...context,
          permissions: new Set(),
        },
      ),
    ).rejects.toMatchObject<Partial<AdminToolError>>({
      code: "PERMISSION_DENIED",
    });
  });

  it("rejects duplicate tools and unsafe command manifests", () => {
    const registry = new AdminToolRegistry().register(memberSearch);
    expect(() => registry.register(memberSearch)).toThrow(
      "duplicate admin tool",
    );
    expect(() =>
      new AdminToolRegistry().register({
        ...memberSearch,
        manifest: {
          ...memberSearch.manifest,
          name: "member.suspend",
          kind: "command",
          risk: "high",
          idempotency: "optional",
        },
      }),
    ).toThrow("requires idempotency");
    expect(() =>
      new AdminToolRegistry().register({
        ...memberSearch,
        manifest: { ...memberSearch.manifest, name: "invalid tool name" },
      }),
    ).toThrow("invalid admin tool name");
  });

  it("enforces every high-risk execution guard before the handler", async () => {
    const command = {
      ...memberSearch,
      manifest: {
        ...memberSearch.manifest,
        name: "member.suspend",
        kind: "command" as const,
        risk: "high" as const,
        idempotency: "required" as const,
      },
    };
    const registry = new AdminToolRegistry().register(command);
    const execute = (override: Partial<AdminExecutionContext>) =>
      registry.execute(
        "member.suspend",
        1,
        { query: "member" },
        { ...context, ...override },
      );

    await expect(execute({})).rejects.toMatchObject<Partial<AdminToolError>>({
      code: "STEP_UP_REQUIRED",
    });
    await expect(
      execute({ stepUp: { recentTotp: true, activeSession: false } }),
    ).rejects.toMatchObject<Partial<AdminToolError>>({
      code: "ACTIVE_SESSION_REQUIRED",
    });
    await expect(
      execute({ stepUp: { recentTotp: true, activeSession: true } }),
    ).rejects.toMatchObject<Partial<AdminToolError>>({
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
    await expect(
      execute({
        stepUp: { recentTotp: true, activeSession: true },
        idempotencyKey: "retry-key",
      }),
    ).resolves.toMatchObject({ tool: "member.suspend" });
  });

  it("returns an explicit error for an unknown tool", async () => {
    await expect(
      new AdminToolRegistry().execute("unknown", 1, {}, context),
    ).rejects.toMatchObject<Partial<AdminToolError>>({
      code: "TOOL_NOT_FOUND",
    });
  });

  it("validates screen placement and derives MCP metadata from the same source", () => {
    const registry = new AdminToolRegistry().register(memberSearch);
    const config = validateAdminScreenConfig(registry, {
      schemaVersion: 1,
      screens: [
        {
          id: "members",
          title: "회원 관리",
          route: "/members",
          requiredPermissions: ["member.manage"],
          blocks: [{ tool: "member.search@1", presentation: "data-table" }],
        },
      ],
    });
    expect(config.screens[0].blocks[0].tool).toBe("member.search@1");
    expect(toMcpToolFixture(registry)).toEqual([
      {
        name: "member.search",
        description: "회원을 검색한다.",
        inputSchema: memberSearch.manifest.inputSchema,
      },
    ]);
  });
});

const event: OutboxEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  type: "identity.user.registered.v1",
  specVersion: 1,
  occurredAt: "2026-07-19T00:00:00.000Z",
  traceId: "trace-1",
  actor: {},
  subject: { id: "22222222-2222-2222-2222-222222222222" },
  data: {},
  attemptCount: 1,
  maxAttempts: 8,
};

function outboxStore(
  events: OutboxEvent[],
  failureStatus = "pending" as const,
) {
  return {
    claim: vi.fn(async () => events),
    ack: vi.fn(async () => true),
    fail: vi.fn(async () => failureStatus),
  } satisfies OutboxStore;
}

describe("outbox batch runner", () => {
  it("does not claim events when no consumer is registered", async () => {
    const store = outboxStore([event]);

    await expect(
      runOutboxBatch({ store, handlers: {}, workerId: "worker-1" }),
    ).resolves.toEqual({ claimed: 0, processed: 0, failed: 0, dead: 0 });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("claims only registered types and acknowledges successful delivery", async () => {
    const store = outboxStore([event]);
    const handler = vi.fn(async () => undefined);

    await expect(
      runOutboxBatch({
        store,
        handlers: { [event.type]: handler },
        workerId: "worker-1",
        batchSize: 10,
      }),
    ).resolves.toEqual({ claimed: 1, processed: 1, failed: 0, dead: 0 });
    expect(store.claim).toHaveBeenCalledWith({
      workerId: "worker-1",
      batchSize: 10,
      leaseSeconds: 30,
      eventTypes: [event.type],
    });
    expect(store.ack).toHaveBeenCalledWith(event.id, "worker-1");
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("isolates handler failures and records dead-letter outcomes", async () => {
    const second = { ...event, id: "33333333-3333-3333-3333-333333333333" };
    const store = outboxStore([event, second], "dead");
    const handler = vi
      .fn<(event: OutboxEvent) => Promise<void>>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce();

    await expect(
      runOutboxBatch({
        store,
        handlers: { [event.type]: handler },
        workerId: "worker-1",
      }),
    ).resolves.toEqual({ claimed: 2, processed: 1, failed: 1, dead: 1 });
    expect(store.fail).toHaveBeenCalledWith(
      event.id,
      "worker-1",
      "provider unavailable",
    );
    expect(store.ack).toHaveBeenCalledWith(second.id, "worker-1");
  });

  it("rejects an unbounded batch configuration", async () => {
    const store = outboxStore([]);
    await expect(
      runOutboxBatch({
        store,
        handlers: { [event.type]: vi.fn() },
        workerId: "worker-1",
        batchSize: 101,
      }),
    ).rejects.toThrow("between 1 and 100");
    await expect(
      runOutboxBatch({
        store,
        handlers: { [event.type]: vi.fn() },
        workerId: "worker-1",
        maxExecutionMs: 99,
      }),
    ).rejects.toThrow("between 100 and 300000");
  });
});
