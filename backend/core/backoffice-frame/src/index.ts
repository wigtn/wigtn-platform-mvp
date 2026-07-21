import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const moduleName = "backoffice-frame";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonObjectSchema = {
  readonly [key: string]: unknown;
  readonly type: "object";
};

export type AdminToolKind = "query" | "command";
export type AdminToolRisk = "low" | "medium" | "high";
export type AdminToolExecutionMode = "sync" | "job";
export type AdminToolEffect =
  "db-write" | "file-write" | "notification-send" | "event-emit" | "ai-call";

export type AdminToolManifest = {
  name: string;
  version: number;
  title: string;
  description: string;
  kind: AdminToolKind;
  inputSchema: JsonObjectSchema;
  outputSchema: JsonObjectSchema;
  permissions: string[];
  risk: AdminToolRisk;
  idempotency: "none" | "optional" | "required";
  audit: {
    mode: "always" | "on-error" | "none";
    action: string;
    captureBeforeAfter: boolean;
  };
  executionMode: AdminToolExecutionMode;
  effects?: AdminToolEffect[];
};

export type PublicAdminToolManifest = Readonly<AdminToolManifest>;

export type AdminExecutionContext = {
  actorId: string;
  /** 서버가 서명 검증한 인증 claim. 브라우저 입력을 직접 넣지 않는다. */
  claims: JsonObject;
  permissions: ReadonlySet<string>;
  traceId: string;
  idempotencyKey?: string;
  stepUp: {
    recentTotp: boolean;
    activeSession: boolean;
  };
};

export type AdminToolHandler<I extends JsonObject, O extends JsonObject> = (
  input: I,
  context: AdminExecutionContext,
) => Promise<O>;

export type RegisteredAdminTool<
  I extends JsonObject = JsonObject,
  O extends JsonObject = JsonObject,
> = {
  manifest: AdminToolManifest;
  privateAudit: { redactPaths: string[] };
  execution: {
    /**
     * command handler는 도메인 변경·감사·outbox를 한 DB 트랜잭션으로 기록해야 한다.
     * 공통 실행기는 정책을 강제하고 handler는 원자적 영속화를 소유한다.
     */
    handler: AdminToolHandler<I, O>;
  };
};

export type AdminToolExecutionResult = {
  tool: string;
  version: number;
  traceId: string;
  output: JsonObject;
};

export class AdminToolError extends Error {
  constructor(
    readonly code:
      | "TOOL_NOT_FOUND"
      | "INPUT_INVALID"
      | "OUTPUT_INVALID"
      | "PERMISSION_DENIED"
      | "STEP_UP_REQUIRED"
      | "ACTIVE_SESSION_REQUIRED"
      | "IDEMPOTENCY_KEY_REQUIRED",
    message: string,
    readonly details?: ErrorObject[] | null,
  ) {
    super(message);
    this.name = "AdminToolError";
  }
}

type CompiledTool = {
  definition: RegisteredAdminTool;
  validateInput: ValidateFunction;
  validateOutput: ValidateFunction;
};

const TOOL_NAME = /^[A-Za-z0-9_.\/-]{1,64}$/;

function freezeManifest(manifest: AdminToolManifest): PublicAdminToolManifest {
  return Object.freeze({
    ...manifest,
    permissions: Object.freeze([
      ...manifest.permissions,
    ]) as unknown as string[],
    effects: manifest.effects
      ? (Object.freeze([...manifest.effects]) as unknown as AdminToolEffect[])
      : undefined,
    audit: Object.freeze({ ...manifest.audit }),
    inputSchema: Object.freeze({ ...manifest.inputSchema }),
    outputSchema: Object.freeze({ ...manifest.outputSchema }),
  });
}

function assertManifest(manifest: AdminToolManifest) {
  if (!TOOL_NAME.test(manifest.name)) {
    throw new Error(`invalid admin tool name: ${manifest.name}`);
  }
  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    throw new Error(
      `tool ${manifest.name} must use a positive integer version`,
    );
  }
  if (
    manifest.inputSchema.type !== "object" ||
    manifest.outputSchema.type !== "object"
  ) {
    throw new Error(`tool ${manifest.name} schemas must have an object root`);
  }
  if (manifest.permissions.length === 0) {
    throw new Error(
      `tool ${manifest.name} must declare at least one permission`,
    );
  }
  if (manifest.audit.mode !== "always") {
    throw new Error(`tool ${manifest.name} must always be audited`);
  }
  if (manifest.kind === "command" && manifest.idempotency === "none") {
    throw new Error(`command ${manifest.name} must declare idempotency`);
  }
  if (manifest.risk === "high" && manifest.idempotency !== "required") {
    throw new Error(`high-risk tool ${manifest.name} requires idempotency`);
  }
}

export class AdminToolRegistry {
  private readonly ajv: Ajv2020;
  private readonly tools = new Map<string, CompiledTool>();

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(this.ajv);
  }

  register<I extends JsonObject, O extends JsonObject>(
    definition: RegisteredAdminTool<I, O>,
  ) {
    assertManifest(definition.manifest);
    const key = `${definition.manifest.name}@${definition.manifest.version}`;
    if (this.tools.has(key)) throw new Error(`duplicate admin tool: ${key}`);
    const frozenDefinition: RegisteredAdminTool = {
      ...definition,
      manifest: freezeManifest(definition.manifest) as AdminToolManifest,
      privateAudit: Object.freeze({
        redactPaths: Object.freeze([
          ...definition.privateAudit.redactPaths,
        ]) as unknown as string[],
      }),
      execution: {
        handler: definition.execution.handler as unknown as AdminToolHandler<
          JsonObject,
          JsonObject
        >,
      },
    };
    this.tools.set(key, {
      definition: frozenDefinition,
      validateInput: this.ajv.compile(definition.manifest.inputSchema),
      validateOutput: this.ajv.compile(definition.manifest.outputSchema),
    });
    return this;
  }

  manifests(): PublicAdminToolManifest[] {
    return [...this.tools.values()]
      .map(({ definition }) => definition.manifest)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  get(name: string, version: number) {
    return this.tools.get(`${name}@${version}`)?.definition;
  }

  async execute(
    name: string,
    version: number,
    input: unknown,
    context: AdminExecutionContext,
  ): Promise<AdminToolExecutionResult> {
    const compiled = this.tools.get(`${name}@${version}`);
    if (!compiled) {
      throw new AdminToolError(
        "TOOL_NOT_FOUND",
        `unknown tool ${name}@${version}`,
      );
    }
    const { manifest } = compiled.definition;
    if (!compiled.validateInput(input)) {
      throw new AdminToolError(
        "INPUT_INVALID",
        `invalid input for ${name}`,
        compiled.validateInput.errors,
      );
    }
    if (
      !manifest.permissions.every((permission) =>
        context.permissions.has(permission),
      )
    ) {
      throw new AdminToolError(
        "PERMISSION_DENIED",
        `permission denied for ${name}`,
      );
    }
    if (manifest.risk === "high" && !context.stepUp.recentTotp) {
      throw new AdminToolError(
        "STEP_UP_REQUIRED",
        `recent TOTP required for ${name}`,
      );
    }
    if (manifest.risk === "high" && !context.stepUp.activeSession) {
      throw new AdminToolError(
        "ACTIVE_SESSION_REQUIRED",
        `active session required for ${name}`,
      );
    }
    if (manifest.idempotency === "required" && !context.idempotencyKey) {
      throw new AdminToolError(
        "IDEMPOTENCY_KEY_REQUIRED",
        `idempotency key required for ${name}`,
      );
    }

    const output = await compiled.definition.execution.handler(
      input as JsonObject,
      context,
    );
    if (!compiled.validateOutput(output)) {
      throw new AdminToolError(
        "OUTPUT_INVALID",
        `invalid output from ${name}`,
        compiled.validateOutput.errors,
      );
    }
    return { tool: name, version, traceId: context.traceId, output };
  }
}

export type AdminPresentation =
  "data-table" | "row-action" | "command-form" | "job-progress";
export type AdminScreenConfig = {
  schemaVersion: 1;
  screens: Array<{
    id: string;
    title: string;
    route: string;
    requiredPermissions: string[];
    blocks: Array<{
      tool: string;
      presentation: AdminPresentation;
      input?: JsonObject;
    }>;
  }>;
};

export function validateAdminScreenConfig(
  registry: AdminToolRegistry,
  config: AdminScreenConfig,
) {
  if (config.schemaVersion !== 1)
    throw new Error("unsupported admin screen schemaVersion");
  const routes = new Set<string>();
  const presentationsByKind: Record<AdminToolKind, AdminPresentation[]> = {
    query: ["data-table", "job-progress"],
    command: ["row-action", "command-form", "job-progress"],
  };
  for (const screen of config.screens) {
    if (routes.has(screen.route))
      throw new Error(`duplicate admin screen route: ${screen.route}`);
    routes.add(screen.route);
    for (const block of screen.blocks) {
      const match = /^(.*)@(\d+)$/.exec(block.tool);
      if (!match) throw new Error(`invalid tool reference: ${block.tool}`);
      const definition = registry.get(match[1], Number(match[2]));
      if (!definition) throw new Error(`unknown tool reference: ${block.tool}`);
      if (
        !presentationsByKind[definition.manifest.kind].includes(
          block.presentation,
        )
      ) {
        throw new Error(
          `presentation ${block.presentation} is incompatible with ${definition.manifest.kind}`,
        );
      }
      if (
        !definition.manifest.permissions.every((permission) =>
          screen.requiredPermissions.includes(permission),
        )
      ) {
        throw new Error(
          `screen ${screen.id} omits tool permission for ${block.tool}`,
        );
      }
    }
  }
  return config;
}

export function toMcpToolFixture(registry: AdminToolRegistry) {
  return registry.manifests().map((manifest) => ({
    name: manifest.name,
    description: manifest.description,
    inputSchema: manifest.inputSchema,
  }));
}

export type OutboxEvent = {
  id: string;
  type: string;
  specVersion: number;
  occurredAt: string;
  traceId: string | null;
  actor: JsonObject;
  subject: JsonObject;
  data: JsonObject;
  attemptCount: number;
  maxAttempts: number;
};

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export type OutboxStore = {
  claim(input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    eventTypes: string[];
  }): Promise<OutboxEvent[]>;
  ack(eventId: string, workerId: string): Promise<boolean>;
  fail(
    eventId: string,
    workerId: string,
    error: string,
  ): Promise<"pending" | "dead">;
};

export type OutboxBatchResult = {
  claimed: number;
  processed: number;
  failed: number;
  dead: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`expected an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function describeOutboxError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

/**
 * Executes one bounded outbox batch. Only registered event types are claimed,
 * so a partially assembled application cannot consume another module's events.
 */
export async function runOutboxBatch(input: {
  store: OutboxStore;
  handlers: Readonly<Record<string, OutboxHandler>>;
  workerId: string;
  batchSize?: number;
  leaseSeconds?: number;
  maxExecutionMs?: number;
}): Promise<OutboxBatchResult> {
  const batchSize = boundedInteger(input.batchSize, 25, 1, 100);
  const leaseSeconds = boundedInteger(input.leaseSeconds, 30, 5, 300);
  const maxExecutionMs = boundedInteger(
    input.maxExecutionMs,
    25_000,
    100,
    300_000,
  );
  const deadline = Date.now() + maxExecutionMs;
  const eventTypes = Object.keys(input.handlers).sort();
  const result: OutboxBatchResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    dead: 0,
  };

  if (eventTypes.length === 0) return result;

  const events = await input.store.claim({
    workerId: input.workerId,
    batchSize,
    leaseSeconds,
    eventTypes,
  });
  result.claimed = events.length;

  for (const event of events) {
    const handler = input.handlers[event.type];
    if (!handler) {
      throw new Error(`store returned unregistered event type: ${event.type}`);
    }
    try {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0)
        throw new Error("outbox execution budget exhausted");
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("outbox handler execution budget exceeded")),
          remainingMs,
        );
        void handler(event).then(
          () => {
            clearTimeout(timeout);
            resolve();
          },
          (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      });
      const acknowledged = await input.store.ack(event.id, input.workerId);
      if (!acknowledged) {
        throw new Error(`outbox lease lost before ack: ${event.id}`);
      }
      result.processed += 1;
    } catch (error) {
      const status = await input.store.fail(
        event.id,
        input.workerId,
        describeOutboxError(error),
      );
      result.failed += 1;
      if (status === "dead") result.dead += 1;
    }
  }

  return result;
}
