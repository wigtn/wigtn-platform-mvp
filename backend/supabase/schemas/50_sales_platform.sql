-- Sales community project domains. Reusable infrastructure lives in earlier
-- WIGTN core migrations; this file contains only project-specific behavior.

create type public.company_source as enum ('manual', 'csv_import', 'crawler');
create type public.company_review_status as enum ('published', 'hidden', 'deleted');
create type public.employment_status as enum ('current', 'former');
create type public.import_job_status as enum ('pending', 'validated', 'completed', 'failed');
create type public.placement_status as enum ('draft', 'scheduled', 'published', 'archived');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  normalized_name text not null unique,
  aliases text[] not null default '{}',
  industry text,
  sales_type text,
  website text,
  source public.company_source not null default 'manual',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_name_trgm_idx on public.companies using gin (name extensions.gin_trgm_ops);
create index companies_aliases_gin_idx on public.companies using gin (aliases);

-- Public review payload deliberately has no author/user column. Identity lives
-- in app_private.company_review_authors and is never exposed by PostgREST.
create table public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 100),
  body text not null check (char_length(trim(body)) between 20 and 5000),
  employment_status public.employment_status not null,
  overall_score numeric(2,1) not null check (overall_score between 1 and 5),
  score_dimensions jsonb not null,
  status public.company_review_status not null default 'published',
  verification_level text not null default 'self_declared'
    check (verification_level in ('self_declared', 'document_verified')),
  moderation_reason text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 영업환경 6축. 일반적인 회사 리뷰 4축(compensation·growth·culture·
  -- leadership)이었는데, 화면과 포트폴리오가 내세우는 축과 달랐다.
  -- 20260722120000_sales_six_axes.sql 과 같은 목록이어야 한다.
  constraint company_review_dimensions_valid check (
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
  )
);
create index company_reviews_company_published_idx
  on public.company_reviews (company_id, published_at desc, id desc)
  where status = 'published';
create index company_reviews_status_idx on public.company_reviews (status, created_at desc);

create table app_private.company_review_authors (
  review_id uuid primary key references public.company_reviews(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  create_idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (user_id, create_idempotency_key)
);
create index company_review_authors_user_idx on app_private.company_review_authors (user_id, created_at desc);

create table public.company_review_stats (
  company_id uuid primary key references public.companies(id) on delete cascade,
  review_count integer not null default 0 check (review_count >= 0),
  overall_average numeric(3,2),
  dimension_averages jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.company_import_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  status public.import_job_status not null default 'pending',
  dry_run boolean not null default true,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  error_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (requested_by, idempotency_key),
  unique (requested_by, source_sha256, dry_run)
);
create index company_import_jobs_status_idx on public.company_import_jobs (status, created_at desc);
create index company_import_jobs_requested_by_idx on public.company_import_jobs (requested_by, created_at desc);

create table app_private.company_import_rows (
  job_id uuid not null references public.company_import_jobs(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb,
  errors jsonb not null default '[]'::jsonb,
  primary key (job_id, row_number)
);

create table public.content_placements (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null check (slot_key ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  entity_type text not null check (entity_type in ('post', 'company', 'review', 'external')),
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  status public.placement_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index content_placements_public_idx
  on public.content_placements (slot_key, position, starts_at, ends_at)
  where status in ('scheduled', 'published');

alter table public.companies enable row level security;
alter table public.company_reviews enable row level security;
alter table public.company_review_stats enable row level security;
alter table public.company_import_jobs enable row level security;
alter table public.content_placements enable row level security;

revoke all on table
  public.companies,
  public.company_reviews,
  public.company_review_stats,
  public.company_import_jobs,
  public.content_placements
from anon, authenticated;
revoke all on table app_private.company_review_authors, app_private.company_import_rows
from public, anon, authenticated, app_authenticator;

grant select on public.companies, public.company_reviews, public.company_review_stats,
  public.content_placements to anon, authenticated;
grant select on public.company_import_jobs to authenticated;
grant all on public.companies, public.company_reviews, public.company_review_stats,
  public.company_import_jobs, public.content_placements to service_role;

create policy companies_public_read on public.companies for select to anon, authenticated
  using (is_active or app_private.has_permission('company.manage'));
create policy company_reviews_public_read on public.company_reviews for select to anon, authenticated
  using (status = 'published' or app_private.has_permission('review.moderate'));
create policy company_review_stats_public_read on public.company_review_stats for select to anon, authenticated
  using (true);
create policy company_import_jobs_admin_read on public.company_import_jobs for select to authenticated
  using (app_private.has_permission('company.import'));
create policy placements_public_read on public.content_placements for select to anon, authenticated
  using (
    (status in ('scheduled', 'published') and coalesce(starts_at, '-infinity') <= now()
      and coalesce(ends_at, 'infinity') > now())
    or app_private.has_permission('placement.manage')
  );

create or replace function app_private.normalize_company_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(p_name), '[^[:alnum:]가-힣]+', '', 'g'));
$$;

create or replace function app_private.rebuild_company_review_stats(p_company_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.company_review_stats
    (company_id, review_count, overall_average, dimension_averages, updated_at)
  select p_company_id,
         count(*)::integer,
         round(avg(overall_score), 2),
         -- 축 이름을 함수가 모르게 둔다. 축이 늘거나 바뀔 때마다 여기를
         -- 고쳐야 하면, 한 군데를 빠뜨렸을 때 제약은 통과하는데 통계만
         -- 낡은 축으로 남는다.
         coalesce((
           select jsonb_object_agg(k, round(avg_v, 2))
             from (
               select kv.k, avg(kv.v::numeric) as avg_v
                 from public.company_reviews r2,
                      lateral jsonb_each_text(r2.score_dimensions) as kv(k, v)
                where r2.company_id = p_company_id and r2.status = 'published'
                group by kv.k
             ) per_axis
         ), '{}'::jsonb), now()
  from public.company_reviews
  where company_id = p_company_id and status = 'published'
  on conflict (company_id) do update set
    review_count = excluded.review_count,
    overall_average = excluded.overall_average,
    dimension_averages = excluded.dimension_averages,
    updated_at = excluded.updated_at;
$$;

create or replace function app_private.refresh_review_stats_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rebuild_company_review_stats(coalesce(new.company_id, old.company_id));
  if tg_op = 'UPDATE' and new.company_id <> old.company_id then
    perform app_private.rebuild_company_review_stats(old.company_id);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger company_review_stats_refresh
after insert or update or delete on public.company_reviews
for each row execute function app_private.refresh_review_stats_trigger();

create or replace function app_private.create_company_review(
  p_company_id uuid, p_title text, p_body text,
  p_employment_status public.employment_status, p_score_dimensions jsonb,
  p_idempotency_key text, p_trace_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  -- 들어온 축 전부의 평균. 4로 나누던 식이 남아 있으면 6축에서 평점이
  -- 조용히 낮게 찍힌다 - 오류가 안 나서 더 나쁘다.
  select round(avg(v::numeric), 1) into v_score
    from jsonb_each_text(p_score_dimensions) as kv(k, v);
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
$$;

create or replace function public.create_company_review(
  p_company_id uuid, p_title text, p_body text,
  p_employment_status public.employment_status, p_score_dimensions jsonb,
  p_idempotency_key text, p_trace_id text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.create_company_review(p_company_id, p_title, p_body,
    p_employment_status, p_score_dimensions, p_idempotency_key, p_trace_id);
$$;

create or replace function app_private.moderate_company_review(
  p_review_id uuid, p_action text, p_reason text, p_idempotency_key text, p_trace_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_private.current_user_id(); v_status public.company_review_status; v_response jsonb;
begin
  perform app_private.assert_admin_tool_access('review.moderate', true);
  if p_action not in ('hide', 'restore', 'delete') or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'valid action and reason required';
  end if;
  select response into v_response from app_private.admin_command_receipts
    where actor_id = v_actor and tool_name = 'company.review.moderate' and idempotency_key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  v_status := (case p_action when 'hide' then 'hidden' when 'restore' then 'published' else 'deleted' end)::public.company_review_status;
  update public.company_reviews set status = v_status, moderation_reason = trim(p_reason), updated_at = now()
    where id = p_review_id;
  if not found then raise exception using errcode = 'P0002', message = 'review not found'; end if;
  v_response := jsonb_build_object('reviewId', p_review_id, 'status', v_status);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, reason_code, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor, 'company_review.' || p_action, 'company_review', p_review_id,
    'success', left(trim(p_reason), 120), v_response, 'company.review.moderate', 1);
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
    values (v_actor, 'company.review.moderate', p_idempotency_key, p_review_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.import_companies(
  p_source_filename text, p_source_sha256 text, p_rows jsonb,
  p_dry_run boolean, p_idempotency_key text, p_trace_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app_private.current_user_id(); v_job_id uuid := gen_random_uuid();
  v_row jsonb; v_index integer := 0; v_valid integer := 0; v_errors integer := 0;
  v_name text; v_slug text; v_normalized text; v_response jsonb;
begin
  perform app_private.assert_admin_tool_access('company.import', true);
  select response into v_response from app_private.admin_command_receipts
    where actor_id = v_actor and tool_name = 'company.import' and idempotency_key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception using errcode = '22023', message = 'rows must be an array of at most 5000 items';
  end if;
  insert into public.company_import_jobs
    (id, requested_by, source_filename, source_sha256, dry_run, idempotency_key, row_count)
  values (v_job_id, v_actor, left(p_source_filename, 255), lower(p_source_sha256), p_dry_run,
    p_idempotency_key, jsonb_array_length(p_rows));
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1; v_name := trim(v_row->>'name'); v_slug := lower(trim(v_row->>'slug'));
    v_normalized := app_private.normalize_company_name(v_name);
    if length(v_name) = 0 or v_slug !~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$' or length(v_normalized) = 0 then
      v_errors := v_errors + 1;
      insert into app_private.company_import_rows (job_id, row_number, raw_data, errors)
        values (v_job_id, v_index, v_row, '["invalid name or slug"]'::jsonb);
    else
      v_valid := v_valid + 1;
      insert into app_private.company_import_rows (job_id, row_number, raw_data, normalized_data)
        values (v_job_id, v_index, v_row, jsonb_build_object('name', v_name, 'slug', v_slug, 'normalizedName', v_normalized));
      if not p_dry_run then
        insert into public.companies (name, slug, normalized_name, industry, website, source)
        values (v_name, v_slug, v_normalized, nullif(trim(v_row->>'industry'), ''),
          nullif(trim(v_row->>'website'), ''), 'csv_import')
        on conflict (normalized_name) do update set
          aliases = case when excluded.name = public.companies.name then public.companies.aliases
            else array(select distinct x from unnest(public.companies.aliases || excluded.name) x) end,
          industry = coalesce(excluded.industry, public.companies.industry),
          website = coalesce(excluded.website, public.companies.website), updated_at = now();
      end if;
    end if;
  end loop;
  update public.company_import_jobs set status = (case when v_errors > 0 then 'validated' else 'completed' end)::public.import_job_status,
    valid_count = v_valid, error_count = v_errors,
    result = jsonb_build_object('validCount', v_valid, 'errorCount', v_errors, 'dryRun', p_dry_run), completed_at = now()
    where id = v_job_id;
  v_response := jsonb_build_object('jobId', v_job_id, 'validCount', v_valid, 'errorCount', v_errors, 'dryRun', p_dry_run);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor, 'company.import', 'company_import_job', v_job_id,
    'success', v_response, 'company.import', 1);
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
    values (v_actor, 'company.import', p_idempotency_key, v_job_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.publish_content_placement(
  p_placement_id uuid, p_expected_version integer, p_idempotency_key text, p_trace_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_private.current_user_id(); v_response jsonb; v_version integer;
begin
  perform app_private.assert_admin_tool_access('placement.manage', true);
  select response into v_response from app_private.admin_command_receipts
    where actor_id = v_actor and tool_name = 'content.placement.publish' and idempotency_key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  update public.content_placements set status = (case when starts_at > now() then 'scheduled' else 'published' end)::public.placement_status,
    version = version + 1, updated_by = v_actor, updated_at = now()
    where id = p_placement_id and version = p_expected_version returning version into v_version;
  if v_version is null then raise exception using errcode = '40001', message = 'placement version conflict'; end if;
  v_response := jsonb_build_object('placementId', p_placement_id, 'version', v_version);
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor, 'content_placement.publish', 'content_placement', p_placement_id,
    'success', v_response, 'content.placement.publish', 1);
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
    values (v_actor, 'content.placement.publish', p_idempotency_key, p_placement_id, v_response);
  return v_response;
end;
$$;

create or replace function app_private.upsert_content_placement(
  p_id uuid, p_slot_key text, p_entity_type text, p_entity_id uuid, p_payload jsonb,
  p_position integer, p_starts_at timestamptz, p_ends_at timestamptz,
  p_expected_version integer, p_idempotency_key text, p_trace_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app_private.current_user_id(); v_id uuid := coalesce(p_id, gen_random_uuid()); v_version integer; v_response jsonb;
begin
  perform app_private.assert_admin_tool_access('placement.manage', false);
  select response into v_response from app_private.admin_command_receipts
    where actor_id = v_actor and tool_name = 'content.placement.upsert' and idempotency_key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  if p_slot_key !~ '^[a-z][a-z0-9_.-]{1,63}$' or p_entity_type not in ('post','company','review','external')
     or (p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at) then
    raise exception using errcode = '22023', message = 'invalid placement input';
  end if;
  if p_id is null then
    insert into public.content_placements
      (id, slot_key, entity_type, entity_id, payload, position, starts_at, ends_at, created_by, updated_by)
    values (v_id, p_slot_key, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
      greatest(p_position, 0), p_starts_at, p_ends_at, v_actor, v_actor)
    returning version into v_version;
  else
    update public.content_placements set slot_key=p_slot_key, entity_type=p_entity_type,
      entity_id=p_entity_id, payload=coalesce(p_payload, '{}'::jsonb), position=greatest(p_position, 0),
      starts_at=p_starts_at, ends_at=p_ends_at, version=version+1, updated_by=v_actor, updated_at=now()
    where id=p_id and version=p_expected_version and status in ('draft','scheduled') returning version into v_version;
    if v_version is null then raise exception using errcode = '40001', message = 'placement version conflict'; end if;
  end if;
  v_response := jsonb_build_object('placementId', v_id, 'version', v_version, 'status', 'draft');
  insert into public.audit_events
    (trace_id, actor_type, actor_id, action, resource_type, resource_id, outcome, after_redacted, tool_id, tool_version)
  values (p_trace_id, 'user', v_actor, 'content_placement.upsert', 'content_placement', v_id,
    'success', v_response, 'content.placement.upsert', 1);
  insert into app_private.admin_command_receipts (actor_id, tool_name, idempotency_key, resource_id, response)
    values (v_actor, 'content.placement.upsert', p_idempotency_key, v_id, v_response);
  return v_response;
end;
$$;

revoke all on function
  app_private.normalize_company_name(text),
  app_private.rebuild_company_review_stats(uuid),
  app_private.refresh_review_stats_trigger(),
  app_private.create_company_review(uuid,text,text,public.employment_status,jsonb,text,text),
  app_private.moderate_company_review(uuid,text,text,text,text),
  app_private.import_companies(text,text,jsonb,boolean,text,text),
  app_private.upsert_content_placement(uuid,text,text,uuid,jsonb,integer,timestamptz,timestamptz,integer,text,text),
  app_private.publish_content_placement(uuid,integer,text,text)
from public, anon, authenticated;
revoke all on function public.create_company_review(uuid,text,text,public.employment_status,jsonb,text,text) from public;
grant usage on schema app_private to authenticated, app_authenticator;
grant execute on function app_private.create_company_review(uuid,text,text,public.employment_status,jsonb,text,text) to authenticated;
grant execute on function public.create_company_review(uuid,text,text,public.employment_status,jsonb,text,text) to authenticated;
grant execute on function app_private.moderate_company_review(uuid,text,text,text,text),
  app_private.import_companies(text,text,jsonb,boolean,text,text),
  app_private.upsert_content_placement(uuid,text,text,uuid,jsonb,integer,timestamptz,timestamptz,integer,text,text),
  app_private.publish_content_placement(uuid,integer,text,text) to app_authenticator;

insert into public.permissions (key, description) values
  ('company.manage', '회사 정보 관리'),
  ('company.import', '회사 일괄 등록'),
  ('review.moderate', '회사 리뷰 모더레이션'),
  ('placement.manage', '메인 콘텐츠 배치 관리')
on conflict (key) do update set description = excluded.description;

create policy company_imports_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'company-imports' and app_private.has_permission('company.import'));
create policy company_imports_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'company-imports' and (storage.foldername(name))[1] = app_private.current_user_id()::text
    and app_private.has_permission('company.import'));
create policy company_imports_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'company-imports' and owner_id = app_private.current_user_id()::text
    and app_private.has_permission('company.import'))
  with check (bucket_id = 'company-imports' and (storage.foldername(name))[1] = app_private.current_user_id()::text
    and app_private.has_permission('company.import'));
create policy company_imports_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'company-imports' and owner_id = app_private.current_user_id()::text
    and app_private.has_permission('company.import'));
