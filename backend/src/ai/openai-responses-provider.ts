import {
  ProviderError,
  type ChatProvider,
  type CompletionRequest,
  type CompletionResult,
  type ModerationResult,
} from "@wigtn/ai-pipeline-sdk";

type OpenAiOptions = {
  apiKey: string;
  baseUrl?: string;
  moderationModel?: string;
  maxRetries?: number;
};

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(10_000, seconds * 1000);
  return Math.min(4_000, 300 * 2 ** attempt) + Math.floor(Math.random() * 150);
}

function responseText(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string") return json.output_text;
  const output = Array.isArray(json.output) ? json.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .filter((item): item is { type: string; text: string } =>
      Boolean(
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "output_text" &&
        typeof (item as { text?: unknown }).text === "string",
      ),
    )
    .map((item) => item.text)
    .join("\n");
}

export class OpenAiResponsesProvider implements ChatProvider {
  readonly name = "openai";
  private readonly baseUrl: string;
  private readonly moderationModel: string;
  private readonly maxRetries: number;

  constructor(private readonly options: OpenAiOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.moderationModel = options.moderationModel ?? "omni-moderation-latest";
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async request(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
            "X-Client-Request-Id": crypto.randomUUID(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = new ProviderError(
            "provider",
            `openai ${response.status}`,
          );
          if (attempt < this.maxRetries)
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelayMs(response, attempt)),
            );
          continue;
        }
        if (!response.ok)
          throw new ProviderError("provider", `openai ${response.status}`);
        return (await response.json()) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProviderError(
            "timeout",
            `openai timeout after ${timeoutMs}ms`,
          );
        }
        if (
          error instanceof ProviderError &&
          !String(error.message).match(/openai (429|5\d\d)/)
        )
          throw error;
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError instanceof ProviderError) throw lastError;
    throw new ProviderError(
      "provider",
      `openai request failed: ${String(lastError)}`,
    );
  }

  async moderate(text: string): Promise<ModerationResult> {
    const json = await this.request(
      "/moderations",
      { model: this.moderationModel, input: text },
      15_000,
    );
    const result = (
      json.results as Array<Record<string, unknown>> | undefined
    )?.[0];
    const categories = Object.entries(
      (result?.categories as Record<string, boolean> | undefined) ?? {},
    )
      .filter(([, flagged]) => flagged)
      .map(([category]) => category.replace(/[/-]/g, "_"));
    return {
      flagged: Boolean(result?.flagged) || categories.length > 0,
      categories,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const instructions = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const input = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    const json = await this.request(
      "/responses",
      {
        model: process.env.OPENAI_MODEL ?? request.model,
        instructions,
        input,
        reasoning: { effort: "medium" },
        text: {
          verbosity: "medium",
          ...(request.responseFormat
            ? {
                format: {
                  type: "json_schema",
                  name: request.responseFormat.name,
                  description: request.responseFormat.description,
                  strict: true,
                  schema: request.responseFormat.schema,
                },
              }
            : {}),
        },
        max_output_tokens: 1_100,
        ...(request.safetyIdentifier
          ? { safety_identifier: `fieldnote_${request.safetyIdentifier}` }
          : {}),
      },
      request.timeoutMs,
    );
    const usage = (json.usage as Record<string, number> | undefined) ?? {};
    const prompt = usage.input_tokens ?? 0;
    const completion = usage.output_tokens ?? 0;
    const text = responseText(json).trim();
    if (!text)
      throw new ProviderError("provider", "openai returned an empty response");
    return {
      text,
      model: String(json.model ?? process.env.OPENAI_MODEL ?? request.model),
      tokens: {
        prompt,
        completion,
        total: usage.total_tokens ?? prompt + completion,
      },
    };
  }
}

export const __test = { responseText, retryDelayMs };
