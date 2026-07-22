"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * ## 스키마를 지정하는 이유
 *
 * 이 프로젝트는 공용 스테이징 Supabase 에 `stg_fieldnote` 스키마로 얹혀
 * 있다(같은 프로젝트에 다른 팀 데모도 산다). PostgREST 는 지정하지 않으면
 * `public` 을 본다 - 그러면 조회가 전부 빈손으로 돌아오거나 404 가 난다.
 *
 * ## 익명 세션
 *
 * 로그인 화면 없이 둘러보게 하되, 기능은 진짜로 돌린다. 방문자마다 익명
 * 계정을 만들고 `bootstrap_demo_experience` 로 격리된 데모 세션을 연다.
 *
 * 방문자가 쓴 것은 공용 테이블이 아니라 **본인만 보이는 액션 원장**에
 * 쌓인다(RLS 로 격리). 그래서 두 사람이 동시에 둘러봐도 서로의 글이 안
 * 섞이고, 공개된 시드 콘텐츠도 안 망가진다.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "public";

// 스키마 이름이 실행 시점에 정해진다(환경변수). 타입 쪽은 "public" 리터럴을
// 기대해서 그대로는 안 맞는다. 생성된 DB 타입이 없으니 행 타입은 느슨하게
// 두고, 대신 부르는 쪽(demo-store)에서 필요한 모양을 명시한다.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

let cached: Client | null = null;

/** 설정이 없으면 null. 부르는 쪽이 정적 데이터로 되돌아갈 수 있게 한다. */
export function getSupabase(): Client | null {
  if (!URL || !KEY) return null;
  if (!cached) {
    cached = createClient(URL, KEY, {
      db: { schema: SCHEMA },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 데모마다 세션이 갈리도록 저장 키에 스키마를 넣는다. 같은
        // 도메인에서 다른 스키마를 붙일 때 세션이 섞이면 원장이 엉킨다.
        storageKey: `fieldnote-${SCHEMA}-auth`,
      },
    }) as unknown as Client;
  }
  return cached;
}

export const supabaseConfigured = Boolean(URL && KEY);
