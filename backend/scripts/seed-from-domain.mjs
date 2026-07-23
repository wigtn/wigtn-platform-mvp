#!/usr/bin/env node
/**
 * 화면이 쓰던 정적 데이터를 그대로 DB 시드 SQL 로 찍어낸다.
 *
 * ## 왜 손으로 안 쓰나
 *
 * `lib/domain.ts` 가 지금 화면의 유일한 데이터 출처다. 이걸 손으로 SQL 에
 * 옮기면 두 벌이 되고, 옮기는 동안 오타가 난다. 무엇보다 **DB 를 붙인 뒤에
 * 화면이 지금과 똑같이 보이는지**가 이 작업의 합격 기준이라, 출처가
 * 달라지면 비교가 안 된다.
 *
 * 그래서 그 파일을 그대로 읽어 SQL 을 만든다. Node 22+ 는 타입을 벗겨
 * .ts 를 바로 import 한다.
 *
 * ## 사람 계정
 *
 * 글·리뷰에 작성자가 필요하다. `auth.users` 에 넣으면 트리거가 profiles 를
 * 자동으로 만든다(handle_auth_user_created). 그 다음 표시 이름을 채운다.
 *
 * 리뷰 작성자는 **공개 테이블에 안 들어간다.** company_reviews 에는 작성자
 * 컬럼이 아예 없고, 신원은 app_private.company_review_authors 로 갈라져
 * 있다 - 화면의 "작성자 정보 분리 보관" 정책이 스키마로 구현된 것이다.
 * 시드도 그 구조를 따른다.
 *
 * 전부 합성 데이터다. 실제 인물·회사가 아니다.
 */

import { createHash } from "node:crypto";

const { companies, initialReviews, initialPosts } =
  await import("../../lib/domain.ts");

/** 같은 이름은 항상 같은 UUID 가 되게. 다시 돌려도 행이 안 늘어난다. */
function uuidFor(kind, key) {
  const h = createHash("sha1").update(`fieldnote:${kind}:${key}`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      h.slice(18, 20),
    h.slice(20, 32),
  ].join("-");
}

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`;

/**
 * 화면 라벨(한글) → 저장 키(영어).
 *
 * jsonb 키를 SQL·인덱스·로그에서 계속 다루는데 한글 키는 따옴표 없이 못 쓰고
 * 도구마다 인코딩이 엇갈린다. 라벨은 화면이 들고 있으면 된다.
 * 20260722120000_sales_six_axes.sql 의 check 제약과 같은 목록이어야 한다.
 */
const AXIS_KEY = {
  "목표 현실성": "quota_realism",
  "인센티브 투명성": "incentive_transparency",
  "리드 품질": "lead_quality",
  "계정 배분": "account_allocation",
  "세일즈 툴": "sales_tooling",
  "매니저 코칭": "manager_coaching",
};
const DIMENSIONS = Object.keys(AXIS_KEY);

// 게시판 이름(화면) → slug(DB)
const BOARDS = [
  {
    label: "Q&A",
    slug: "qna",
    title: "Q&A",
    desc: "영업 실무 질문과 답변",
    pos: 10,
    ai: true,
  },
  {
    label: "노하우",
    slug: "howto",
    title: "노하우",
    desc: "검증된 방법을 정리해 공유합니다",
    pos: 20,
    ai: false,
  },
  {
    label: "실적",
    slug: "deals",
    title: "실적",
    desc: "성사된 거래와 그 과정",
    pos: 30,
    ai: false,
  },
  {
    label: "자유",
    slug: "free",
    title: "자유",
    desc: "커리어와 일상 이야기",
    pos: 40,
    ai: false,
  },
];
const CAPABILITIES =
  "array['posts','comments','reactions','bookmarks','reports']";

// 리뷰 작성자는 화면에 안 나온다(익명 리뷰). 그래도 행은 있어야 한다.
//
// **리뷰마다 다른 사람**이어야 한다. `company_review_authors` 에
// (company_id, user_id) 고유 제약이 걸려 있다 - 한 회사에 한 사람이 리뷰
// 하나. 처음엔 한 명으로 다 돌렸다가 노스스타 리뷰 2건에서 막혔다.
// 실제 서비스의 규칙이라 시드를 규칙에 맞추는 게 맞다.
/*
  정적 데이터의 리뷰는 6개 회사 중 3개만 덮는다. 그런데 화면은 회사 카드에
  6곳 모두 평점을 그린다 - 정적 배열이 리뷰와 무관하게 score 를 들고 있었기
  때문이다.

  DB 에서는 평점이 **리뷰에서 계산된다**(company_review_stats 트리거). 그래서
  리뷰가 없는 회사는 `0.0 / 리뷰 0` 으로 뜬다. 화면이 고장 난 것처럼 보인다.

  숫자를 회사 레코드에 따로 박아 넣는 건 거짓말이다 - 리뷰가 없는데 평점이
  있는 상태가 된다. 그래서 **없는 회사에는 리뷰를 만든다.** 회사의 6축 값을
  그대로 쓰므로 화면에 나오던 점수가 그대로 나온다.
*/
const SYNTHESIZED = companies
  .filter((c) => !initialReviews.some((r) => r.companySlug === c.slug))
  .map((c) => ({
    id: `auto-${c.slug}`,
    companySlug: c.slug,
    title: `${c.name} 영업환경 정리`,
    body: c.summary,
    score: c.score,
    dimensions: c.scores,
    status: "published",
    employment: "재직",
    verified: true,
  }));
const allReviews = [...initialReviews, ...SYNTHESIZED];

const REVIEW_AUTHORS = allReviews.map((r, i) => ({
  handle: `reviewer${i + 1}`,
  name: `리뷰 작성자 ${i + 1}`,
}));
const ADMIN = { handle: "admin", name: "운영 관리자" };

/*
  등급 배지는 글이 아니라 **사람**에 붙는다.

  정적 데이터에서는 `post.badge` 로 글마다 들고 있었지만, 같은 사람이 쓴
  글에는 같은 배지가 붙어야 한다. 글마다 따로 두면 한 사람의 배지가 글에
  따라 달라지는 상태가 만들어진다. 작성자별로 한 번만 정한다.
*/
const BADGE_BY_AUTHOR = new Map(
  initialPosts.filter((p) => p.badge).map((p) => [p.author, p.badge]),
);

const people = [...new Set(initialPosts.map((p) => p.author))].map((name) => ({
  handle: `u_${uuidFor("handle", name).slice(0, 8)}`,
  name,
  badge: BADGE_BY_AUTHOR.get(name) ?? null,
}));
const allPeople = [...people, ...REVIEW_AUTHORS, ADMIN];

const out = [];
const w = (s) => out.push(s);

w(
  `-- 생성물이다. 고치지 말고 backend/scripts/seed-from-domain.mjs 를 고칠 것.`,
);
w(`-- 출처: lib/domain.ts (화면이 쓰던 정적 데이터)`);
w(`-- 전부 합성 데이터. 실제 인물·회사가 아니다.`);
w(``);
w(`set search_path = stg_fieldnote, extensions;`);
w(``);

w(`-- ── 계정 ────────────────────────────────────────────────────────`);
w(`-- 토큰 컬럼을 빈 문자열로 채운다. GoTrue 가 non-null string 으로 스캔해서`);
w(`-- NULL 이면 로그인 경로가 "Database error querying schema" 로 죽는다.`);
w(
  `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,`,
);
w(`                        email_confirmed_at, created_at, updated_at,`);
w(`                        confirmation_token, recovery_token, email_change,`);
w(
  `                        email_change_token_new, email_change_token_current,`,
);
w(
  `                        phone_change, phone_change_token, reauthentication_token)`,
);
w(`values`);
w(
  allPeople
    .map(
      (p) =>
        `  (${q(uuidFor("user", p.handle))}, '00000000-0000-0000-0000-000000000000',` +
        ` 'authenticated', 'authenticated', ${q(`${p.handle}@fieldnote.demo`)},` +
        ` extensions.crypt('demo-only-password', extensions.gen_salt('bf')),` +
        ` now(), now(), now(), '', '', '', '', '', '', '', '')`,
    )
    .join(",\n"),
);
w(`on conflict (id) do nothing;`);
w(``);
w(`-- 프로필 행은 auth 트리거가 이미 만들었다. 표시 이름만 채운다.`);
w(
  `insert into stg_fieldnote.profiles (user_id, handle, display_name, account_status, badge) values`,
);
w(
  allPeople
    .map(
      (p) =>
        `  (${q(uuidFor("user", p.handle))}, ${q(p.handle)}, ${q(p.name)}, 'active',` +
        ` ${p.badge ? q(p.badge) : "null"})`,
    )
    .join(",\n"),
);
w(`on conflict (user_id) do update set`);
w(`  handle = excluded.handle,`);
w(`  display_name = excluded.display_name,`);
w(`  account_status = excluded.account_status,`);
w(`  badge = excluded.badge;`);
w(``);

w(`-- ── 회사 ────────────────────────────────────────────────────────`);
w(`insert into stg_fieldnote.companies`);
w(`  (id, slug, name, normalized_name, industry, sales_type, summary,`);
w(`   interest_trend, source, is_active) values`);
w(
  companies
    .map(
      (c) =>
        `  (${q(uuidFor("company", c.slug))}, ${q(c.slug)}, ${q(c.name)},` +
        ` stg_fieldnote_private.normalize_company_name(${q(c.name)}),` +
        ` ${q(c.industry)}, ${q(c.type)}, ${q(c.summary)}, ${c.trend}, 'manual', true)`,
    )
    .join(",\n"),
);
w(`on conflict (id) do update set`);
w(`  name = excluded.name, industry = excluded.industry,`);
w(`  sales_type = excluded.sales_type, summary = excluded.summary,`);
w(
  `  interest_trend = excluded.interest_trend, is_active = excluded.is_active;`,
);
w(``);

w(`-- ── 리뷰 ────────────────────────────────────────────────────────`);
w(`-- 6축 점수. 회사 카드의 평균은 company_review_stats 가 트리거로 다시`);
w(`-- 계산하므로 여기서 넣지 않는다.`);
w(`insert into stg_fieldnote.company_reviews`);
w(`  (id, company_id, title, body, employment_status, overall_score,`);
w(`   score_dimensions, status, verification_level, published_at) values`);
w(
  allReviews
    .map((r) => {
      const company = companies.find((c) => c.slug === r.companySlug);
      // 개별 축 점수가 없는 리뷰는 회사 평균을 쓴다. 화면이 축을 항상
      // 그리므로 비워 두면 빈칸이 생긴다.
      const dims = r.dimensions ?? company?.scores ?? {};
      const filled = Object.fromEntries(
        DIMENSIONS.map((label) => [AXIS_KEY[label], dims[label] ?? r.score]),
      );
      return (
        `  (${q(uuidFor("review", r.id))}, ${q(uuidFor("company", r.companySlug))},` +
        ` ${q(r.title)}, ${q(r.body)},` +
        ` ${q(r.employment === "재직" ? "current" : "former")}, ${r.score},` +
        ` ${jsonb(filled)}, ${q(r.status)},` +
        // verification_level 은 self_declared / document_verified 두 값만 받는다.
        // 화면의 "재직 확인" 배지가 곧 서류 검증이다.
        ` ${q(r.verified ? "document_verified" : "self_declared")},` +
        ` ${r.status === "published" ? "now()" : "null"})`
      );
    })
    .join(",\n"),
);
w(`on conflict (id) do update set`);
w(`  title = excluded.title, body = excluded.body,`);
w(`  overall_score = excluded.overall_score,`);
w(`  score_dimensions = excluded.score_dimensions,`);
w(`  status = excluded.status;`);
w(``);
w(
  `-- 작성자 신원은 비공개 스키마로 갈라 둔다(화면의 "작성자 정보 분리 보관").`,
);
w(`insert into stg_fieldnote_private.company_review_authors`);
w(`  (review_id, company_id, user_id, create_idempotency_key) values`);
w(
  allReviews
    .map(
      (r, i) =>
        `  (${q(uuidFor("review", r.id))}, ${q(uuidFor("company", r.companySlug))},` +
        ` ${q(uuidFor("user", REVIEW_AUTHORS[i].handle))}, ${q(`seed-review-${r.id}`)})`,
    )
    .join(",\n"),
);
w(`on conflict (review_id) do nothing;`);
w(``);

w(`-- ── 게시판 ──────────────────────────────────────────────────────`);
w(`insert into stg_fieldnote.boards`);
w(`  (id, slug, title, description, position, is_active, ai_reply_enabled,`);
w(`   capabilities, config, config_version) values`);
w(
  BOARDS.map(
    (b) =>
      `  (${q(uuidFor("board", b.slug))}, ${q(b.slug)}, ${q(b.title)}, ${q(b.desc)},` +
      ` ${b.pos}, true, ${b.ai}, ${CAPABILITIES},` +
      ` jsonb_build_object('listPageSize', 20, 'attachmentsEnabled', true), 1)`,
  ).join(",\n"),
);
w(`on conflict (id) do update set`);
w(`  title = excluded.title, description = excluded.description,`);
w(`  position = excluded.position, capabilities = excluded.capabilities;`);
w(``);

w(`-- ── 글 ──────────────────────────────────────────────────────────`);
w(`-- created_at 을 흩뿌린다. 전부 now() 면 "최신순"이 매번 다르게 나온다.`);
const boardBySlugLabel = Object.fromEntries(
  BOARDS.map((b) => [b.label, b.slug]),
);
w(`insert into stg_fieldnote.posts`);
w(
  `  (id, board_id, author_id, title, body, status, created_at, updated_at) values`,
);
w(
  initialPosts
    .map((p, i) => {
      const person = people.find((x) => x.name === p.author);
      return (
        `  (${q(uuidFor("post", p.id))}, ${q(uuidFor("board", boardBySlugLabel[p.board]))},` +
        ` ${q(uuidFor("user", person.handle))}, ${q(p.title)}, ${q(p.body)}, 'published',` +
        ` now() - interval '${(i + 1) * 7} hour', now() - interval '${(i + 1) * 7} hour')`
      );
    })
    .join(",\n"),
);
w(`on conflict (id) do update set`);
w(`  title = excluded.title, body = excluded.body, status = excluded.status;`);
w(``);
w(
  `insert into stg_fieldnote.post_contents (post_id, source, sanitized_html, format_version)`,
);
w(`select p.id,`);
w(`       jsonb_build_object('version', 1, 'blocks',`);
w(
  `         jsonb_build_array(jsonb_build_object('type','paragraph','text', p.body))),`,
);
w(`       '<p>' || p.body || '</p>', 1`);
w(`  from stg_fieldnote.posts p`);
w(
  ` where p.id in (${initialPosts.map((p) => q(uuidFor("post", p.id))).join(", ")})`,
);
w(`on conflict (post_id) do update set`);
w(`  source = excluded.source, sanitized_html = excluded.sanitized_html;`);
w(``);

w(`-- ── 답변 ────────────────────────────────────────────────────────`);
const comments = initialPosts.flatMap((p) =>
  p.comments.map((body, i) => ({
    post: p.id,
    board: boardBySlugLabel[p.board],
    body,
    i,
  })),
);
if (comments.length) {
  w(
    `insert into stg_fieldnote.comments (id, post_id, board_id, author_id, body, created_at) values`,
  );
  w(
    comments
      .map((c, n) => {
        // 답변자는 글쓴이와 다른 사람으로 돌린다.
        const person = people[(n + 1) % people.length];
        return (
          `  (${q(uuidFor("comment", `${c.post}:${c.i}`))}, ${q(uuidFor("post", c.post))},` +
          ` ${q(uuidFor("board", c.board))}, ${q(uuidFor("user", person.handle))},` +
          ` ${q(c.body)}, now() - interval '${n + 1} hour')`
        );
      })
      .join(",\n"),
  );
  w(`on conflict (id) do nothing;`);
  w(``);
}

w(`-- ── 도움됐어요 ──────────────────────────────────────────────────`);
w(`-- 화면은 likes 를 숫자 하나로 들고 있었는데 DB 는 누가 눌렀는지를 행으로`);
w(`-- 가진다. 시드 계정이 몇 명뿐이라 원래 숫자(42 등)를 그대로 못 만든다.`);
w(`-- 사람 수만큼만 넣고, 화면의 큰 숫자는 재현하지 않는다.`);
w(`insert into stg_fieldnote.reactions (post_id, user_id, type) values`);
w(
  initialPosts
    .flatMap((p) =>
      people
        .slice(
          0,
          Math.min(people.length, Math.max(1, Math.round(p.likes / 40))),
        )
        .map(
          (person) =>
            `  (${q(uuidFor("post", p.id))}, ${q(uuidFor("user", person.handle))}, 'like')`,
        ),
    )
    .join(",\n"),
);
w(`on conflict (post_id, user_id, type) do nothing;`);
w(``);

process.stdout.write(out.join("\n") + "\n");
