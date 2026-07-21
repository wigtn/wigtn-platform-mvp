import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asAppCommandWithClaims,
  asUser,
  closeCommandPool,
  expectRlsDenied,
  pool,
  USERS,
} from "./helpers";

const COMPANY = "c0000000-0000-0000-0000-000000000001";
const ADMIN_SESSION = "75900000-0000-0000-0000-000000000001";
const dimensions = { compensation: 4, growth: 5, culture: 3, leadership: 4 };
const adminClaims = () => ({
  aal: "aal2",
  session_id: ADMIN_SESSION,
  amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
});

beforeAll(async () => {
  await pool.query(
    `insert into auth.sessions (id, user_id, created_at, updated_at, aal)
     values ($1, $2, now(), now(), 'aal2')
     on conflict (id) do update set user_id=excluded.user_id, aal=excluded.aal`,
    [ADMIN_SESSION, USERS.admin],
  );
});

afterAll(async () => {
  await pool.query("delete from auth.sessions where id=$1", [ADMIN_SESSION]);
  await pool.end();
  await closeCommandPool();
});

describe("sales platform domains", () => {
  it("anonymous users can search active companies but cannot write them", async () => {
    await asAnon(async (client) => {
      const result = await client.query(
        "select name from public.companies order by name",
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(3);
      await expectRlsDenied(
        client.query(
          "insert into public.companies(slug,name,normalized_name) values('blocked-company','blocked','blocked')",
        ),
      );
    });
  });

  it("creates an anonymous review, derives its average, and keeps identity private", async () => {
    await asUser(USERS.member)(async (client) => {
      const key = `review-${crypto.randomUUID()}`;
      const created = await client.query<{
        result: { reviewId: string; created: boolean };
      }>(
        "select public.create_company_review($1,$2,$3,'current',$4::jsonb,$5,$6) result",
        [
          COMPANY,
          "영업 조직 리뷰",
          "목표와 코칭 방식이 명확하고 동료 간 노하우 공유가 활발했습니다.",
          JSON.stringify(dimensions),
          key,
          "trace-review",
        ],
      );
      const reviewId = created.rows[0].result.reviewId;
      expect(created.rows[0].result.created).toBe(true);
      const publicReview = await client.query(
        "select * from public.company_reviews where id=$1",
        [reviewId],
      );
      expect(publicReview.rows[0].overall_score).toBe("4.0");
      expect(Object.keys(publicReview.rows[0])).not.toContain("user_id");
      const stats = await client.query(
        "select review_count, overall_average from public.company_review_stats where company_id=$1",
        [COMPANY],
      );
      expect(stats.rows[0]).toMatchObject({
        review_count: 1,
        overall_average: "4.00",
      });
      await expectRlsDenied(
        client.query(
          "select * from app_private.company_review_authors where review_id=$1",
          [reviewId],
        ),
      );
    });
  });

  it("enforces one review per member and company", async () => {
    await asUser(USERS.member)(async (client) => {
      const body =
        "중복 회사 리뷰를 막는 제약조건을 확인하기 위한 충분히 긴 본문입니다.";
      await client.query(
        "select public.create_company_review($1,$2,$3,'former',$4::jsonb,$5)",
        [
          COMPANY,
          "첫 리뷰",
          body,
          JSON.stringify(dimensions),
          `review-${crypto.randomUUID()}`,
        ],
      );
      await expect(
        client.query(
          "select public.create_company_review($1,$2,$3,'former',$4::jsonb,$5)",
          [
            COMPANY,
            "중복 리뷰",
            body,
            JSON.stringify(dimensions),
            `review-${crypto.randomUUID()}`,
          ],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });
  });

  it("company import validates rows, writes companies, audits, and is idempotent", async () => {
    const key = `import-${crypto.randomUUID()}`;
    const sourceHash = crypto.randomUUID().replaceAll("-", "").repeat(2);
    const traceId = `trace-import-${crypto.randomUUID()}`;
    const rows = [
      { name: "테스트 세일즈", slug: "test-sales", industry: "SaaS" },
      { name: "", slug: "bad" },
    ];
    const first = await asAppCommandWithClaims(
      USERS.admin,
      adminClaims(),
      (client) =>
        client.query<{
          result: { jobId: string; validCount: number; errorCount: number };
        }>(
          "select app_private.import_companies($1,$2,$3::jsonb,false,$4,$5) result",
          ["companies.csv", sourceHash, JSON.stringify(rows), key, traceId],
        ),
      true,
    );
    expect(first.rows[0].result).toMatchObject({
      validCount: 1,
      errorCount: 1,
    });
    const second = await asAppCommandWithClaims(
      USERS.admin,
      adminClaims(),
      (client) =>
        client.query(
          "select app_private.import_companies($1,$2,$3::jsonb,false,$4,$5) result",
          [
            "companies.csv",
            sourceHash,
            JSON.stringify(rows),
            key,
            "trace-import-retry",
          ],
        ),
    );
    expect(second.rows[0].result.jobId).toBe(first.rows[0].result.jobId);
    expect(
      (
        await pool.query(
          "select count(*)::int n from public.companies where slug='test-sales'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "select count(*)::int n from public.audit_events where trace_id=$1",
          [traceId],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("creates and publishes a versioned main placement with optimistic locking", async () => {
    const createKey = `placement-create-${crypto.randomUUID()}`;
    const created = await asAppCommandWithClaims(
      USERS.admin,
      adminClaims(),
      (client) =>
        client.query<{ result: { placementId: string; version: number } }>(
          "select app_private.upsert_content_placement(null,'home.hero','external',null,$1::jsonb,0,null,null,0,$2,$3) result",
          [
            JSON.stringify({ title: "영업인의 오늘" }),
            createKey,
            "trace-placement-create",
          ],
        ),
      true,
    );
    const placement = created.rows[0].result;
    expect(placement.version).toBe(1);
    const published = await asAppCommandWithClaims(
      USERS.admin,
      adminClaims(),
      (client) =>
        client.query<{ result: { version: number } }>(
          "select app_private.publish_content_placement($1,$2,$3,$4) result",
          [
            placement.placementId,
            placement.version,
            `placement-publish-${crypto.randomUUID()}`,
            "trace-placement-publish",
          ],
        ),
      true,
    );
    expect(published.rows[0].result.version).toBe(2);
    await asAnon(async (client) => {
      const visible = await client.query(
        "select status, payload from public.content_placements where id=$1",
        [placement.placementId],
      );
      expect(visible.rows[0]).toMatchObject({
        status: "published",
        payload: { title: "영업인의 오늘" },
      });
    });
  });
});
