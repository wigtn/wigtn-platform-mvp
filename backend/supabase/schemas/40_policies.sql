-- 40_policies.sql — RLS 정책 (PRD §10.2 권한 매트릭스)
-- 원칙:
--   · 모든 쓰기 predicate에 계정 active를 포함 → 정지 즉시 집행(§5.3).
--   · UPDATE는 USING + WITH CHECK 모두 정의(§5.6).
--   · 서비스 계정은 JWT가 아니라 service_accounts.status를 매번 조회(§10.2, §3.7).
--   · IDOR/BOLA: 소유는 author_id = current_user_id()로만 성립(§10.3).

-- ── profiles ────────────────────────────────────────────────────────
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);                                   -- 회원은 공개 프로필 조회 가능

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = app_private.current_user_id())
  with check (user_id = app_private.current_user_id());
-- 본인은 account_status를 스스로 못 바꾼다: 컬럼 레벨 GRANT로 강제한다(90_grants_roles.sql).
-- 상태 전이는 명시적 명령(SECURITY DEFINER 경로)으로만 수행한다(§4.2).

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (app_private.has_permission('member.manage'))
  with check (app_private.has_permission('member.manage'));

create policy auth_provider_links_owner_or_admin_read on public.auth_provider_links
  for select to authenticated
  using (user_id = app_private.current_user_id() or app_private.has_permission('member.manage'));

-- ── system_roles / permissions / role_permissions (읽기: 관리자, 쓰기: 관리자) ──
create policy roles_admin_read on public.system_roles
  for select to authenticated using (app_private.has_permission('member.manage'));
create policy permissions_admin_read on public.permissions
  for select to authenticated using (app_private.has_permission('member.manage'));
create policy role_permissions_admin_read on public.role_permissions
  for select to authenticated using (app_private.has_permission('member.manage'));

-- ── user_roles: 본인 조회 + 관리자 관리. 부여/회수는 민감 명령(§5.6 step-up은 앱 레벨) ──
create policy user_roles_select_self on public.user_roles
  for select to authenticated
  using (user_id = app_private.current_user_id() or app_private.has_permission('member.manage'));
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (app_private.has_permission('role.manage'))
  with check (app_private.has_permission('role.manage'));

-- ── 동의/등급: 공개 설정 + 본인 소유 + 승인 권한자 큐 ────────────────
create policy consent_documents_current_read on public.consent_documents
  for select to anon, authenticated
  using (published_at <= now() and (retired_at is null or retired_at > now()));

create policy user_consents_self_read on public.user_consents
  for select to authenticated
  using (user_id = app_private.current_user_id());

create policy membership_grades_active_read on public.membership_grades
  for select to anon, authenticated
  using (is_active or app_private.has_permission('grade.approve'));

create policy grade_applications_owner_or_reviewer_read on public.grade_applications
  for select to authenticated
  using (
    user_id = app_private.current_user_id()
    or app_private.has_permission('grade.approve')
  );

create policy grade_documents_owner_or_reviewer_read on public.grade_application_documents
  for select to authenticated
  using (
    owner_id = app_private.current_user_id()
    or app_private.has_permission('grade.approve')
  );

create policy user_membership_grades_read on public.user_membership_grades
  for select to authenticated
  using (
    user_id = app_private.current_user_id()
    or app_private.has_permission('grade.approve')
  );

create policy membership_badges_active_read on public.membership_badges
  for select to anon, authenticated
  using (is_active or app_private.has_permission('badge.approve'));

create policy badge_applications_owner_or_reviewer_read on public.badge_applications
  for select to authenticated
  using (
    user_id = app_private.current_user_id()
    or app_private.has_permission('badge.approve')
  );

create policy badge_documents_owner_or_reviewer_read on public.badge_application_documents
  for select to authenticated
  using (
    owner_id = app_private.current_user_id()
    or app_private.has_permission('badge.approve')
  );

create policy user_badges_owner_or_reviewer_read on public.user_badges
  for select to authenticated
  using (
    user_id = app_private.current_user_id()
    or app_private.has_permission('badge.approve')
    or app_private.has_permission('badge.revoke')
  );

-- private 증빙 bucket. object path는 <user_id>/<application_id>/<filename>으로 고정한다.
-- 메타데이터 테이블을 직접 수정하지 않고 Storage API를 통해서만 객체를 다룬다.
create policy grade_evidence_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'grade-evidence'
    and (storage.foldername(name))[1] = app_private.current_user_id()::text
    and app_private.current_account_active()
  );

create policy grade_evidence_select_owner_or_reviewer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'grade-evidence'
    and (
      owner_id = app_private.current_user_id()::text
      or app_private.has_permission('grade.approve')
    )
  );

create policy grade_evidence_delete_owner_before_review on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'grade-evidence'
    and owner_id = app_private.current_user_id()::text
    and not exists (
      select 1 from public.grade_application_documents d
      join public.grade_applications a on a.id = d.application_id
      where d.bucket_id = storage.objects.bucket_id
        and d.object_path = storage.objects.name
        and a.status in ('submitted', 'under_review', 'approved')
    )
  );

create policy badge_evidence_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'badge-evidence'
    and (storage.foldername(name))[1] = app_private.current_user_id()::text
    and app_private.current_account_active()
  );

create policy badge_evidence_select_owner_or_reviewer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'badge-evidence'
    and (
      owner_id = app_private.current_user_id()::text
      or app_private.has_permission('badge.approve')
    )
  );

create policy badge_evidence_delete_owner_before_review on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'badge-evidence'
    and owner_id = app_private.current_user_id()::text
    and not exists (
      select 1 from public.badge_application_documents d
      join public.badge_applications a on a.id = d.application_id
      where d.bucket_id = storage.objects.bucket_id
        and d.object_path = storage.objects.name
        and a.status in ('submitted', 'under_review', 'approved')
    )
  );

-- ── account_state_events: 본인 조회 + 관리자. 삽입은 상태변경 명령 경로에서(관리자/본인탈퇴) ──
create policy account_state_select on public.account_state_events
  for select to authenticated
  using (user_id = app_private.current_user_id() or app_private.has_permission('member.manage'));

-- ── service_accounts: 관리자만 관리. 서비스 계정은 자기 행만 조회(§10.2) ──
create policy service_accounts_admin_all on public.service_accounts
  for all to authenticated
  using (app_private.has_permission('service_account.manage'))
  with check (app_private.has_permission('service_account.manage'));
create policy service_accounts_self_read on public.service_accounts
  for select to authenticated
  using (user_id = app_private.current_user_id());

create policy sa_boards_admin_all on public.service_account_boards
  for all to authenticated
  using (app_private.has_permission('service_account.manage'))
  with check (app_private.has_permission('service_account.manage'));
create policy sa_boards_self_read on public.service_account_boards
  for select to authenticated
  using (exists (
    select 1 from public.service_accounts sa
    where sa.id = service_account_id and sa.user_id = app_private.current_user_id()
  ));

-- ── boards: 공개 읽기(활성), 관리자 쓰기 ─────────────────────────────
create policy boards_select_public on public.boards
  for select to anon, authenticated
  using (is_active or app_private.has_permission('content.moderate'));
create policy boards_admin_write on public.boards
  for all to authenticated
  using (app_private.has_permission('content.moderate'))
  with check (app_private.has_permission('content.moderate'));

-- ── posts ───────────────────────────────────────────────────────────
-- SELECT: anon=공개(published)만 / member=공개+본인 / moderator·admin=전체
create policy posts_select_anon on public.posts
  for select to anon
  using (
    status = 'published'
    and exists (select 1 from public.boards b where b.id = board_id and b.is_active)
  );
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
-- INSERT: 본인 작성 + 계정 active + 서비스 계정 아님(서비스 계정은 글을 쓰지 못한다, §3.7)
create policy posts_insert_owner on public.posts
  for insert to authenticated
  with check (
    author_id = app_private.current_user_id()
    and app_private.current_account_active()
    and not app_private.is_service_account()
  );
-- UPDATE: 소유+active+서비스계정 아님(USING·CHECK 모두) 또는 moderator
create policy posts_update_owner on public.posts
  for update to authenticated
  using (
    (author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account())
    or app_private.has_permission('content.moderate')
  )
  with check (
    (author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account())
    or app_private.has_permission('content.moderate')
  );
create policy posts_delete_owner on public.posts
  for delete to authenticated
  using (
    (author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account())
    or app_private.has_permission('content.moderate')
  );

-- 원본/출력은 상위 post와 같은 가시성을 따른다. revision은 작성자와 운영자만 본다.
create policy post_contents_select_with_post on public.post_contents
  for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_contents_owner_write on public.post_contents
  for all to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = app_private.current_user_id() or app_private.has_permission('content.moderate'))
  ))
  with check (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = app_private.current_user_id() or app_private.has_permission('content.moderate'))
  ));
create policy post_revisions_owner_or_moderator on public.post_revisions
  for select to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = app_private.current_user_id() or app_private.has_permission('content.moderate'))
  ));

-- ── comments ────────────────────────────────────────────────────────
-- SELECT: 공개 콘텐츠 정책(삭제 아님) + 본인 + moderator
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
-- INSERT: (일반 회원 active) 또는 (서비스 계정: active + 허용 board + reply 권한)
--   두 경로 모두 author_id = 현재 사용자여야 하며, 서비스 계정 특수코드는 게시판에 없다(§3.7, COMM-FR-110).
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
create policy comments_update_owner on public.comments
  for update to authenticated
  using (
    (author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account())
    or app_private.has_permission('content.moderate')
  )
  with check (
    (author_id = app_private.current_user_id()
      and app_private.current_account_active()
      and not app_private.is_service_account())
    or app_private.has_permission('content.moderate')
  );

-- ── reactions / bookmarks ──────────────────────────────────────────
create policy reactions_public_read on public.reactions
  for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'));
create policy reactions_owner_insert on public.reactions
  for insert to authenticated
  with check (user_id = app_private.current_user_id()
    and app_private.current_account_active() and not app_private.is_service_account());
create policy reactions_owner_delete on public.reactions
  for delete to authenticated
  using (user_id = app_private.current_user_id());

create policy bookmarks_owner_all on public.bookmarks
  for all to authenticated
  using (user_id = app_private.current_user_id())
  with check (user_id = app_private.current_user_id()
    and app_private.current_account_active() and not app_private.is_service_account());

-- ── attachments ────────────────────────────────────────────────────
create policy attachments_owner_or_reader on public.attachments
  for select to authenticated
  using (
    owner_id = app_private.current_user_id()
    or app_private.has_permission('content.moderate')
    or (status = 'ready' and exists (
      select 1 from public.posts p where p.id = post_id and p.status = 'published'
    ))
  );
create policy attachments_owner_insert on public.attachments
  for insert to authenticated
  with check (owner_id = app_private.current_user_id()
    and app_private.current_account_active() and not app_private.is_service_account());
create policy attachments_owner_update on public.attachments
  for update to authenticated
  using (owner_id = app_private.current_user_id() and post_id is null)
  with check (owner_id = app_private.current_user_id());
create policy attachments_owner_delete on public.attachments
  for delete to authenticated
  using (owner_id = app_private.current_user_id() and post_id is null);

create policy post_attachments_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-attachments'
    and (storage.foldername(name))[1] = app_private.current_user_id()::text
    and app_private.current_account_active()
    and not app_private.is_service_account()
  );
create policy post_attachments_select_owner_or_reader on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-attachments'
    and (
      owner_id = app_private.current_user_id()::text
      or app_private.has_permission('content.moderate')
      or exists (
        select 1 from public.attachments a
        join public.posts p on p.id = a.post_id
        where a.bucket_id = storage.objects.bucket_id
          and a.object_path = storage.objects.name
          and a.status = 'ready' and p.status = 'published'
      )
    )
  );
create policy post_attachments_delete_pending_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-attachments'
    and owner_id = app_private.current_user_id()::text
    and not exists (
      select 1 from public.attachments a
      where a.bucket_id = storage.objects.bucket_id
        and a.object_path = storage.objects.name and a.post_id is not null
    )
  );

-- ── reports / moderation ───────────────────────────────────────────
create policy reports_owner_or_moderator_read on public.reports
  for select to authenticated
  using (reporter_id = app_private.current_user_id() or app_private.has_permission('content.moderate'));
create policy reports_owner_insert on public.reports
  for insert to authenticated
  with check (reporter_id = app_private.current_user_id()
    and app_private.current_account_active() and not app_private.is_service_account());
create policy reports_moderator_update on public.reports
  for update to authenticated
  using (app_private.has_permission('content.moderate'))
  with check (app_private.has_permission('content.moderate'));
create policy moderation_actions_moderator_read on public.moderation_actions
  for select to authenticated
  using (app_private.has_permission('content.moderate'));

-- ── audit_events: append-only. member 조회 없음, 관리자 읽기, authenticated append ──
create policy audit_admin_read on public.audit_events
  for select to authenticated
  using (app_private.has_permission('audit.read'));
-- append는 Gate 2의 서버 command adapter가 SECURITY DEFINER 함수로 제공한다.
-- authenticated table INSERT를 열면 브라우저 사용자가 감사/outbox를 위조할 수 있으므로 직접 정책을 두지 않는다.
-- consumed_events는 내부 worker 전용이며 authenticated 접근을 허용하지 않는다.
