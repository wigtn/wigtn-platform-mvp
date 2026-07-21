// Gate 1-E: 앱 전용 DB LOGIN role 금지 권한 검증 (PRD §3.4 DB 연결 보안 계약)
// runtime command는 postgres/service_role/BYPASSRLS로 붙지 않는다. app_authenticator는
// authenticated 전환만 가능하고 DDL·임의 role 전환·schema owner 권한이 없어야 한다.
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

// 로컬/CI 전용 비밀번호(§3.9, 실제는 Secret Manager 회전). CI는 APP_DATABASE_URL 사용.
const APP_URL =
  process.env.APP_DATABASE_URL ??
  "postgresql://app_authenticator:app_local_dev_pw@127.0.0.1:55322/postgres";

const appPool = new Pool({ connectionString: APP_URL, max: 4 });

afterAll(async () => {
  await appPool.end();
});

async function expectDenied(sql: string): Promise<void> {
  const c = await appPool.connect();
  try {
    await c.query("begin");
    await c.query(sql);
    throw new Error(`expected denial but succeeded: ${sql}`);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.startsWith("expected denial")) throw e;
    expect(
      msg.includes("permission denied") ||
        msg.includes("must be owner") ||
        msg.includes("cannot") ||
        msg.includes("denied"),
    ).toBe(true);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

async function expectDeniedAfterAuthenticated(sql: string): Promise<void> {
  const c = await appPool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: "11111111-1111-1111-1111-111111111111",
        role: "authenticated",
      }),
    ]);
    await c.query(sql);
    throw new Error(`expected denial but succeeded: ${sql}`);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.startsWith("expected denial")) throw e;
    expect(msg).toMatch(/permission denied|cannot|denied/i);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

describe("app_authenticator 연결 보안 (§3.4)", () => {
  it("로그인은 되지만 기본 권한이 없다(NOINHERIT) — 직접 posts 조회 불가", async () => {
    // NOINHERIT: SET ROLE 전에는 authenticated 권한을 상속하지 않는다.
    await expectDenied("select * from public.posts limit 1");
  });

  it("SET ROLE authenticated로 전환하면 RLS 컨텍스트로 동작한다", async () => {
    const c = await appPool.connect();
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
      expect(r.rows[0].n).toBe(2); // member1: 공개+자기 draft
    } finally {
      await c.query("rollback").catch(() => {});
      c.release();
    }
  });

  it("DDL(CREATE TABLE)은 거부된다", async () => {
    await expectDenied("create table public.hack (id int)");
  });

  it("임의 role(postgres)로 전환은 거부된다", async () => {
    await expectDenied("set role postgres");
  });

  it("service_role로 전환은 거부된다", async () => {
    await expectDenied("set role service_role");
  });

  it("기존 테이블 DROP은 거부된다", async () => {
    await expectDenied("drop table public.posts");
  });

  it("authenticated 전환 뒤에도 TRUNCATE로 RLS를 우회하지 못한다", async () => {
    await expectDeniedAfterAuthenticated("truncate public.audit_events");
  });

  it("앱 role은 내부 outbox worker 함수를 호출하지 못한다", async () => {
    const result = await appPool.query(
      "select has_function_privilege(current_user, 'app_private.claim_outbox_batch(text,integer,interval,text[])', 'execute') allowed",
    );
    expect(result.rows[0].allowed).toBe(false);
  });

  it("일반 회원 컨텍스트는 outbox 이벤트를 직접 주입하지 못한다", async () => {
    await expectDeniedAfterAuthenticated(
      `insert into public.outbox_events (type) values ('forged.event.v1')`,
    );
  });
});
