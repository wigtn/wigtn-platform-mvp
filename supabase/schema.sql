-- FIELDNOTE project-local company/review vertical slice draft.
-- auth/community/outbox primitives are migrated from the verified web-agency core.

create type public.review_status as enum ('published', 'hidden', 'disputed', 'deleted');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  industry text not null,
  sales_type text not null,
  summary text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  author_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 5 and 120),
  body text not null check (char_length(body) between 20 and 5000),
  score numeric(2,1) not null check (score between 1 and 5),
  score_dimensions jsonb not null default '{}'::jsonb,
  employment_status text not null check (employment_status in ('current', 'former')),
  status public.review_status not null default 'published',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, author_id)
);

-- Public aggregate never contains author identity.
create table public.company_review_stats (
  company_id uuid primary key references public.companies(id),
  visible_count integer not null default 0,
  average_score numeric(2,1),
  dimensions jsonb not null default '{}'::jsonb,
  rebuilt_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.company_reviews enable row level security;
alter table public.company_review_stats enable row level security;

create policy companies_public_read on public.companies for select to anon, authenticated using (is_active);
create policy review_public_read on public.company_reviews for select to anon, authenticated using (status = 'published');
create policy review_owner_insert on public.company_reviews for insert to authenticated with check (author_id = auth.uid());
create policy review_owner_update on public.company_reviews for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy stats_public_read on public.company_review_stats for select to anon, authenticated using (true);

revoke all on public.companies, public.company_reviews, public.company_review_stats from anon, authenticated;
grant select on public.companies, public.company_reviews, public.company_review_stats to anon;
grant select, insert, update on public.company_reviews to authenticated;
grant select on public.companies, public.company_review_stats to authenticated;

-- Moderator state transitions and aggregate rebuilds must be SECURITY DEFINER
-- commands with fixed search_path, permission checks, idempotency key, and audit event.
