import { afterAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asAppCommandWithClaims,
  asUser,
  closeCommandPool,
  pool,
  POSTS,
  USERS,
} from "./helpers";

const source = (text: string) =>
  JSON.stringify({ version: 1, blocks: [{ type: "paragraph", text }] });

afterAll(async () => {
  await pool.end();
  await closeCommandPool();
});

describe("Gate 4 content commands", () => {
  it("anon은 쓰기 RPC와 내부 outbox command를 실행할 수 없다", async () => {
    const acl = await pool.query(
      "select has_function_privilege('anon', 'public.create_post(text,uuid,text,jsonb,uuid[],text,text)', 'execute') allowed",
    );
    expect(acl.rows[0].allowed).toBe(false);
    await asAnon(async (client) => {
      await expect(
        client.query("select app_private.ack_outbox($1,'anon')", [
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("원본·escape된 HTML·감사·outbox를 한 트랜잭션에 기록한다", async () => {
    await asUser(USERS.member)(async (client) => {
      const postId = crypto.randomUUID();
      const result = await client.query(
        `select public.create_post('qna', $1, 'sanitize test', $2::jsonb,
           '{}'::uuid[], $3, 'trace-content-create') result`,
        [
          postId,
          source("hello <script>alert(1)</script>"),
          `post-key-${postId}`,
        ],
      );
      expect(result.rows[0].result.status).toBe("published");
      await client.query("reset role");
      const stored = await client.query(
        `select c.sanitized_html,
          (select count(*)::int from public.audit_events where resource_id=$1) audit,
          (select count(*)::int from public.outbox_events
             where type='community.post.created.v1' and subject->>'id'=$1::text) outbox
         from public.post_contents c where c.post_id=$1`,
        [postId],
      );
      expect(stored.rows[0].sanitized_html).toContain("&lt;script&gt;");
      expect(stored.rows[0].sanitized_html).not.toContain("<script>");
      expect(stored.rows[0]).toMatchObject({ audit: 1, outbox: 1 });
    });
  });

  it("수정 전에 revision을 남긴다", async () => {
    await asUser(USERS.member)(async (client) => {
      const result = await client.query(
        "select public.update_post($1, '수정 제목', $2::jsonb, 'trace-content-update') result",
        [POSTS.memberPublished, source("수정 본문")],
      );
      expect(result.rows[0].result.revision).toBe(1);
      await client.query("reset role");
      const revision = await client.query(
        "select title, sanitized_html from public.post_revisions where post_id=$1",
        [POSTS.memberPublished],
      );
      expect(revision.rows[0].title).toBe("영업 팁 질문");
    });
  });

  it("댓글/대댓글 2단계를 넘는 parent를 DB에서 거부한다", async () => {
    await asUser(USERS.member)(async (client) => {
      const parent = crypto.randomUUID();
      const reply = crypto.randomUUID();
      await client.query(
        "select public.create_comment($1,$2,null,'parent',$3,'trace-parent')",
        [parent, POSTS.memberPublished, `comment-${parent}`],
      );
      await client.query(
        "select public.create_comment($1,$2,$3,'reply',$4,'trace-reply')",
        [reply, POSTS.memberPublished, parent, `comment-${reply}`],
      );
      await expect(
        client.query(
          "select public.create_comment($1,$2,$3,'too deep',$4,'trace-depth')",
          [
            crypto.randomUUID(),
            POSTS.memberPublished,
            reply,
            crypto.randomUUID(),
          ],
        ),
      ).rejects.toThrow(/depth|parent/i);
    });
  });

  it("좋아요·스크랩은 사용자별 중복 없이 취소 가능하다", async () => {
    await asUser(USERS.member2)(async (client) => {
      await client.query("select public.set_post_reaction($1, 'like')", [
        POSTS.memberPublished,
      ]);
      await client.query("select public.set_post_reaction($1, 'like')", [
        POSTS.memberPublished,
      ]);
      await client.query("select public.set_post_bookmark($1)", [
        POSTS.memberPublished,
      ]);
      await client.query("select public.set_post_bookmark($1)", [
        POSTS.memberPublished,
      ]);
      const counts = await client.query(
        `select
          (select count(*)::int from public.reactions where post_id=$1 and user_id=$2) reactions,
          (select count(*)::int from public.bookmarks where post_id=$1 and user_id=$2) bookmarks`,
        [POSTS.memberPublished, USERS.member2],
      );
      expect(counts.rows[0]).toEqual({ reactions: 1, bookmarks: 1 });
      await client.query("select public.remove_post_reaction($1, 'like')", [
        POSTS.memberPublished,
      ]);
      await client.query("select public.remove_post_bookmark($1)", [
        POSTS.memberPublished,
      ]);
    });
  });

  it("동일 대상의 열린 중복 신고를 거부한다", async () => {
    await asUser(USERS.member2)(async (client) => {
      await client.query(
        "select public.submit_content_report($1,null,'spam','first','trace-report')",
        [POSTS.memberPublished],
      );
      await expect(
        client.query(
          "select public.submit_content_report($1,null,'spam','again','trace-report-2')",
          [POSTS.memberPublished],
        ),
      ).rejects.toThrow(/already exists/i);
    });
  });

  it("WIGTN API limiter는 원자 카운터로 한도를 집행한다", async () => {
    const subject = crypto.randomUUID().replaceAll("-", "").padEnd(64, "a");
    const first = await asAppCommandWithClaims(
      USERS.member,
      {},
      (client) =>
        client.query(
          "select app_private.consume_api_rate_limit('search',$1,1,60) result",
          [subject],
        ),
      true,
    );
    const second = await asAppCommandWithClaims(USERS.member, {}, (client) =>
      client.query(
        "select app_private.consume_api_rate_limit('search',$1,1,60) result",
        [subject],
      ),
    );
    expect(first.rows[0].result.allowed).toBe(true);
    expect(second.rows[0].result.allowed).toBe(false);
    await pool.query(
      "delete from app_private.api_rate_limit_buckets where subject_hash=$1",
      [subject],
    );
  });

  it("서비스 계정도 일반 댓글 command의 권한 상한을 통과한다", async () => {
    await asUser(USERS.serviceAccount)(async (client) => {
      const result = await client.query(
        "select public.create_comment($1,$2,null,'service reply',$3,'trace-service-reply') result",
        [crypto.randomUUID(), POSTS.memberPublished, crypto.randomUUID()],
      );
      expect(result.rows[0].result.postId).toBe(POSTS.memberPublished);
    });
  });
});
