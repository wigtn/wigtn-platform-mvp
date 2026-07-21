import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAppCommandWithClaims,
  asUser,
  closeCommandPool,
  expectRlsDenied,
  pool,
  USERS,
} from "./helpers";

const ADMIN_SESSION_ID = "75000000-0000-0000-0000-000000000001";
const MEMBER_SESSION_ID = "75000000-0000-0000-0000-000000000002";
const BADGE_APPLICATION_ID = "73100000-0000-0000-0000-000000000001";
const REJECT_BADGE_APPLICATION_ID = "73100000-0000-0000-0000-000000000002";
const BADGE_ID = "73000000-0000-0000-0000-000000000001";
const GRADE_APPLICATION_ID = "72100000-0000-0000-0000-000000000001";
const GRADE_ID = "72000000-0000-0000-0000-000000000001";
const REPORT_ID = "76000000-0000-0000-0000-000000000001";
const SERVICE_ACCOUNT_ID = "50000000-0000-0000-0000-000000000001";

const claims = (totpTimestamp?: number, sessionId = ADMIN_SESSION_ID) => ({
  aal: totpTimestamp === undefined ? "aal1" : "aal2",
  session_id: sessionId,
  amr:
    totpTimestamp === undefined
      ? [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }]
      : [{ method: "totp", timestamp: totpTimestamp }],
});

beforeAll(async () => {
  await pool.query(
    `insert into auth.sessions (id, user_id, created_at, updated_at, aal)
     values ($1, $2, now(), now(), 'aal2'), ($3, $4, now(), now(), 'aal1')
     on conflict (id) do update set user_id=excluded.user_id, aal=excluded.aal`,
    [ADMIN_SESSION_ID, USERS.admin, MEMBER_SESSION_ID, USERS.member2],
  );
  await pool.query(
    `insert into public.grade_applications
       (id, user_id, grade_id, grade_config_version, status, form_data,
        submit_idempotency_key, submitted_at)
     values ($1, $2, $3, 1, 'submitted', '{}'::jsonb, 'gate4-grade-reject', now())
     on conflict (id) do nothing`,
    [GRADE_APPLICATION_ID, USERS.member, GRADE_ID],
  );
  await pool.query(
    `insert into public.badge_applications
       (id, user_id, badge_id, badge_config_version, status, form_data,
        submit_idempotency_key, submitted_at)
     values ($1, $2, $3, 1, 'submitted', '{}'::jsonb, 'gate4-badge-reject', now())
     on conflict (id) do nothing`,
    [REJECT_BADGE_APPLICATION_ID, USERS.member, BADGE_ID],
  );
  await pool.query(
    `insert into public.reports (id, reporter_id, post_id, reason_code, details)
     values ($1, $2, $3, 'test', 'Gate 4 admin residual test')
     on conflict (id) do nothing`,
    [REPORT_ID, USERS.member2, "c0000000-0000-0000-0000-000000000001"],
  );
});

afterAll(async () => {
  await pool.query("delete from public.reports where id=$1", [REPORT_ID]);
  await pool.query("delete from public.badge_applications where id=$1", [
    REJECT_BADGE_APPLICATION_ID,
  ]);
  await pool.query("delete from public.grade_applications where id=$1", [
    GRADE_APPLICATION_ID,
  ]);
  await pool.query(
    `delete from app_private.admin_command_receipts
     where actor_id=$1 and tool_name in ('member.suspend','badge.application.approve','badge.revoke')`,
    [USERS.admin],
  );
  await pool.query("delete from public.user_badges where application_id=$1", [
    BADGE_APPLICATION_ID,
  ]);
  await pool.query(
    `update public.badge_applications
     set status='submitted', reviewed_at=null, reviewed_by=null, review_note=null,
         review_idempotency_key=null, updated_at=now()
     where id=$1`,
    [BADGE_APPLICATION_ID],
  );
  await pool.query(
    `delete from public.account_state_events
     where user_id=$1 and reason_code='member.admin_suspend'`,
    [USERS.member2],
  );
  await pool.query(
    "update public.profiles set account_status='active', updated_at=now() where user_id=$1",
    [USERS.member2],
  );
  await pool.query(
    "update auth.users set banned_until=null, updated_at=now() where id=$1",
    [USERS.member2],
  );
  await pool.query(
    `delete from public.audit_events
     where tool_id in ('member.search','member.suspend','badge.application.approve','badge.revoke')`,
  );
  await pool.query(
    `delete from public.outbox_events
     where type in ('identity.user.suspended.v1','identity.badge.application.approved.v1','identity.badge.revoked.v1')`,
  );
  await pool.query("delete from auth.sessions where id in ($1, $2)", [
    ADMIN_SESSION_ID,
    MEMBER_SESSION_ID,
  ]);
  await pool.end();
  await closeCommandPool();
});

describe("Gate 3 관리자 공통 DB adapter", () => {
  it("active 회원이 설정 기반 뱃지를 신청하고 감사/outbox를 함께 기록한다", async () => {
    const applicationId = crypto.randomUUID();
    await asUser(USERS.member)(async (client) => {
      const submitted = await client.query(
        `select (public.submit_badge_application(
           $1, $2, $3::jsonb, '[]'::jsonb, $4, $5
         )).*`,
        [
          applicationId,
          BADGE_ID,
          JSON.stringify({ contribution: "helpful answers" }),
          `badge-submit-${applicationId}`,
          "trace-badge-submit",
        ],
      );
      expect(submitted.rows[0].status).toBe("submitted");
      await client.query("reset role");
      const evidence = await client.query(
        `select
           (select count(*)::int from public.audit_events where resource_id=$1) audit,
           (select count(*)::int from public.outbox_events where subject->>'id'=$1::text) outbox`,
        [applicationId],
      );
      expect(evidence.rows[0]).toEqual({ audit: 1, outbox: 1 });
    });
  });

  it("최신 DB 권한과 실제 세션을 공통 context로 제공한다", async () => {
    const result = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query("select app_private.current_admin_context() context"),
    );
    expect(result.rows[0].context).toMatchObject({
      actorId: USERS.admin,
      accountActive: true,
      activeSession: true,
    });
    expect(result.rows[0].context.permissions).toContain("member.suspend");
    expect(result.rows[0].context.permissions).toContain("badge.approve");
  });

  it("민감 query도 권한을 검사하고 감사한다", async () => {
    await expectRlsDenied(
      asAppCommandWithClaims(USERS.member, claims(), (client) =>
        client.query(
          "select app_private.search_members('', 50, 'trace-denied')",
        ),
      ),
    );
    const result = await asAppCommandWithClaims(
      USERS.admin,
      claims(),
      (client) =>
        client.query(
          "select app_private.search_members('member', 50, 'trace-member-search') result",
        ),
      true,
    );
    expect(result.rows[0].result.rows.length).toBeGreaterThan(0);
    const audit = await pool.query(
      "select count(*)::int n from public.audit_events where trace_id='trace-member-search' and tool_id='member.search'",
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("뱃지 승인은 recent TOTP와 세션을 요구하고 멱등하게 부여한다", async () => {
    await expectRlsDenied(
      asAppCommandWithClaims(USERS.admin, claims(), (client) =>
        client.query(
          "select app_private.approve_badge_application($1,'verified',$2,$3)",
          [BADGE_APPLICATION_ID, "badge-approve-key", "trace-badge-denied"],
        ),
      ),
    );
    await expectRlsDenied(
      asAppCommandWithClaims(
        USERS.admin,
        claims(Math.floor(Date.now() / 1000), crypto.randomUUID()),
        (client) =>
          client.query(
            "select app_private.approve_badge_application($1,'verified',$2,$3)",
            [BADGE_APPLICATION_ID, "badge-approve-key", "trace-badge-session"],
          ),
      ),
    );

    const approved = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query(
          "select app_private.approve_badge_application($1,'verified',$2,$3) result",
          [BADGE_APPLICATION_ID, "badge-approve-key", "trace-badge-approve"],
        ),
      true,
    );
    expect(approved.rows[0].result.status).toBe("approved");
    const retried = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query(
          "select app_private.approve_badge_application($1,'verified',$2,$3) result",
          [BADGE_APPLICATION_ID, "badge-approve-key", "trace-badge-retry"],
        ),
    );
    expect(retried.rows[0].result.userBadgeId).toBe(
      approved.rows[0].result.userBadgeId,
    );
    const badges = await pool.query(
      "select count(*)::int n from public.user_badges where application_id=$1",
      [BADGE_APPLICATION_ID],
    );
    expect(badges.rows[0].n).toBe(1);
  });

  it("부여된 뱃지를 사유와 함께 멱등 회수한다", async () => {
    const badge = await pool.query(
      "select id from public.user_badges where application_id=$1",
      [BADGE_APPLICATION_ID],
    );
    const userBadgeId = badge.rows[0].id;
    const revoked = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query(
          "select app_private.revoke_user_badge($1,'policy violation',$2,$3) result",
          [userBadgeId, "badge-revoke-key", "trace-badge-revoke"],
        ),
      true,
    );
    expect(revoked.rows[0].result.status).toBe("revoked");
    const state = await pool.query(
      "select revoked_at is not null revoked from public.user_badges where id=$1",
      [userBadgeId],
    );
    expect(state.rows[0].revoked).toBe(true);
  });

  it("회원 정지는 Auth 세션과 앱 쓰기를 즉시 막고 멱등 처리한다", async () => {
    const result = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query(
          "select app_private.suspend_member($1,'abuse report',$2,$3) result",
          [USERS.member2, "member-suspend-key", "trace-member-suspend"],
        ),
      true,
    );
    expect(result.rows[0].result.accountStatus).toBe("suspended");
    const stored = await pool.query(
      `select p.account_status, u.banned_until,
              (select count(*)::int from auth.sessions s where s.user_id=p.user_id) sessions
       from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=$1`,
      [USERS.member2],
    );
    expect(stored.rows[0].account_status).toBe("suspended");
    expect(stored.rows[0].banned_until).not.toBeNull();
    expect(stored.rows[0].sessions).toBe(0);

    await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (client) =>
        client.query(
          "select app_private.suspend_member($1,'abuse report',$2,$3)",
          [USERS.member2, "member-suspend-key", "trace-member-suspend-retry"],
        ),
    );
    const events = await pool.query(
      `select count(*)::int n from public.audit_events
       where resource_id=$1 and tool_id='member.suspend'`,
      [USERS.member2],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it("회원 복구·탈퇴·역할 변경 잔여 명령도 recent TOTP 경계에서 실행한다", async () => {
    const recentTotp = claims(Math.floor(Date.now() / 1000));
    const unsuspended = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.unsuspend_member($1,'review complete',$2,$3) result",
          [USERS.suspended, "member-unsuspend-key", "trace-member-unsuspend"],
        ),
    );
    expect(unsuspended.rows[0].result.accountStatus).toBe("active");

    const role = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.set_member_role($1,'moderator','grant',$2,$3) result",
          [USERS.member2, "member-role-grant-key", "trace-member-role"],
        ),
    );
    expect(role.rows[0].result).toMatchObject({
      action: "grant",
      roleKey: "moderator",
    });

    const withdrawn = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.withdraw_member($1,'operator request',$2,$3) result",
          [USERS.member, "member-withdraw-key", "trace-member-withdraw"],
        ),
    );
    expect(withdrawn.rows[0].result.accountStatus).toBe("withdrawn");
  });

  it("거절·신고·모더레이션·서비스계정 잔여 명령을 감사 가능한 command로 실행한다", async () => {
    const recentTotp = claims(Math.floor(Date.now() / 1000));
    const grade = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.reject_grade_application($1,'evidence insufficient',$2,$3) result",
          [GRADE_APPLICATION_ID, "grade-reject-key", "trace-grade-reject"],
        ),
    );
    expect(grade.rows[0].result.status).toBe("rejected");

    const badge = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.reject_badge_application($1,'evidence insufficient',$2,$3) result",
          [
            REJECT_BADGE_APPLICATION_ID,
            "badge-reject-key",
            "trace-badge-reject",
          ],
        ),
    );
    expect(badge.rows[0].result.status).toBe("rejected");

    const content = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.moderate_content('post',$1,'hide','policy violation',$2,$3) result",
          [
            "c0000000-0000-0000-0000-000000000001",
            "content-hide-key",
            "trace-content-hide",
          ],
        ),
    );
    expect(content.rows[0].result.action).toBe("hide");

    const report = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.resolve_report($1,'handled by moderator',$2,$3) result",
          [REPORT_ID, "report-resolve-key", "trace-report-resolve"],
        ),
    );
    expect(report.rows[0].result.status).toBe("resolved");

    const serviceAccount = await asAppCommandWithClaims(
      USERS.admin,
      recentTotp,
      (client) =>
        client.query(
          "select app_private.disable_service_account($1,'automation retired',$2,$3) result",
          [SERVICE_ACCOUNT_ID, "service-disable-key", "trace-service-disable"],
        ),
    );
    expect(serviceAccount.rows[0].result.status).toBe("disabled");
  });
});
