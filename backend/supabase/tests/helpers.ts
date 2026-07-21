// RLS 테스트 하니스 (PRD §10.3)
// 실제 앱 경로(§3.4)를 모사한다: 트랜잭션 안에서 SET LOCAL ROLE authenticated +
// 검증된 JWT claims(request.jwt.claims) 주입 → RLS가 그 컨텍스트로 평가된다.
// 각 케이스는 트랜잭션으로 격리하고 ROLLBACK해 seed 상태를 보존한다.
import { Pool, type PoolClient } from "pg";

// 로컬 Supabase 기본값. CI는 DATABASE_URL로 덮어쓴다.
const CONNECTION =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

export const pool = new Pool({ connectionString: CONNECTION, max: 8 });
const commandPool = new Pool({
  connectionString:
    process.env.APP_DATABASE_URL ??
    "postgresql://app_authenticator:app_local_dev_pw@127.0.0.1:55322/postgres",
  max: 4,
});

// 결정적 seed의 고정 UUID (supabase/seed/seed.sql와 일치)
export const USERS = {
  member: "11111111-1111-1111-1111-111111111111",
  member2: "22222222-2222-2222-2222-222222222222",
  moderator: "33333333-3333-3333-3333-333333333333",
  admin: "44444444-4444-4444-4444-444444444444",
  serviceAccount: "55555555-5555-5555-5555-555555555555",
  suspended: "66666666-6666-6666-6666-666666666666",
} as const;

export const BOARDS = {
  notice: "b0000000-0000-0000-0000-000000000001",
  qna: "b0000000-0000-0000-0000-000000000002",
} as const;

export const POSTS = {
  memberPublished: "c0000000-0000-0000-0000-000000000001",
  memberDraft: "c0000000-0000-0000-0000-000000000002",
} as const;

type Ctx = {
  role: "anon" | "authenticated";
  sub?: string;
  claims?: Record<string, unknown>;
};

/**
 * 주어진 역할/사용자 컨텍스트로 콜백을 실행하고 항상 ROLLBACK한다.
 * sub가 있으면 authenticated + JWT claims, 없으면 anon.
 */
export async function withCtx<T>(
  ctx: Ctx,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${ctx.role}`);
    if (ctx.sub) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ctx.sub, role: "authenticated", ...ctx.claims }),
      ]);
    }
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

export const asUser =
  (sub: string) =>
  <T>(fn: (c: PoolClient) => Promise<T>) =>
    withCtx({ role: "authenticated", sub }, fn);

export const asUserWithClaims =
  (sub: string, claims: Record<string, unknown>) =>
  <T>(fn: (c: PoolClient) => Promise<T>) =>
    withCtx({ role: "authenticated", sub, claims }, fn);

/** Gate 2 서버 command adapter: Data API 역할 전환 없이 제한 LOGIN role + 검증 claim만 사용한다. */
export async function asAppCommandWithClaims<T>(
  sub: string,
  claims: Record<string, unknown>,
  fn: (client: PoolClient) => Promise<T>,
  commit = false,
): Promise<T> {
  const client = await commandPool.connect();
  let committed = false;
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub, role: "authenticated", ...claims }),
    ]);
    const result = await fn(client);
    if (commit) {
      await client.query("commit");
      committed = true;
    }
    return result;
  } finally {
    if (!committed) await client.query("rollback").catch(() => {});
    client.release();
  }
}

export const closeCommandPool = () => commandPool.end();

export const asAnon = <T>(fn: (c: PoolClient) => Promise<T>) =>
  withCtx({ role: "anon" }, fn);

/** INSERT 등이 RLS로 거부되는지 확인 — 거부 시 42501/RLS 위반 에러를 던진다. */
export async function expectRlsDenied(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e) {
    const dbError = e as Error & { code?: string };
    const msg = String(dbError.message);
    if (
      dbError.code === "42501" ||
      msg.includes("row-level security") ||
      msg.includes("permission denied")
    ) {
      return; // 기대한 거부
    }
    throw e; // 다른 에러는 실패로
  }
  throw new Error("expected RLS denial but statement succeeded");
}
