// RLS 테스트 — 인증/회원 (PRD §10.2). 권한 원본=DB, 관리자 이중검사(§5.1).
import { afterAll, describe, expect, it } from "vitest";
import { asUser, expectRlsDenied, pool, USERS } from "./helpers";

afterAll(async () => {
  await pool.end();
});

describe("profiles (§10.2)", () => {
  it("본인 display_name 수정 허용", async () => {
    const rowCount = await asUser(USERS.member)((c) =>
      c
        .query(
          `update public.profiles set display_name='새이름' where user_id='${USERS.member}'`,
        )
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(1);
  });

  it("본인이 account_status를 스스로 바꾸는 것은 거부(명령으로만, WITH CHECK)", async () => {
    await asUser(USERS.member)((c) =>
      expectRlsDenied(
        c.query(
          `update public.profiles set account_status='suspended' where user_id='${USERS.member}'`,
        ),
      ),
    );
  });

  it("타 회원 프로필 수정 거부 (IDOR)", async () => {
    const rowCount = await asUser(USERS.member)((c) =>
      c
        .query(
          `update public.profiles set display_name='hacked' where user_id='${USERS.member2}'`,
        )
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(0);
  });

  it("관리자는 회원 프로필을 관리할 수 있다 (member.manage)", async () => {
    const rowCount = await asUser(USERS.admin)((c) =>
      c
        .query(
          `update public.profiles set display_name='운영수정' where user_id='${USERS.member}'`,
        )
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(1);
  });
});

describe("역할 부여 = 민감 명령 (§5.6, role.manage)", () => {
  it("일반 회원은 user_roles를 삽입 못 한다", async () => {
    await asUser(USERS.member)((c) =>
      expectRlsDenied(
        c.query(
          `insert into public.user_roles (user_id, role_id)
           values ('${USERS.member}', 'a0000000-0000-0000-0000-000000000003')`,
        ),
      ),
    );
  });

  it("관리자는 역할을 부여할 수 있다", async () => {
    const r = await asUser(USERS.admin)((c) =>
      c.query(
        `insert into public.user_roles (user_id, role_id)
         values ('${USERS.member}', 'a0000000-0000-0000-0000-000000000002') returning user_id`,
      ),
    );
    expect(r.rowCount).toBe(1);
  });
});

describe("audit_events 열람 통제 (§4.6, §10.2)", () => {
  it("일반 회원은 감사로그를 읽지 못한다", async () => {
    const n = await asUser(USERS.member)((c) =>
      c
        .query("select count(*)::int n from public.audit_events")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(0); // RLS로 필터 → 0행
  });

  it("audit.read 권한자(admin)는 감사로그를 읽는다", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into public.audit_events (actor_type, actor_id, action, resource_type, outcome)
         values ('user', '${USERS.admin}', 'member.suspend', 'profile', 'success')`,
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.admin, role: "authenticated" }),
      ]);
      const result = await client.query(
        "select count(*)::int n from public.audit_events",
      );
      expect(result.rows[0].n).toBeGreaterThanOrEqual(1);
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  });

  it("일반 회원은 감사 이벤트를 위조해 삽입하지 못한다", async () => {
    await asUser(USERS.member)((c) =>
      expectRlsDenied(
        c.query(
          `insert into public.audit_events (actor_type, actor_id, action, resource_type, outcome)
           values ('user', '${USERS.member}', 'forged.admin.action', 'profile', 'success')`,
        ),
      ),
    );
  });
});

describe("service_accounts 노출 (§10.2)", () => {
  it("일반 회원은 서비스 계정 목록을 못 본다", async () => {
    const n = await asUser(USERS.member)((c) =>
      c
        .query("select count(*)::int n from public.service_accounts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
  });

  it("서비스 계정은 자기 행만 조회한다", async () => {
    const n = await asUser(USERS.serviceAccount)((c) =>
      c
        .query("select count(*)::int n from public.service_accounts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(1);
  });

  it("관리자는 서비스 계정을 관리(조회)한다", async () => {
    const n = await asUser(USERS.admin)((c) =>
      c
        .query("select count(*)::int n from public.service_accounts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(1);
  });
});
