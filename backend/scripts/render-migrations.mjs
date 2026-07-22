#!/usr/bin/env node
/**
 * 마이그레이션을 프로젝트별 스키마로 치환해 찍어낸다.
 *
 * ## 왜 필요한가
 *
 * 마이그레이션이 `public.` / `app_private.` 로 박혀 있다. 전용 Supabase
 * 프로젝트라면 그대로 써도 되는데, 우리는 **공용 스테이징에 얹는다.**
 * 거기엔 이미 다른 프로젝트가 산다.
 *
 *     stg_demo · stg_demo_private   (web-agency 데모)
 *     app_private                   (접두사 없던 시절의 잔재)
 *     app_authenticator · outbox_worker
 *     post-attachments · grade-evidence · badge-evidence  (버킷)
 *
 * 그대로 적용하면 이름이 겹치는 것들을 **조용히 덮어쓴다.** 스키마와 역할은
 * 갈라 놓으면 되지만, `storage` 는 프로젝트가 공유한다 - 정책 이름이 같으면
 * 두 번째 적용이 죽고, 버킷 id 가 같으면 오류 없이 파일이 섞인다.
 *
 * ## 무엇을 바꾸고 무엇을 안 바꾸는가
 *
 * 바꾼다   public. → 앱 스키마 / app_private. → 앱 비공개 스키마
 *          app_authenticator·outbox_worker → 프로젝트별 역할
 *          storage 정책 이름·버킷 id → 접두사
 *
 * 안 바꾼다 auth. storage. extensions.   Supabase 가 소유한 스키마
 *          anon authenticated service_role  Supabase 내장 역할.
 *                                        객체별 grant 라 겹쳐도 된다
 *
 * `\bpublic\.` 처럼 점을 포함해 잡는다. `to public;`(PUBLIC 역할)이나
 * `graphql_public` 을 건드리면 안 되기 때문이다.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "supabase", "migrations");
const OUT = join(HERE, "..", "supabase", "migrations.rendered");

const APP_SCHEMA = process.env.APP_SCHEMA ?? "public";
const APP_PRIVATE_SCHEMA = process.env.APP_PRIVATE_SCHEMA ?? "app_private";
const APP_ROLE = process.env.APP_ROLE ?? "app_authenticator";
const OUTBOX_ROLE = process.env.OUTBOX_ROLE ?? "outbox_worker";
// 전용 프로젝트(스키마 public)면 접두사가 없어야 한다. 충돌 상대가 없는데
// 이름을 바꾸면 이미 배포된 곳이 기존 객체와 어긋난다.
const OBJ_PREFIX = APP_SCHEMA === "public" ? "" : `${APP_SCHEMA}_`;

if (APP_ROLE === OUTBOX_ROLE) {
  throw new Error(
    `앱 역할과 outbox 역할이 같다(${APP_ROLE}). 권한을 갈라 놓은 의미가 없다.`,
  );
}
if (APP_SCHEMA !== "public" && APP_SCHEMA === APP_PRIVATE_SCHEMA) {
  throw new Error(
    `공개 스키마와 비공개 스키마가 같다(${APP_SCHEMA}). RLS 우회 함수가 노출된다.`,
  );
}

/**
 * auth·storage 는 Supabase 프로젝트에 하나뿐이라 **프로젝트끼리 공유**한다.
 * 거기 만드는 이름이 고정이면 두 번째 프로젝트가 못 올라간다.
 *
 *     ERROR: trigger "on_auth_user_created" for relation "users" already exists
 *
 * 버킷은 더 조용하다. 오류 없이 두 프로젝트가 같은 버킷을 쓰고 파일이 섞인다.
 *
 * ## 이름을 찾는 게 생각보다 까다로웠다
 *
 * 처음엔 `create policy NAME on storage.` 한 줄로 잡았다. 실제 파일은 이렇게
 * 생겼다.
 *
 *     create policy "grade_evidence_insert_owner"
 *     on "storage"."objects"          ← 줄바꿈 + 따옴표 붙은 스키마명
 *
 *     CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
 *                                        ← 대문자 + 중간에 타이밍 절
 *
 * 그래서 13개 중 4개만 걸렸고, 나머지 9개와 트리거는 그대로 나갔다.
 * 대소문자를 무시하고, 이름과 `on` 사이에 무엇이 끼어도 되게 하되
 * **세미콜론은 못 넘게** 한다 - 문장 경계를 넘어가면 엉뚱한 걸 잡는다.
 */
function prefixSharedObjects(sql) {
  return sql
    .replace(
      /(\b(?:create|drop)\s+(?:policy|trigger)\s+(?:if\s+(?:not\s+)?exists\s+)?)(?:"([^"]+)"|([A-Za-z0-9_]+))([^;]{0,80}?\bon\s+"?(?:auth|storage)"?\s*\.)/gi,
      (_m, head, quoted, bare, tail) =>
        quoted === undefined
          ? `${head}${OBJ_PREFIX}${bare}${tail}`
          : `${head}"${OBJ_PREFIX}${quoted}"${tail}`,
    )
    .replace(
      /\bbucket_id\s*=\s*'([a-z0-9-]+)'/gi,
      (_m, id) => `bucket_id = '${OBJ_PREFIX}${id}'`,
    );
}

function render(sql) {
  let out = sql;
  // 비공개 스키마를 **먼저** 바꾼다. 뒤로 미루면 public 규칙이 이미 만들어
  // 놓은 이름을 다시 건드릴 수 있다.
  out = out.replace(/\bapp_private\./g, `${APP_PRIVATE_SCHEMA}.`);
  out = out.replace(/"app_private"/g, `"${APP_PRIVATE_SCHEMA}"`);
  out = out.replace(/\bpublic\./g, `${APP_SCHEMA}.`);
  out = out.replace(/"public"/g, `"${APP_SCHEMA}"`);
  // 점 없이 쓰인 자리. `grant usage on schema public to ...` 처럼 위 규칙에
  // 안 걸린다.
  //
  // 처음엔 빠뜨렸다. 그 결과가 조용해서 위험했다 - 오류 없이
  //
  //     grant usage on schema public to stg_fieldnote_app;
  //     grant usage on schema app_private to stg_fieldnote_app;
  //
  // 가 나갔다. 진짜 public 과, 접두사 없던 시절의 잔재 app_private 을
  // 새 프로젝트 역할에 열어 주는 문장이다. 격리하려고 이 스크립트를
  // 쓰는데 정확히 그 반대가 된다.
  out = out.replace(
    /(\bschema\s+)("?)(app_private)\2/gi,
    (_m, head, quote) => `${head}${quote}${APP_PRIVATE_SCHEMA}${quote}`,
  );
  out = out.replace(
    /(\bschema\s+)("?)(public)\2/gi,
    (_m, head, quote) => `${head}${quote}${APP_SCHEMA}${quote}`,
  );
  // `search_path = public, extensions` 같은 선언. 점이 없어서 위 규칙에
  // 안 걸린다.
  out = out.replace(
    /(search_path\s*(?:=|TO)\s*)public\b/gi,
    (_m, head) => `${head}${APP_SCHEMA}`,
  );
  out = out.replace(/\bapp_authenticator\b/g, APP_ROLE);
  out = out.replace(/\boutbox_worker\b/g, OUTBOX_ROLE);
  out = prefixSharedObjects(out);
  return out;
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) throw new Error(`마이그레이션이 없다: ${SRC}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let changed = 0;
for (const name of files) {
  const src = readFileSync(join(SRC, name), "utf8");
  const out = render(src);
  if (out !== src) changed += 1;
  writeFileSync(join(OUT, name), out, "utf8");
}

// 자리표시자가 남으면 적용 단계에서 문법 오류로 죽는다. 여기서 잡는 게 낫다.
//
// 점 있는 형태만 보다가 `grant usage on schema public` 을 놓친 적이 있다.
// 검사도 같이 넓힌다 - 검사가 좁으면 스크립트를 고쳐도 다음에 또 샌다.
// 주석은 뺀다(파일명이 적혀 있다).
const FORBIDDEN = /\bapp_private[. ]|\bpublic\.|\bschema\s+"?public"?\b/;
const leftovers = readdirSync(OUT)
  .map((n) => [n, readFileSync(join(OUT, n), "utf8")])
  .filter(([, s]) => {
    if (APP_SCHEMA === "public") return false;
    const code = s
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    return FORBIDDEN.test(code);
  })
  .map(([n]) => n);
if (leftovers.length) {
  throw new Error(`치환이 덜 됐다: ${leftovers.join(", ")}`);
}

console.log(
  [
    `스키마     ${APP_SCHEMA} / ${APP_PRIVATE_SCHEMA}`,
    `역할       ${APP_ROLE} / ${OUTBOX_ROLE}`,
    `객체 접두사 ${OBJ_PREFIX || "(없음)"}`,
    `파일       ${files.length}개 중 ${changed}개 치환 → ${OUT}`,
  ].join("\n"),
);
