// Gate 5 재사용 검증 — demo-b 핵심 E2E (PROD-533, UNIFIED-PRD §16 / AC-101·103·112).
//
// 이 스위트는 DB가 demo-b seed(configs/projects/demo-b/seed.sql)로 적재됐다고 가정한다.
// 기본 demo seed에서는 대상 fixture가 없으므로 GATE5_DEMO_B=1일 때만 실행된다.
// 실행 진입점: `pnpm verify:reuse` (하네스가 seed 교체 + 이 파일 실행 + demo seed 복원).
//
// 증명: 코어 소스(스키마·함수·패키지·앱)를 한 줄도 바꾸지 않고 데이터/설정만 교체한 demo-b에서
// 가입·게시판·관리자 툴(등급 승인)이 동일 코어로 동작한다 — 그리고 권한/등급/게시판 구성이 demo와 다르다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAppCommandWithClaims,
  asUser,
  closeCommandPool,
  expectRlsDenied,
  pool,
} from "./helpers";

const RUN = process.env.GATE5_DEMO_B === "1";

// demo-b fixture 상수 (configs/projects/demo-b/seed.sql와 일치)
const MEMBER = "11111111-1111-1111-1111-111111111111";
const MODERATOR = "33333333-3333-3333-3333-333333333333";
const NEWBIE = "77777777-7777-7777-7777-777777777777";
const CONSENT_TERMS = "71000000-0000-0000-0000-0000000000b1";
const CONSENT_PRIVACY = "71000000-0000-0000-0000-0000000000b2";
const STARTER_GRADE = "72000000-0000-0000-0000-0000000000b1"; // required_evidence 없음
const PRO_GRADE = "72000000-0000-0000-0000-0000000000b2"; //     required_evidence 있음
const BOARD_DISCUSSION = "discussion"; // [posts,comments,reactions,bookmarks,reports]
const BOARD_FEEDBACK = "feedback"; //     [posts,reports] — 댓글 capability 없음
const MOD_SESSION = "74000000-0000-0000-0000-0000000000b1";
const GRADE_APP = "72a00000-0000-0000-0000-0000000000b1"; // 등급 네임스페이스(72)

// auth_membership.test.ts와 동일한 step-up claims(aal2 + 최근 TOTP).
const stepUpClaims = () => {
  const now = Math.floor(Date.now() / 1000);
  return {
    aal: "aal2",
    session_id: MOD_SESSION,
    amr: [
      { method: "password", timestamp: now - 10 },
      { method: "totp", timestamp: now },
    ],
  };
};

describe.skipIf(!RUN)("Gate 5 — demo-b 재사용 핵심 E2E", () => {
  beforeAll(async () => {
    // 모더레이터 step-up 세션 + pro-verified 등급 신청(submitted) fixture
    await pool.query(
      `insert into auth.sessions (id, user_id, created_at, updated_at, aal)
       values ($1, $2, now(), now(), 'aal2')
       on conflict (id) do update set user_id=excluded.user_id, aal=excluded.aal`,
      [MOD_SESSION, MODERATOR],
    );
    await pool.query(
      `insert into public.grade_applications
         (id, user_id, grade_id, grade_config_version, status, form_data,
          submit_idempotency_key, submitted_at)
       values ($1, $2, $3, 1, 'submitted',
          '{"company":"데모비","portfolioUrl":"https://ex.test/p"}'::jsonb,
          'gate5-submit-b1', now())
       on conflict (id) do nothing`,
      [GRADE_APP, MEMBER, PRO_GRADE],
    );
  });

  afterAll(async () => {
    await pool.query(
      "delete from public.user_membership_grades where application_id=$1",
      [GRADE_APP],
    );
    await pool.query("delete from public.grade_applications where id=$1", [
      GRADE_APP,
    ]);
    await pool.query("delete from auth.sessions where id=$1", [MOD_SESSION]);
    await pool.end();
    await closeCommandPool();
  });

  // ── AC-101: 등급 정의(설정)가 코어 동작을 실제로 바꾼다 — 동어반복 아닌 행위 검증 ──
  // demo-b의 두 등급은 required_evidence 구성이 다르다. 코어 submit_grade_application은 이 설정값에 따라
  // 증빙 없는 신청을 등급별로 다르게 판정한다(코어 소스 변경 0 — 설정만으로 승인 조건이 달라짐).
  it("등급 정의 차이가 동작을 바꾼다: 증빙 필수(pro-verified) vs 불필요(starter)", async () => {
    await asUser(MEMBER)(async (c) => {
      // starter(required_evidence=[]) → 증빙 없이 신청 성공
      const ok = await c.query(
        "select (public.submit_grade_application($1,$2,$3::jsonb,'[]'::jsonb,$4,'gate5-starter')).*",
        [
          crypto.randomUUID(),
          STARTER_GRADE,
          JSON.stringify({ nickname: "데모비" }),
          "gate5-starter-noevi",
        ],
      );
      expect(ok.rows[0].status).toBe("submitted");

      // pro-verified(required_evidence 있음) → 증빙 없이 신청하면 코어가 거부
      await expect(
        c.query(
          "select public.submit_grade_application($1,$2,$3::jsonb,'[]'::jsonb,$4,'gate5-pro')",
          [
            crypto.randomUUID(),
            PRO_GRADE,
            JSON.stringify({
              company: "데모비",
              portfolioUrl: "https://ex.test/p",
            }),
            "gate5-pro-noevi",
          ],
        ),
      ).rejects.toThrow(/evidence required/);
    });
  });

  // ── 가입 E2E: 코어 온보딩 명령이 demo-b 동의 구성으로 동작 ──
  it("가입: 신규 회원이 demo-b 필수 동의로 온보딩되어 active가 된다", async () => {
    const profile = await asUser(NEWBIE)(async (c) => {
      const r = await c.query(
        "select (public.complete_member_onboarding($1,$2,$3::uuid[],$4)).*",
        [
          "newbieb",
          "데모비 뉴비",
          [CONSENT_TERMS, CONSENT_PRIVACY],
          "gate5-onboard",
        ],
      );
      return r.rows[0];
    });
    expect(profile.account_status).toBe("active");
    expect(profile.handle).toBe("newbieb");
  });

  // ── 게시판 E2E (AC-103): 동일 코어가 capability 조합에 따라 다르게 동작 ──
  it("게시판: 댓글 capability가 있는 게시판은 글+댓글이 되고, 없는 게시판은 댓글이 거부된다", async () => {
    // discussion(댓글 O): 글 + 댓글 성공
    await asUser(MEMBER)(async (c) => {
      const postId = crypto.randomUUID();
      await c.query(
        `select public.create_post($1, $2, '토론 글', $3::jsonb, '{}'::uuid[], $4, 'gate5-post-d')`,
        [
          BOARD_DISCUSSION,
          postId,
          JSON.stringify({
            version: 1,
            blocks: [{ type: "paragraph", text: "안녕하세요" }],
          }),
          "gate5-post-d-1",
        ],
      );
      const comment = await c.query(
        "select public.create_comment($1,$2,null,'첫 댓글',$3,'gate5-cmt-d') as result",
        [crypto.randomUUID(), postId, "gate5-cmt-d-1"],
      );
      expect(comment.rows[0].result.id).toBeTruthy();
    });

    // feedback(댓글 X): 글은 되지만 댓글은 capability 부재로 거부
    await asUser(MEMBER)(async (c) => {
      const postId = crypto.randomUUID();
      await c.query(
        `select public.create_post($1, $2, '피드백 글', $3::jsonb, '{}'::uuid[], $4, 'gate5-post-f')`,
        [
          BOARD_FEEDBACK,
          postId,
          JSON.stringify({
            version: 1,
            blocks: [{ type: "paragraph", text: "제보합니다" }],
          }),
          "gate5-post-f-1",
        ],
      );
      // 댓글 capability 없는 게시판은 create_comment의 board join(capabilities @> ['comments'])에서
      // 대상 글을 못 찾아 'published post not found'로 거부된다 — capability 부재가 원인임을 특정 검증.
      await expect(
        c.query(
          "select public.create_comment($1,$2,null,'댓글 시도',$3,'gate5-cmt-f')",
          [crypto.randomUUID(), postId, "gate5-cmt-f-1"],
        ),
      ).rejects.toThrow(/published post not found/);
    });
  });

  // ── 관리자 툴 E2E (권한 체계 대조): 동일 코어가 demo-b의 다른 권한 매핑을 따른다 ──
  it("관리자 툴: demo-b 모더레이터가 등급을 승인한다 (has_permission 기반 — role 하드코딩 아님)", async () => {
    const approved = await asAppCommandWithClaims(
      MODERATOR,
      stepUpClaims(),
      (c) =>
        c.query(
          "select (app_private.approve_grade_application($1,$2,$3,$4)).*",
          [
            GRADE_APP,
            "gate5-approve-key-1",
            "포트폴리오 확인",
            "gate5-approve-trace",
          ],
        ),
      true,
    );
    expect(approved.rows[0].status).toBe("approved");

    const granted = await pool.query(
      "select count(*)::int n from public.user_membership_grades where application_id=$1 and revoked_at is null",
      [GRADE_APP],
    );
    expect(granted.rows[0].n).toBe(1);
  });

  it("관리자 툴: 일반 회원은 grade.approve가 없어 승인이 거부된다", async () => {
    await expectRlsDenied(
      asAppCommandWithClaims(
        MEMBER,
        { ...stepUpClaims(), session_id: MOD_SESSION },
        (c) =>
          c.query("select app_private.approve_grade_application($1,$2,$3,$4)", [
            GRADE_APP,
            "gate5-approve-deny-1",
            null,
            "gate5-approve-deny",
          ]),
      ),
    );
  });
});
