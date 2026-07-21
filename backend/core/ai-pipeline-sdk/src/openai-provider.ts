/**
 * OpenAI 어댑터 (contract-v0 §0 "OpenAI 1종 구현"). fetch 기반(외부 SDK 의존 0).
 * API 키는 OPENAI_API_KEY env에서만 읽는다 — 코드/로그에 절대 넣지 않는다.
 * 재시도(429/5xx)·timeout(AbortController)·에러분류(timeout/provider)를 계약대로 처리.
 */
import {
  ProviderError,
  type ChatProvider,
  type CompletionRequest,
  type CompletionResult,
  type ModerationResult,
} from "./provider";

export interface OpenAiOptions {
  apiKey?: string; // 미지정 시 process.env.OPENAI_API_KEY
  baseUrl?: string;
  moderationModel?: string;
  maxRetries?: number;
}

const OPENAI_TO_CONTRACT_CATEGORY = (c: string): string =>
  c.replace(/[/-]/g, "_");

export class OpenAiChatProvider implements ChatProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly moderationModel: string;
  private readonly maxRetries: number;

  constructor(options: OpenAiOptions = {}) {
    const key = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required (env)");
    this.apiKey = key;
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
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = new ProviderError("provider", `openai ${res.status}`);
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          throw new ProviderError("provider", `openai ${res.status}`);
        }
        return (await res.json()) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ProviderError(
            "timeout",
            `openai timeout after ${timeoutMs}ms`,
          );
        }
        lastError = error;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
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
    const categoriesObj =
      (result?.categories as Record<string, boolean> | undefined) ?? {};
    const categories = Object.entries(categoriesObj)
      .filter(([, flagged]) => flagged)
      .map(([category]) => OPENAI_TO_CONTRACT_CATEGORY(category));
    return {
      flagged: Boolean(result?.flagged) || categories.length > 0,
      categories,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const json = await this.request(
      "/chat/completions",
      { model: request.model, messages: request.messages, temperature: 0.4 },
      request.timeoutMs,
    );
    const choice = (
      json.choices as Array<Record<string, unknown>> | undefined
    )?.[0];
    const message = choice?.message as { content?: string } | undefined;
    const usage = (json.usage as Record<string, number> | undefined) ?? {};
    return {
      text: message?.content ?? "",
      model: String(json.model ?? request.model),
      tokens: {
        prompt: usage.prompt_tokens ?? 0,
        completion: usage.completion_tokens ?? 0,
        total: usage.total_tokens ?? 0,
      },
    };
  }
}
