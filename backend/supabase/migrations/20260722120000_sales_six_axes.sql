-- 회사 리뷰를 영업환경 6축으로 옮긴다.
--
-- ## 왜
--
-- DB 는 일반적인 회사 리뷰 4축으로 만들어져 있었다.
--
--     compensation · growth · culture · leadership
--
-- 그런데 화면과 포트폴리오는 **영업환경 6축**이다.
--
--     목표 현실성 · 인센티브 투명성 · 리드 품질
--     계정 배분 · 세일즈 툴 · 매니저 코칭
--
-- 화면이 정적 데이터 위에서 돌 때는 안 드러났다. DB 를 붙이는 순간
-- 리뷰 저장이 check 제약에서 막힌다.
--
--     new row violates check constraint "company_review_dimensions_valid"
--
-- 제품이 정본이다. DB 를 6축으로 옮긴다.
--
-- ## 키를 영어로 두는 이유
--
-- 화면 라벨은 한글이지만 저장 키는 영어로 둔다. jsonb 키를 SQL·인덱스·
-- 로그에서 계속 다루는데, 한글 키는 따옴표 없이 못 쓰고 도구마다 인코딩이
-- 엇갈린다. 라벨은 화면이 들고 있으면 된다.
--
-- ## 집계는 축 이름을 모르게 바꾼다
--
-- 기존 rebuild 함수는 4개 키를 하나씩 적어 뒀다. 축이 바뀔 때마다 함수를
-- 고쳐야 하고, 이번처럼 한 군데를 빠뜨리면 제약은 통과하는데 통계만 낡은
-- 축으로 남는다. 있는 키를 전부 평균 내도록 바꾼다.

set search_path = public, extensions;

-- ── 제약 ────────────────────────────────────────────────────────────
alter table public.company_reviews
  drop constraint if exists company_review_dimensions_valid;

-- 축을 하나씩 적는다. check 제약에는 서브쿼리를 못 쓴다(`cannot use subquery
-- in check constraint`). 어차피 필수 키 목록은 여기 있어야 하므로,
-- "축을 모르게" 만드는 건 집계 함수 쪽에서만 한다.
alter table public.company_reviews
  add constraint company_review_dimensions_valid check (
    jsonb_typeof(score_dimensions) = 'object'
    and score_dimensions ?& array[
      'quota_realism', 'incentive_transparency', 'lead_quality',
      'account_allocation', 'sales_tooling', 'manager_coaching'
    ]
    and (score_dimensions->>'quota_realism')::numeric between 1 and 5
    and (score_dimensions->>'incentive_transparency')::numeric between 1 and 5
    and (score_dimensions->>'lead_quality')::numeric between 1 and 5
    and (score_dimensions->>'account_allocation')::numeric between 1 and 5
    and (score_dimensions->>'sales_tooling')::numeric between 1 and 5
    and (score_dimensions->>'manager_coaching')::numeric between 1 and 5
  );

-- ── 집계 ────────────────────────────────────────────────────────────
create or replace function app_private.rebuild_company_review_stats(p_company_id uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.company_review_stats
    (company_id, review_count, overall_average, dimension_averages, updated_at)
  select p_company_id,
         count(*)::integer,
         round(avg(overall_score), 2),
         -- 있는 키를 전부 평균 낸다. 축 이름을 함수가 몰라도 된다.
         coalesce((
           select jsonb_object_agg(k, round(avg_v, 2))
             from (
               select kv.k, avg(kv.v::numeric) as avg_v
                 from public.company_reviews r2,
                      lateral jsonb_each_text(r2.score_dimensions) as kv(k, v)
                where r2.company_id = p_company_id
                  and r2.status = 'published'
                group by kv.k
             ) per_axis
         ), '{}'::jsonb),
         now()
    from public.company_reviews
   where company_id = p_company_id and status = 'published'
  on conflict (company_id) do update set
    review_count = excluded.review_count,
    overall_average = excluded.overall_average,
    dimension_averages = excluded.dimension_averages,
    updated_at = excluded.updated_at;
$function$;

-- ── 리뷰 생성 시 종합 점수 ──────────────────────────────────────────
-- 기존 함수는 4개 키를 더해 4로 나눴다. 6축이 되면 값이 틀린다.
-- 들어온 축 전부의 평균으로 바꾼다.
create or replace function app_private.review_overall_from_dimensions(p_dimensions jsonb)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select round(avg(v::numeric), 2)
    from jsonb_each_text(p_dimensions) as kv(k, v);
$function$;

comment on function app_private.review_overall_from_dimensions(jsonb) is
  '리뷰의 종합 점수 = 축 점수의 평균. 축 개수를 함수가 모른다.';

-- create_company_review 안에도 같은 계산이 박혀 있다.
--
--     v_score := round(((p_score_dimensions->>'compensation')::numeric
--       + ... ) / 4.0, 1);
--
-- 6축을 넣으면 4로 나눠서 점수가 틀어진다. 오류가 안 나서 더 나쁘다 -
-- 리뷰는 저장되고 평점만 조용히 낮게 찍힌다. 위 헬퍼를 부르게 바꾼다.
create or replace function app_private.create_company_review(
  p_company_id uuid, p_title text, p_body text,
  p_employment_status public.employment_status, p_score_dimensions jsonb,
  -- 기본값까지 원본과 같아야 한다. 빼면 `cannot remove parameter defaults
  -- from existing function` 으로 막히고, drop 하면 public 래퍼가 같이 깨진다.
  p_idempotency_key text, p_trace_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := app_private.current_user_id();
  v_review_id uuid;
  v_existing uuid;
  v_score numeric(2,1);
begin
  if v_user_id is null or not app_private.current_account_active() or app_private.is_service_account() then
    raise exception using errcode = '42501', message = 'active member required';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '22023', message = 'idempotency key required';
  end if;
  select review_id into v_existing from app_private.company_review_authors
    where user_id = v_user_id and create_idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return jsonb_build_object('reviewId', v_existing, 'created', false);
  end if;
  if not exists (select 1 from public.companies where id = p_company_id and is_active) then
    raise exception using errcode = '22023', message = 'active company required';
  end if;

  v_score := app_private.review_overall_from_dimensions(p_score_dimensions);

  insert into public.company_reviews
    (company_id, title, body, employment_status, overall_score, score_dimensions)
  values (p_company_id, trim(p_title), trim(p_body), p_employment_status, v_score, p_score_dimensions)
  returning id into v_review_id;
  insert into app_private.company_review_authors
    (review_id, company_id, user_id, create_idempotency_key)
  values (v_review_id, p_company_id, v_user_id, p_idempotency_key);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted)
  values (p_trace_id, 'user', v_user_id, 'company_review.create', 'company_review',
    v_review_id, 'success', jsonb_build_object('companyId', p_company_id, 'overallScore', v_score));
  insert into public.outbox_events (type, trace_id, actor, subject, data)
  values ('CompanyReviewCreated', p_trace_id, jsonb_build_object('type', 'user', 'id', v_user_id),
    jsonb_build_object('type', 'company_review', 'id', v_review_id),
    jsonb_build_object('companyId', p_company_id, 'overallScore', v_score));
  return jsonb_build_object('reviewId', v_review_id, 'created', true);
exception when unique_violation then
  raise exception using errcode = '23505', message = 'one review per member and company';
end;
$function$;
