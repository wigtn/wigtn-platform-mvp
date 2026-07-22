"use client";

import type { Company, Post, Review } from "./domain";
import { getSupabase } from "./supabase";

/**
 * 화면 상태를 DB 에서 만든다.
 *
 * ## 왜 모양을 안 바꾸나
 *
 * 화면(2846줄)은 `DemoState` 하나만 보고 그린다. 그래서 **모양은 그대로 두고
 * 출처만 바꾼다.** 렌더 코드를 건드리지 않으니 "붙인 뒤에도 화면이 똑같은가"를
 * 눈으로 바로 비교할 수 있다.
 *
 * ## 방문자가 쓴 것은 어디로 가나
 *
 * 공용 테이블이 아니라 **방문자별 액션 원장**으로 간다(RLS 로 격리).
 * 그래서 두 사람이 동시에 둘러봐도 서로의 글이 안 보이고, 공개 시드도
 * 안 망가진다. 전에 localStorage 가 하던 일을 서버가 방문자별로 한다.
 *
 * 읽을 때는 [공용 시드] + [내 원장] 을 겹쳐서 화면 상태를 만든다.
 */

const AXIS_LABEL: Record<string, string> = {
  quota_realism: "목표 현실성",
  incentive_transparency: "인센티브 투명성",
  lead_quality: "리드 품질",
  account_allocation: "계정 배분",
  sales_tooling: "세일즈 툴",
  manager_coaching: "매니저 코칭",
};

/** 화면은 게시판을 한글 이름으로 부른다. DB 는 slug 로 부른다. */
const BOARD_LABEL: Record<string, Post["board"]> = {
  qna: "Q&A",
  howto: "노하우",
  deals: "실적",
  free: "자유",
};

export type LoadedDemo = {
  companies: Company[];
  reviews: Review[];
  posts: Post[];
  /** 원장 재생에 쓰는 게시판 slug→id. 글을 쓸 때 필요하다. */
  boardIds: Record<string, string>;
  /** 회사 slug→id. 리뷰를 쓸 때 필요하다(화면은 slug 로만 다룬다). */
  companyIds: Record<string, string>;
};

/**
 * 화면 라벨(한글) → 저장 키(영어). 읽을 때 쓰는 AXIS_LABEL 의 반대다.
 * 리뷰를 쓸 때 6축을 이 키로 바꿔 보낸다 - DB 의 check 제약이 이 이름을
 * 요구한다.
 */
export const AXIS_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(AXIS_LABEL).map(([key, label]) => [label, key]),
);

function labelDimensions(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const label = AXIS_LABEL[key];
      if (label) out[label] = Number(value);
    }
  }
  return out;
}

/**
 * 공용 데이터를 읽는다. 로그인 없이도 읽히는 것들이다(RLS 가 공개로 열어 둠).
 *
 * 한 번에 다 받아서 화면 상태를 만든다. 화면이 이미 전부를 메모리에 들고
 * 그리도록 짜여 있어서, 여기서 쪼개면 렌더 코드를 고쳐야 한다.
 */
export async function loadPublicData(): Promise<LoadedDemo | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const [companiesRes, reviewsRes, boardsRes, postsRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, slug, name, industry, sales_type, summary, interest_trend," +
          " company_review_stats(review_count, overall_average, dimension_averages)",
      )
      .eq("is_active", true)
      // 홈의 "최근 조회가 늘어난 회사" 순서가 이 정렬이다. 전에는 배열에
      // 적힌 순서였는데, DB 에서는 기준을 말할 수 있어야 한다.
      .order("interest_trend", { ascending: false })
      .order("slug"),
    supabase
      .from("company_reviews")
      .select(
        "id, title, body, employment_status, overall_score, score_dimensions, status, verification_level, companies(slug)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("boards").select("id, slug").eq("is_active", true),
    // 관계를 FK 이름으로 못 박는다. 그냥 `profiles(...)` 라고 쓰면
    // "more than one relationship was found" 로 막힌다 - posts 와 profiles
    // 사이에 경로가 둘 이상 있어서 PostgREST 가 어느 쪽인지 못 정한다.
    //
    // profiles 는 anon 이 아니라 authenticated 에만 열려 있다. 그래서 이
    // 조회는 익명 **로그인 뒤**에 불러야 한다(ensureDemoSession 먼저).
    supabase
      .from("posts")
      .select(
        "id, title, body, created_at, boards(slug)," +
          " profiles!posts_author_id_fkey(display_name)," +
          " comments!comments_post_board_fk(body), reactions(type)",
      )
      .eq("status", "published")
      .order("created_at", { ascending: false }),
  ]);

  const firstError =
    companiesRes.error ?? reviewsRes.error ?? boardsRes.error ?? postsRes.error;
  if (firstError) throw firstError;

  type Stats = {
    review_count: number | null;
    overall_average: number | null;
    dimension_averages: unknown;
  };
  // select 문자열이 길어지면 supabase-js 의 타입 추론이 풀리지 않고
  // GenericStringError 로 떨어진다. 실제 응답 모양을 여기서 명시한다.
  type CompanyRow = {
    slug: string;
    name: string;
    industry: string | null;
    sales_type: string | null;
    summary: string | null;
    interest_trend: number | string | null;
    company_review_stats?: Stats | Stats[] | null;
  };
  const companies: Company[] = (
    (companiesRes.data ?? []) as unknown as CompanyRow[]
  ).map((row) => {
    // PostgREST 는 1:1 관계도 배열로 줄 때가 있다. 둘 다 받는다.
    const raw = row.company_review_stats;
    const stats = (Array.isArray(raw) ? raw[0] : raw) ?? null;
    return {
      slug: row.slug,
      name: row.name,
      industry: row.industry ?? "",
      type: row.sales_type ?? "",
      score: Number(stats?.overall_average ?? 0),
      reviewCount: Number(stats?.review_count ?? 0),
      trend: Number(row.interest_trend ?? 0),
      summary: row.summary ?? "",
      scores: labelDimensions(stats?.dimension_averages),
    };
  });

  const reviews: Review[] = (reviewsRes.data ?? []).map((row) => {
    const company = (
      row as { companies?: { slug: string } | { slug: string }[] }
    ).companies;
    const slug = Array.isArray(company) ? company[0]?.slug : company?.slug;
    return {
      id: row.id as string,
      companySlug: slug ?? "",
      title: row.title as string,
      body: row.body as string,
      score: Number(row.overall_score),
      dimensions: labelDimensions(row.score_dimensions),
      status: row.status === "hidden" ? "hidden" : "published",
      employment: row.employment_status === "former" ? "퇴사" : "재직",
      verified: row.verification_level === "document_verified",
    };
  });

  const companyIds: Record<string, string> = {};
  for (const row of (companiesRes.data ?? []) as unknown as Array<{
    id: string;
    slug: string;
  }>) {
    companyIds[row.slug] = row.id;
  }

  const boardIds: Record<string, string> = {};
  for (const row of boardsRes.data ?? []) {
    boardIds[row.slug as string] = row.id as string;
  }

  // `profiles!posts_author_id_fkey(...)` 처럼 FK 이름을 붙이면 supabase-js 의
  // 타입 추론이 문자열을 못 풀고 GenericStringError 로 떨어진다. 실제 응답은
  // 아래 모양이므로 여기서 명시한다.
  type PostRow = {
    id: string;
    title: string;
    body: string | null;
    created_at: string;
    boards?: { slug: string } | { slug: string }[];
    profiles?: { display_name: string } | { display_name: string }[];
    comments?: Array<{ body: string }>;
    reactions?: Array<{ type: string }>;
  };

  const posts: Post[] = ((postsRes.data ?? []) as unknown as PostRow[]).map(
    (row) => {
      const board = row.boards;
      const slug = Array.isArray(board) ? board[0]?.slug : board?.slug;
      const author = row.profiles;
      const displayName = Array.isArray(author)
        ? author[0]?.display_name
        : author?.display_name;
      const comments = row.comments ?? [];
      const reactions = row.reactions ?? [];
      return {
        id: row.id,
        board: BOARD_LABEL[slug ?? "free"] ?? "자유",
        title: row.title,
        body: row.body ?? "",
        author: displayName ?? "익명",
        likes: reactions.length,
        saved: false,
        comments: comments.map((c) => c.body),
      };
    },
  );

  return { companies, reviews, posts, boardIds, companyIds };
}

/**
 * 브라우저마다 익명 계정을 만들고 격리된 데모 세션을 연다.
 *
 * 내 표시 이름도 같이 읽는다. 프로필 저장은 다른 액션과 달리 profiles
 * 테이블을 실제로 바꾸므로, 다시 들어왔을 때 그 값이 보여야 한다.
 */
export async function ensureDemoSession(): Promise<{
  userId: string;
  displayName: string | null;
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const { data, error } = await supabase.rpc("bootstrap_demo_experience");
  if (error) throw error;
  const userId = (data as { userId: string }).userId;

  const profile = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    userId,
    displayName: (profile.data?.display_name as string | undefined) ?? null,
  };
}

/**
 * 멱등키에 쓸 임의 문자열.
 *
 * `crypto.randomUUID()` 를 쓰다가 깨졌다. 그건 **보안 컨텍스트(HTTPS 나
 * localhost)에서만** 존재한다. LAN 주소로 열어 보면 http 라 없어서 쓰기가
 * 통째로 실패했다.
 *
 *     TypeError: crypto.randomUUID is not a function
 *
 * 배포는 HTTPS 라 안 드러나지만, 내부망에서 확인하거나 다른 기기로 열어
 * 보는 순간 조용히 막힌다. 서버가 요구하는 건 8자 이상인 고유 문자열이라
 * UUID 일 필요가 없다.
 */
function randomKey(): string {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(9));
  if (bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // getRandomValues 도 없는 환경. 데모의 멱등키라 추측 불가능성이 필요하진
  // 않고, 겹치지만 않으면 된다.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type LedgerEntry = {
  id: string;
  action: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  createdAt: string;
};

/** 내가 이 데모에서 한 일. 오래된 것부터 돌려준다(재생 순서). */
export async function loadMyActions(): Promise<LedgerEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_demo_experience");
  if (error) throw error;
  const actions = (
    (data as { actions?: LedgerEntry[] })?.actions ?? []
  ).slice();
  return actions.reverse();
}

/**
 * 액션을 서버에 남긴다.
 *
 * 멱등키를 반드시 보낸다. 서버가 8자 미만이면 거부하고, 같은 키로 두 번
 * 부르면 원래 결과를 그대로 돌려준다 - 더블클릭이나 재시도로 글이 두 개
 * 생기지 않는다.
 */
export async function recordAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const key = `${action}-${randomKey()}`;
  const { data, error } = await supabase.rpc("execute_demo_action", {
    p_action: action,
    p_payload: payload,
    p_idempotency_key: key,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/**
 * 질문에 AI 초안을 받는다.
 *
 * 서버 라우트를 거친다. 브라우저에서 OpenAI 를 직접 부르면 키가 공개되고,
 * 공개 데모라 소스를 보는 사람이 곧 키를 가져간다.
 *
 * 방문자 토큰을 같이 보낸다. 서버가 그 토큰으로 원장을 읽어 **이 방문자가
 * 몇 번 썼는지 직접 센다** - 브라우저가 보내는 숫자를 믿으면 제한이 의미가
 * 없다.
 */
export async function requestAiAnswer(question: {
  title: string;
  body: string;
}): Promise<{ answer: string; remaining: number }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("데모가 DB 에 연결되지 않았습니다.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("데모 세션이 없습니다.");

  const response = await fetch("/api/ai-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(question),
  });
  const json = (await response.json()) as {
    answer?: string;
    remaining?: number;
    error?: string;
  };
  if (!response.ok || !json.answer) {
    throw new Error(json.error ?? "AI 답변을 받지 못했습니다.");
  }
  return { answer: json.answer, remaining: json.remaining ?? 0 };
}

/** "초기화" 버튼. 내 원장만 지운다 - 공용 시드는 안 건드린다. */
export async function resetMyDemo(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("reset_demo_experience");
  if (error) throw error;
}
