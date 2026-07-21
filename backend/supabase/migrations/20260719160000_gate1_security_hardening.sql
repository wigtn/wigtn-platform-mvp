-- Gate 1 review hardening: service-account board scope, comment integrity,
-- least-privilege table grants, and internal-worker function isolation.

-- Postgres can retain request.jwt.claims as an empty string for anon transactions.
-- Treat that as no subject instead of attempting an invalid JSON cast.
create or replace function app_private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

-- comments.board_id is a denormalized authorization input. It must match the target post.
alter table public.posts
  add constraint posts_id_board_unique unique (id, board_id);

alter table public.comments
  drop constraint comments_post_id_fkey,
  add constraint comments_post_board_fk
    foreign key (post_id, board_id)
    references public.posts (id, board_id)
    on delete cascade;

create or replace function app_private.service_account_can_access_board(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_accounts sa
    join public.service_account_boards sab on sab.service_account_id = sa.id
    where sa.user_id = app_private.current_user_id()
      and sa.status = 'active'
      and sab.board_id = target_board_id
  );
$$;

create or replace function app_private.service_account_can_reply(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.service_account_can_access_board(target_board_id)
    and exists (
      select 1 from public.service_accounts sa
      where sa.user_id = app_private.current_user_id()
        and sa.allowed_reply_create
    );
$$;

revoke all on function app_private.service_account_can_access_board(uuid) from public;
grant execute on function app_private.service_account_can_access_board(uuid) to anon, authenticated;

drop policy posts_select_anon on public.posts;
create policy posts_select_anon on public.posts
  for select to anon
  using (
    status = 'published'
    and exists (select 1 from public.boards b where b.id = board_id and b.is_active)
  );

drop policy posts_select_member on public.posts;
create policy posts_select_member on public.posts
  for select to authenticated
  using (
    (
      status = 'published'
      and exists (select 1 from public.boards b where b.id = board_id and b.is_active)
      and (
        not app_private.is_service_account()
        or app_private.service_account_can_access_board(board_id)
      )
    )
    or (
      not app_private.is_service_account()
      and (
        author_id = app_private.current_user_id()
        or app_private.has_permission('content.moderate')
      )
    )
  );

drop policy comments_select on public.comments;
create policy comments_select on public.comments
  for select to anon, authenticated
  using (
    (
      not is_deleted
      and exists (
        select 1
        from public.posts p
        join public.boards b on b.id = p.board_id
        where p.id = post_id
          and p.board_id = board_id
          and p.status = 'published'
          and b.is_active
      )
      and (
        not app_private.is_service_account()
        or app_private.service_account_can_access_board(board_id)
      )
    )
    or (
      not app_private.is_service_account()
      and (
        author_id = app_private.current_user_id()
        or app_private.has_permission('content.moderate')
      )
    )
  );

drop policy comments_insert_member on public.comments;
create policy comments_insert_member on public.comments
  for insert to authenticated
  with check (
    author_id = app_private.current_user_id()
    and exists (
      select 1
      from public.posts p
      join public.boards b on b.id = p.board_id
      where p.id = post_id
        and p.board_id = board_id
        and p.status = 'published'
        and b.is_active
    )
    and (
      (app_private.current_account_active() and not app_private.is_service_account())
      or app_private.service_account_can_reply(board_id)
    )
  );

drop policy comments_update_owner on public.comments;
create policy comments_update_owner on public.comments
  for update to authenticated
  using (
    (
      author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account()
    )
    or app_private.has_permission('content.moderate')
  )
  with check (
    (
      author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account()
    )
    or app_private.has_permission('content.moderate')
  );

drop policy if exists audit_append on public.audit_events;
drop policy if exists outbox_append on public.outbox_events;
drop policy if exists consumed_insert on public.consumed_events;

-- RLS does not apply to TRUNCATE. Remove Supabase default table privileges first,
-- then restore the explicit Data API allowlist.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.boards, public.posts, public.comments to anon;

grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant update (body, is_deleted) on public.comments to authenticated;
grant select on public.profiles to authenticated;
grant update (handle, display_name, updated_at) on public.profiles to authenticated;
grant select on
  public.boards,
  public.system_roles,
  public.permissions,
  public.role_permissions,
  public.user_roles,
  public.account_state_events,
  public.service_accounts,
  public.service_account_boards,
  public.audit_events
  to authenticated;
grant insert, update, delete on
  public.user_roles,
  public.service_accounts,
  public.service_account_boards,
  public.boards
  to authenticated;

-- The runtime login role may only assume anon/authenticated. Direct app_private grants
-- accidentally exposed claim/ack/fail worker primitives to application commands.
revoke all on schema app_private from app_authenticator;
revoke all on all functions in schema app_private from app_authenticator;
