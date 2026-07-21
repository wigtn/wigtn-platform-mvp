import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAppCommandWithClaims,
  asUser,
  closeCommandPool,
  expectRlsDenied,
  pool,
  USERS,
} from "./helpers";

const GRADE_ID = "72000000-0000-0000-0000-000000000001";
const SUBMIT_APP_ID = "73000000-0000-0000-0000-000000000001";
const REVIEW_APP_ID = "73000000-0000-0000-0000-000000000002";
const OTHER_APP_ID = "73000000-0000-0000-0000-000000000003";
const ADMIN_SESSION_ID = "74000000-0000-0000-0000-000000000001";
const SUBMIT_PATH = `${USERS.member}/${SUBMIT_APP_ID}/proof.pdf`;

const claims = (totpTimestamp?: number) => ({
  aal: totpTimestamp === undefined ? "aal1" : "aal2",
  session_id: ADMIN_SESSION_ID,
  amr:
    totpTimestamp === undefined
      ? [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }]
      : [
          { method: "password", timestamp: totpTimestamp - 10 },
          { method: "totp", timestamp: totpTimestamp },
        ],
});

beforeAll(async () => {
  await pool.query(
    `insert into auth.sessions (id, user_id, created_at, updated_at, aal)
     values ($1, $2, now(), now(), 'aal2')
     on conflict (id) do update set user_id=excluded.user_id, aal=excluded.aal`,
    [ADMIN_SESSION_ID, USERS.admin],
  );
  await pool.query(
    `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
     values ('grade-evidence', $1, $2::uuid, $2::text, '{"mimetype":"application/pdf","size":1024}'::jsonb)
     on conflict (bucket_id, name) do update set owner=$2::uuid, owner_id=$2::text`,
    [SUBMIT_PATH, USERS.member],
  );
  await pool.query(
    `insert into public.grade_applications
       (id, user_id, grade_id, grade_config_version, status, form_data,
        submit_idempotency_key, submitted_at)
     values
       ($1, $2, $3, 1, 'submitted', '{}', 'review-fixture', now()),
       ($4, $5, $3, 1, 'submitted', '{}', 'other-fixture', now())
     on conflict (id) do nothing`,
    [REVIEW_APP_ID, USERS.member, GRADE_ID, OTHER_APP_ID, USERS.member2],
  );
});

afterAll(async () => {
  // Storage 메타데이터는 SQL로 직접 삭제하지 않는다. 로컬/CI db reset이 fixture를 정리한다.
  await pool.query(
    "delete from public.user_membership_grades where application_id=$1",
    [REVIEW_APP_ID],
  );
  await pool.query(
    "delete from public.grade_applications where id in ($1, $2)",
    [REVIEW_APP_ID, OTHER_APP_ID],
  );
  await pool.query("delete from public.audit_events where resource_id=$1", [
    REVIEW_APP_ID,
  ]);
  await pool.query("delete from public.outbox_events where subject->>'id'=$1", [
    REVIEW_APP_ID,
  ]);
  await pool.query("delete from auth.sessions where id=$1", [ADMIN_SESSION_ID]);
  await pool.end();
  await closeCommandPool();
});

describe("Gate 2 등급 신청 command", () => {
  it("active 본인 증빙만 제출하고 감사/outbox를 같은 트랜잭션에 남긴다", async () => {
    await asUser(USERS.member)(async (c) => {
      const result = await c.query(
        `select (public.submit_grade_application(
          $1, $2, $3::jsonb, $4::jsonb, $5, $6
        )).*`,
        [
          SUBMIT_APP_ID,
          GRADE_ID,
          JSON.stringify({ company: "Demo", achievement: "Contract" }),
          JSON.stringify([
            {
              objectPath: SUBMIT_PATH,
              originalName: "proof.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
            },
          ]),
          "submit-key-0001",
          "trace-submit-1",
        ],
      );
      expect(result.rows[0].status).toBe("submitted");

      await c.query("reset role");

      const documents = await c.query(
        "select count(*)::int n from public.grade_application_documents where application_id=$1",
        [SUBMIT_APP_ID],
      );
      const audit = await c.query(
        "select count(*)::int n from public.audit_events where resource_id=$1 and action='grade.application.submit'",
        [SUBMIT_APP_ID],
      );
      const outbox = await c.query(
        "select count(*)::int n from public.outbox_events where subject->>'id'=$1 and type='identity.grade.application.submitted.v1'",
        [SUBMIT_APP_ID],
      );
      expect(documents.rows[0].n).toBe(1);
      expect(audit.rows[0].n).toBe(1);
      expect(outbox.rows[0].n).toBe(1);
    });
  });

  it("정지 계정의 기존 세션 제출을 거부한다", async () => {
    await asUser(USERS.suspended)((c) =>
      expectRlsDenied(
        c.query(
          "select public.submit_grade_application($1,$2,'{}','[]',$3,null)",
          [crypto.randomUUID(), GRADE_ID, "suspended-submit"],
        ),
      ),
    );
  });

  it("타인의 신청은 RLS로 보이지 않는다", async () => {
    const n = await asUser(USERS.member)((c) =>
      c
        .query(
          "select count(*)::int n from public.grade_applications where id=$1",
          [OTHER_APP_ID],
        )
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
  });
});

describe("Gate 2 관리자 승인 high-risk command", () => {
  const approve = (
    userId: string,
    authClaims: Record<string, unknown>,
    idempotency = "approval-key-0001",
  ) =>
    asAppCommandWithClaims(userId, authClaims, (c) =>
      c.query(
        "select (app_private.approve_grade_application($1,$2,'verified',$3)).*",
        [REVIEW_APP_ID, idempotency, "trace-approval-1"],
      ),
    );

  it("일반 회원은 최근 TOTP가 있어도 승인할 수 없다", async () => {
    await expectRlsDenied(
      approve(USERS.member, claims(Math.floor(Date.now() / 1000))),
    );
  });

  it("관리자 AAL1과 10분이 지난 TOTP를 모두 거부한다", async () => {
    await expectRlsDenied(approve(USERS.admin, claims()));
    await expectRlsDenied(
      approve(USERS.admin, claims(Math.floor(Date.now() / 1000) - 12 * 60)),
    );
    await expectRlsDenied(
      approve(USERS.admin, {
        ...claims(Math.floor(Date.now() / 1000)),
        session_id: crypto.randomUUID(),
      }),
    );
  });

  it("최신 DB 권한 + 최근 TOTP 관리자만 승인하며 원자적으로 등급을 반영한다", async () => {
    const approved = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (c) =>
        c.query(
          "select (app_private.approve_grade_application($1,$2,'verified',$3)).*",
          [REVIEW_APP_ID, "approval-key-0001", "trace-approval-1"],
        ),
      true,
    );
    expect(approved.rows[0].status).toBe("approved");

    const grade = await pool.query(
      "select count(*)::int n from public.user_membership_grades where application_id=$1 and revoked_at is null",
      [REVIEW_APP_ID],
    );
    const audit = await pool.query(
      "select count(*)::int n from public.audit_events where resource_id=$1 and action='grade.application.approve'",
      [REVIEW_APP_ID],
    );
    const outbox = await pool.query(
      "select count(*)::int n from public.outbox_events where subject->>'id'=$1 and type='identity.grade.application.approved.v1'",
      [REVIEW_APP_ID],
    );
    expect(grade.rows[0].n).toBe(1);
    expect(audit.rows[0].n).toBe(1);
    expect(outbox.rows[0].n).toBe(1);

    const retry = await asAppCommandWithClaims(
      USERS.admin,
      claims(Math.floor(Date.now() / 1000)),
      (c) =>
        c.query(
          "select (app_private.approve_grade_application($1,$2,'verified',$3)).*",
          [REVIEW_APP_ID, "approval-key-0001", "trace-approval-retry"],
        ),
    );
    expect(retry.rows[0].id).toBe(REVIEW_APP_ID);
    const events = await pool.query(
      "select count(*)::int n from public.audit_events where resource_id=$1 and action='grade.application.approve'",
      [REVIEW_APP_ID],
    );
    expect(events.rows[0].n).toBe(1);
  });
});
