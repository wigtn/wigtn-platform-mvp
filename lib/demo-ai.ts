import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type DemoSupabaseClient = SupabaseClient<any, string, string, any>;

type AiPollResult = {
  requestId: string;
  status: "pending" | "ready" | "blocked" | "failed";
  answer?: string;
  model?: string;
  reasons?: string[];
};

export type DemoAiAnswer = {
  answer: string;
  model: string;
  live: boolean;
};

export type StructuredAiAnswer = {
  summary: string;
  actions: string[];
  caution: string;
};

export const FALLBACK_AI_ANSWER: StructuredAiAnswer = {
  summary:
    "예산 자체를 바로 묻기보다 고객의 의사결정 구조부터 확인해 보세요. 사용 부서와 승인자가 다르면 두 관점을 한 번에 맞추는 것이 중요합니다.",
  actions: [
    "현재 문제로 가장 큰 영향을 받는 팀과 실제 사용자를 먼저 확인합니다.",
    "도입 범위와 검토 기준을 정하는 담당자가 누구인지 물어봅니다.",
    "다음 미팅에 사용자 대표와 승인 담당자가 함께할 수 있는지 제안합니다.",
  ],
  caution:
    "예산 금액부터 재촉하면 방어적인 대화가 될 수 있습니다. 먼저 내부 검토 절차와 판단 기준을 확인하세요.",
};

function cleanText(value: string) {
  return value
    .replace(/^\s{0,3}(?:#{1,6}|>)\s*/g, "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validStructuredAnswer(value: unknown): StructuredAiAnswer | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.summary !== "string" ||
    !Array.isArray(candidate.actions) ||
    typeof candidate.caution !== "string"
  )
    return null;
  const actions = candidate.actions
    .filter((action): action is string => typeof action === "string")
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 4);
  const summary = cleanText(candidate.summary);
  const caution = cleanText(candidate.caution);
  if (!summary || actions.length === 0 || !caution) return null;
  return { summary, actions, caution };
}

/** Structured Output을 우선 사용하고, 이전 Markdown 답변도 안전한 텍스트로 복구한다. */
export function parseDemoAiAnswer(raw: string): StructuredAiAnswer {
  try {
    const structured = validStructuredAnswer(JSON.parse(raw));
    if (structured) return structured;
  } catch {
    // 이전 버전의 일반 텍스트/Markdown 응답은 아래 호환 파서로 처리한다.
  }

  const sections: Record<"summary" | "actions" | "caution", string[]> = {
    summary: [],
    actions: [],
    caution: [],
  };
  let current: keyof typeof sections = "summary";
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = cleanText(line).replace(/\s/g, "");
    if (/^(핵심판단|판단)$/.test(heading)) {
      current = "summary";
      continue;
    }
    if (/^(바로해볼행동|실행방법|실행단계|다음행동)$/.test(heading)) {
      current = "actions";
      continue;
    }
    if (/^(주의할점|주의점)$/.test(heading)) {
      current = "caution";
      continue;
    }
    const cleaned = cleanText(line);
    if (cleaned) sections[current].push(cleaned);
  }

  const summary = sections.summary.join(" ") || cleanText(raw);
  const actions = sections.actions.slice(0, 4);
  return {
    summary,
    actions:
      actions.length > 0
        ? actions
        : ["상황과 의사결정 구조를 먼저 확인한 뒤 다음 행동을 정해 보세요."],
    caution:
      sections.caution.join(" ") ||
      "AI가 작성한 초안이므로 실제 고객 상황에 맞게 조정해 사용하세요.",
  };
}

let browserClient: DemoSupabaseClient | undefined;

export function isLiveAiDemoConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function client() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA?.trim();
  if (!url || !key) throw new Error("AI 데모 연결 정보가 없습니다.");
  browserClient = createClient(url, key, {
    db: schema ? { schema } : undefined,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return browserClient;
}

function idempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function rpc<T>(
  supabase: DemoSupabaseClient,
  name: string,
  args?: Record<string, unknown>,
) {
  const result = await supabase.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

async function ensureAnonymousDemo(supabase: DemoSupabaseClient) {
  const current = await supabase.auth.getSession();
  if (current.error) throw new Error(current.error.message);
  if (!current.data.session) {
    const signedIn = await supabase.auth.signInAnonymously();
    if (signedIn.error) throw new Error(signedIn.error.message);
  }
  await rpc(supabase, "bootstrap_demo_experience");
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fallbackAnswer(
  signal: AbortSignal | undefined,
  onProgress: (status: "queued" | "thinking") => void,
): Promise<DemoAiAnswer> {
  await wait(900, signal);
  onProgress("thinking");
  await wait(1_800, signal);
  return {
    answer: JSON.stringify(FALLBACK_AI_ANSWER),
    model: "demo-fallback",
    live: false,
  };
}

export async function requestDemoAiAnswer(input: {
  title: string;
  body: string;
  signal?: AbortSignal;
  onProgress: (status: "queued" | "thinking") => void;
}): Promise<DemoAiAnswer> {
  input.onProgress("queued");
  if (!isLiveAiDemoConfigured())
    return fallbackAnswer(input.signal, input.onProgress);

  const supabase = client();
  await ensureAnonymousDemo(supabase);
  const requested = await rpc<AiPollResult>(supabase, "execute_demo_action", {
    p_action: "ai.answer.request",
    p_payload: { title: input.title, body: input.body },
    p_idempotency_key: idempotencyKey("ai-request"),
  });
  if (!requested.requestId) throw new Error("AI 요청 번호를 받지 못했습니다.");

  input.onProgress("thinking");
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await wait(attempt === 0 ? 600 : 1_000, input.signal);
    const result = await rpc<AiPollResult>(supabase, "execute_demo_action", {
      p_action: "ai.answer.poll",
      p_payload: { requestId: requested.requestId },
      p_idempotency_key: idempotencyKey(`ai-poll-${attempt}`),
    });
    if (result.status === "ready" && result.answer) {
      return {
        answer: result.answer,
        model: result.model ?? "gpt-5.6-terra",
        live: true,
      };
    }
    if (result.status === "blocked")
      throw new Error("안전 정책상 이 질문에는 AI 초안을 제공할 수 없습니다.");
    if (result.status === "failed")
      throw new Error(
        "AI 답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
  }
  throw new Error("AI 답변 대기 시간이 초과됐습니다. 다시 시도해 주세요.");
}
