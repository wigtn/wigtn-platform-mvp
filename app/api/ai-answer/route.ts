import { createClient } from "@supabase/supabase-js";

/**
 * 질문에 AI 초안을 만들어 준다.
 *
 * ## 왜 서버 라우트인가
 *
 * 브라우저에서 OpenAI 를 직접 부르면 **키가 공개된다.** 공개 데모라
 * 소스를 보는 사람이 곧 키를 가져간다. 그래서 키는 서버에만 두고 여기서만
 * 부른다.
 *
 * ## 아무나 누르면 돈이 나간다
 *
 * 포트폴리오 링크는 누구나 연다. 제한이 없으면 한 사람이 반복해서 눌러
 * 토큰을 태울 수 있다. 그래서 **방문자마다 횟수를 서버에서 센다.**
 *
 * 세는 방법은 방문자의 액션 원장이다. 브라우저가 보내는 숫자를 믿으면
 * 아무 의미가 없다 - 원장은 서버에 있고 RLS 로 본인 것만 보인다.
 *
 * 데모 세션은 1시간이면 만료된다. 그 안에 이 횟수만큼 쓸 수 있다.
 */

const MAX_PER_SESSION = 5;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM = `당신은 한국 B2B 영업 실무자를 돕는 조력자입니다.

- 한국어로, 존댓말로 답합니다.
- 3~5문장으로 짧게 씁니다. 목록보다 문장을 씁니다.
- 확인해야 할 것을 구체적으로 짚습니다. 일반론은 쓰지 않습니다.
- 모르면 모른다고 하고 무엇을 더 알아야 하는지 적습니다.
- 회사명이나 개인을 특정하는 내용은 답에 넣지 않습니다.`;

function bad(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "public";
  if (!apiKey || !url || !anonKey) {
    return bad(503, "AI 답변이 설정되지 않았습니다.");
  }

  // 방문자의 토큰으로 붙는다. 서비스 키를 쓰면 RLS 를 통째로 우회하게 되고,
  // 그러면 "누구의 원장인지"를 서버가 직접 판단해야 한다.
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return bad(401, "데모 세션이 필요합니다.");

  let question: { title?: string; body?: string };
  try {
    question = await request.json();
  } catch {
    return bad(400, "요청 형식이 올바르지 않습니다.");
  }
  const title = String(question.title ?? "").trim();
  const body = String(question.body ?? "").trim();
  if (!title && !body) return bad(400, "질문 내용이 비어 있습니다.");
  // 프롬프트가 길어지면 비용이 는다. 데모에서 이보다 긴 질문은 없다.
  if (title.length + body.length > 2000) {
    return bad(413, "질문이 너무 깁니다.");
  }

  const supabase = createClient(url, anonKey, {
    db: { schema },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.rpc("get_demo_experience");
  if (error) return bad(401, "데모 세션이 만료됐습니다.");
  const used = (
    (data as { actions?: Array<{ action: string }> })?.actions ?? []
  ).filter((entry) => entry.action === "ai.answer.request").length;
  if (used >= MAX_PER_SESSION) {
    return bad(
      429,
      `이 데모 세션에서는 AI 답변을 ${MAX_PER_SESSION}번까지 받을 수 있습니다.`,
    );
  }

  // 응답이 늦어도 화면이 계속 기다리면 안 된다. 붙잡혀 있으면 사람이
  // 새로고침하고, 그동안 요청은 살아 있어 비용만 는다.
  const abort = AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: SYSTEM,
        input: [
          {
            role: "user",
            content: `질문 제목: ${title}\n\n상황: ${body}`,
          },
        ],
        max_output_tokens: 500,
      }),
      signal: abort,
    });
  } catch {
    return bad(504, "AI 응답이 늦어 중단했습니다.");
  }

  if (!response.ok) {
    const detail = await response.text();
    console.error(
      "[fieldnote] OpenAI 실패",
      response.status,
      detail.slice(0, 300),
    );
    return bad(502, "AI 응답을 받지 못했습니다.");
  }

  const json = (await response.json()) as {
    output?: Array<{ content?: Array<{ text?: string }> }>;
    output_text?: string;
  };
  // Responses API 는 output_text 를 줄 때도 있고 output 배열만 줄 때도 있다.
  const answer =
    json.output_text ??
    json.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

  if (!answer) return bad(502, "AI 응답이 비어 있습니다.");

  return Response.json({
    answer,
    model: MODEL,
    remaining: MAX_PER_SESSION - used - 1,
  });
}
