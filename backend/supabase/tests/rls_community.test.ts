// RLS 테스트 — 게시판/콘텐츠 (PRD §10.2, §10.3). 서비스 계정 predicate는 Gate 1 완료조건(§3.7).
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  asAnon,
  asUser,
  BOARDS,
  expectRlsDenied,
  POSTS,
  pool,
  USERS,
} from "./helpers";

afterAll(async () => {
  await pool.end();
});

const insertPost = (board: string, author: string) => `
  insert into public.posts (board_id, author_id, title, body, status)
  values ('${board}', '${author}', 't', 'b', 'published') returning id`;

const insertComment = (
  board: string,
  author: string,
  post = POSTS.memberPublished,
) => `
  insert into public.comments (post_id, board_id, author_id, body)
  values ('${post}', '${board}', '${author}', 'reply') returning id`;

async function withSetupAsUser<T>(
  sub: string,
  setup: (client: PoolClient) => Promise<void>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setup(client);
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

describe("posts visibility (§10.2)", () => {
  it("anon은 published 글만 본다", async () => {
    const n = await asAnon((c) =>
      c
        .query("select count(*)::int n from public.posts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(1); // seed: published 1 + draft 1 → anon엔 1
  });

  it("작성자는 공개 글 + 자기 draft를 본다", async () => {
    const n = await asUser(USERS.member)((c) =>
      c
        .query("select count(*)::int n from public.posts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(2);
  });

  it("타 회원은 남의 draft를 못 본다", async () => {
    const n = await asUser(USERS.member2)((c) =>
      c
        .query("select count(*)::int n from public.posts")
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(1);
  });
});

describe("posts 쓰기 + IDOR (§10.3)", () => {
  it("본인 글 작성 허용", async () => {
    const r = await asUser(USERS.member)((c) =>
      c.query(insertPost(BOARDS.qna, USERS.member)),
    );
    expect(r.rowCount).toBe(1);
  });

  it("author_id 위조(다른 사용자로) 작성은 거부", async () => {
    await asUser(USERS.member)((c) =>
      expectRlsDenied(c.query(insertPost(BOARDS.qna, USERS.member2))),
    );
  });

  it("타 회원이 남의 글을 UPDATE 못 함 (BOLA/IDOR)", async () => {
    const rowCount = await asUser(USERS.member2)((c) =>
      c
        .query(
          `update public.posts set title='hacked' where id='${POSTS.memberPublished}'`,
        )
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(0); // USING 불일치 → 조용히 0행
  });

  it("타 회원이 남의 글을 DELETE 못 함", async () => {
    const rowCount = await asUser(USERS.member2)((c) =>
      c
        .query(`delete from public.posts where id='${POSTS.memberPublished}'`)
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(0);
  });

  it("moderator는 남의 글을 블라인드(UPDATE)할 수 있다", async () => {
    const rowCount = await asUser(USERS.moderator)((c) =>
      c
        .query(
          `update public.posts set status='hidden' where id='${POSTS.memberPublished}'`,
        )
        .then((r) => r.rowCount),
    );
    expect(rowCount).toBe(1);
  });
});

describe("정지 즉시 집행 (§5.3)", () => {
  it("정지 회원은 기존 세션으로도 글 작성이 즉시 거부된다", async () => {
    await asUser(USERS.suspended)((c) =>
      expectRlsDenied(c.query(insertPost(BOARDS.qna, USERS.suspended))),
    );
  });

  it("정지 회원은 댓글 작성도 거부된다", async () => {
    await asUser(USERS.suspended)((c) =>
      expectRlsDenied(c.query(insertComment(BOARDS.qna, USERS.suspended))),
    );
  });
});

describe("서비스 계정 권한 상한 (§3.7, §10.2 — Gate 1 완료조건)", () => {
  it("허용 게시판(qna)의 공개 글을 읽을 수 있다", async () => {
    const visible = await asUser(USERS.serviceAccount)((c) =>
      c
        .query(
          `select count(*)::int n from public.posts where board_id='${BOARDS.qna}'`,
        )
        .then((r) => r.rows[0].n),
    );
    expect(visible).toBe(1);
  });

  it("허용 게시판(qna)에 답글 생성 허용", async () => {
    const r = await asUser(USERS.serviceAccount)((c) =>
      c.query(insertComment(BOARDS.qna, USERS.serviceAccount)),
    );
    expect(r.rowCount).toBe(1);
  });

  it("비허용 게시판(notice)의 공개 글도 읽지 못한다", async () => {
    const visible = await withSetupAsUser(
      USERS.serviceAccount,
      async (c) => {
        await c.query(
          `insert into public.posts (board_id, author_id, title, body, status)
           values ('${BOARDS.notice}', '${USERS.member}', 'notice', 'body', 'published')`,
        );
      },
      (c) =>
        c
          .query(
            `select count(*)::int n from public.posts where board_id='${BOARDS.notice}'`,
          )
          .then((r) => r.rows[0].n),
    );
    expect(visible).toBe(0);
  });

  it("비허용 게시판(notice)의 공개 댓글도 읽지 못한다", async () => {
    const visible = await withSetupAsUser(
      USERS.serviceAccount,
      async (c) => {
        const post = await c.query(
          `insert into public.posts (board_id, author_id, title, body, status)
           values ('${BOARDS.notice}', '${USERS.member}', 'notice', 'body', 'published')
           returning id`,
        );
        await c.query(
          `insert into public.comments (post_id, board_id, author_id, body)
           values ($1, '${BOARDS.notice}', '${USERS.member}', 'notice comment')`,
          [post.rows[0].id],
        );
      },
      (c) =>
        c
          .query(
            `select count(*)::int n from public.comments where board_id='${BOARDS.notice}'`,
          )
          .then((r) => r.rows[0].n),
    );
    expect(visible).toBe(0);
  });

  it("board_id 위조로 비허용 게시판 글에 답글을 달 수 없다", async () => {
    await withSetupAsUser(
      USERS.serviceAccount,
      async (c) => {
        await c.query(
          `insert into public.posts (id, board_id, author_id, title, body, status)
           values ('c0000000-0000-0000-0000-000000000099', '${BOARDS.notice}',
                   '${USERS.member}', 'notice', 'body', 'published')`,
        );
      },
      async (c) => {
        await expect(
          c.query(
            insertComment(
              BOARDS.qna,
              USERS.serviceAccount,
              "c0000000-0000-0000-0000-000000000099",
            ),
          ),
        ).rejects.toThrow(/foreign key|violates/i);
      },
    );
  });

  it("답글 상한을 넘는 게시글 작성은 거부", async () => {
    await asUser(USERS.serviceAccount)((c) =>
      expectRlsDenied(c.query(insertPost(BOARDS.qna, USERS.serviceAccount))),
    );
  });

  it("INSERT-only 상한을 넘어 자기 댓글을 수정하지 못한다", async () => {
    const rowCount = await asUser(USERS.serviceAccount)(async (c) => {
      const inserted = await c.query(
        insertComment(BOARDS.qna, USERS.serviceAccount),
      );
      return c
        .query(
          `update public.comments set body='edited' where id='${inserted.rows[0].id}'`,
        )
        .then((r) => r.rowCount);
    });
    expect(rowCount).toBe(0);
  });

  it("status=disabled로 바뀌면 즉시 답글이 거부된다 (킬스위치, §3.7 R2)", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // 관리자 조치 모사: 서비스 계정 즉시 disable (privileged 컨텍스트)
      await client.query(
        `update public.service_accounts set status='disabled' where user_id='${USERS.serviceAccount}'`,
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.serviceAccount, role: "authenticated" }),
      ]);
      await expectRlsDenied(
        client.query(insertComment(BOARDS.qna, USERS.serviceAccount)),
      );
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  });
});

describe("공개 댓글 가시성 (§10.2)", () => {
  it("anon은 draft 글에 달린 댓글을 직접 ID로 조회해도 보지 못한다", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query(
        `insert into public.comments (post_id, board_id, author_id, body)
         values ('${POSTS.memberDraft}', '${BOARDS.qna}', '${USERS.member}', 'draft comment')
         returning id`,
      );
      await client.query("set local role anon");
      const result = await client.query(
        "select count(*)::int n from public.comments where id=$1",
        [inserted.rows[0].id],
      );
      expect(result.rows[0].n).toBe(0);
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  });
});
