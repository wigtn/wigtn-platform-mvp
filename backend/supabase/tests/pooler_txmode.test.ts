// Gate 1-E: Supavisor transaction mode 호환성 (PRD §3.4)
// 앱 command는 전용 LOGIN role로 pooler(transaction mode)에 붙어, 트랜잭션 안에서
// SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ...)로 RLS 컨텍스트를
// 유지한다. SET LOCAL은 트랜잭션 범위이므로 Supavisor transaction mode와 호환된다.
//
// 로컬 pooler 테넌트: <user>.pooler-dev @ 54329. CI/staging은 POOLER_DATABASE_URL로 덮어쓴다.
//
// SSL 주의: 로컬 pooler는 평문이다. 실제 배포의 SSL 인증 강제(§3.4)는 staging/production
// 연결 문자열의 sslmode 계약으로 검증하며(배포 계약), 로컬에서는 tx-mode 동작만 확인한다.
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const POOLER_URL =
  process.env.POOLER_DATABASE_URL ??
  "postgresql://app_authenticator.pooler-dev:app_local_dev_pw@127.0.0.1:55329/postgres";

// transaction mode에서는 서버측 prepared statement를 쓰지 않는다(§3.4). node-postgres는
// unnamed 쿼리를 기본으로 하므로 호환된다. 명시적으로 statement 캐시류를 켜지 않는다.
const pool = new Pool({ connectionString: POOLER_URL, max: 4 });

afterAll(async () => {
  await pool.end();
});

describe.skipIf(!process.env.POOLER_DATABASE_URL)(
  "Supavisor transaction mode 호환성 (§3.4)",
  () => {
    it("앱 role이 pooler로 연결된다", async () => {
      const r = await pool.query("select current_user");
      expect(r.rows[0].current_user).toBe("app_authenticator");
    });

    it("트랜잭션 내 SET LOCAL ROLE + jwt claims로 RLS 컨텍스트가 유지된다", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({
            sub: "11111111-1111-1111-1111-111111111111",
            role: "authenticated",
          }),
        ]);
        const r = await c.query("select count(*)::int n from public.posts");
        expect(r.rows[0].n).toBe(2); // member1: 공개 + 자기 draft
      } finally {
        await c.query("rollback").catch(() => {});
        c.release();
      }
    });

    it("SET LOCAL은 트랜잭션 종료 후 누출되지 않는다 (풀 재사용 안전)", async () => {
      // 한 트랜잭션에서 authenticated로 전환했어도, 다음 트랜잭션은 기본 role로 시작해야 한다.
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query("commit");
        const r = await c.query("select current_user");
        expect(r.rows[0].current_user).toBe("app_authenticator"); // authenticated 누출 없음
      } finally {
        c.release();
      }
    });
  },
);
