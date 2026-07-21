/**
 * 프로바이더 어댑터 인터페이스 (contract-v0 §0 "어댑터 인터페이스만, OpenAI 1종 구현").
 * v0는 mock + OpenAI 2종. 멀티프로바이더 패리티는 v0 밖.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[]; // 플래그된 카테고리 (예: ["hate","self_harm"])
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model: string;
  timeoutMs: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokens: { prompt: number; completion: number; total: number };
}

/** provider 호출 실패 분류 → 로그 status 매핑(§2). */
export class ProviderError extends Error {
  constructor(
    public readonly kind: "timeout" | "provider",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ChatProvider {
  readonly name: string;
  moderate(text: string): Promise<ModerationResult>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/**
 * 결정적 mock 프로바이더 — Track A 개발/테스트용(의존성 0, OpenAI 키 불필요).
 * moderate: `triggerCategories`에 포함된 키워드가 텍스트에 있으면 flag.
 * complete: 정해진 답변 + 대략적 토큰 수(단어 기준) 반환.
 */
export interface MockOptions {
  answer?: string;
  triggerCategories?: Record<string, string[]>; // category → 매칭 키워드
  fail?: "timeout" | "provider";
}

export class MockChatProvider implements ChatProvider {
  readonly name = "mock";
  constructor(private readonly options: MockOptions = {}) {}

  async moderate(text: string): Promise<ModerationResult> {
    const lower = text.toLowerCase();
    const categories: string[] = [];
    for (const [category, keywords] of Object.entries(
      this.options.triggerCategories ?? {},
    )) {
      if (keywords.some((k) => lower.includes(k.toLowerCase())))
        categories.push(category);
    }
    return { flagged: categories.length > 0, categories };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    if (this.options.fail) {
      throw new ProviderError(
        this.options.fail,
        `mock forced ${this.options.fail}`,
      );
    }
    const text =
      this.options.answer ??
      "커뮤니티 규칙에 맞춰 답변드립니다. 추가 정보가 필요하면 알려주세요.";
    const prompt = request.messages.reduce(
      (n, m) => n + m.content.split(/\s+/).length,
      0,
    );
    const completion = text.split(/\s+/).length;
    return {
      text,
      model: request.model,
      tokens: { prompt, completion, total: prompt + completion },
    };
  }
}
