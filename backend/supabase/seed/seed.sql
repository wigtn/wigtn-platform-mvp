-- seed.sql — 로컬/CI 전용 결정적 fixture (실제 고객 데이터 금지, §3.9)
-- Gate 1 RLS/IDOR 테스트의 기반. 고정 UUID로 결정적.
--
-- fixture 사용자(§10.3 요구): anon(사용자 없음) · member · member2(IDOR 상대) ·
--                            moderator · admin · service-account · suspended
set search_path = public, extensions;

-- 로컬/CI fixture 전용. 원격 migration은 두 역할을 NOLOGIN으로 만들며,
-- production provisioning은 Secret Manager의 회전된 자격증명을 별도로 설정한다.
alter role app_authenticator login password 'app_local_dev_pw';
alter role outbox_worker login password 'outbox_local_dev_pw';

-- ── auth.users (로컬 전용 직접 삽입) ────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'member@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'member2@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'moderator@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ai-bot@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'suspended@demo.test',
   extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now());

-- GoTrue(v2.x)는 토큰 컬럼을 non-null string으로 스캔한다. 직접 insert가 이들을 NULL로 남기면
-- password grant가 "Database error querying schema"(NULL scan)로 실패한다 → 봇 실결선(게이트 A) 차단.
-- 결정적 로컬 fixture이므로 빈 문자열로 채워 signInWithPassword 경로를 연다(PROD-535).
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where instance_id = '00000000-0000-0000-0000-000000000000';

-- ── profiles (account_status) ───────────────────────────────────────
insert into public.profiles (user_id, handle, display_name, account_status) values
  ('11111111-1111-1111-1111-111111111111', 'member',    '일반회원',   'active'),
  ('22222222-2222-2222-2222-222222222222', 'member2',   '다른회원',   'active'),
  ('33333333-3333-3333-3333-333333333333', 'moderator', '모더레이터', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'admin',     '관리자',     'active'),
  ('55555555-5555-5555-5555-555555555555', 'aibot',     'AI 답변봇',  'active'),
  ('66666666-6666-6666-6666-666666666666', 'suspended', '정지회원',   'suspended')
on conflict (user_id) do update set
  handle = excluded.handle,
  display_name = excluded.display_name,
  account_status = excluded.account_status;

-- Gate 2 로컬 fixture: 실제 환경의 bucket 생성은 notification-file 소유 provisioning이 수행한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'grade-evidence', 'grade-evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-attachments', 'post-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'badge-evidence', 'badge-evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-imports', 'company-imports', false, 10485760,
  array['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.consent_documents
  (id, kind, version, title, content_url, is_required, published_at)
values
  ('71000000-0000-0000-0000-000000000001', 'terms', 1, '서비스 이용약관', '/legal/terms/v1', true, '2026-07-01T00:00:00Z'),
  ('71000000-0000-0000-0000-000000000002', 'privacy', 1, '개인정보 처리방침', '/legal/privacy/v1', true, '2026-07-01T00:00:00Z');

insert into public.user_consents (user_id, document_id, evidence)
select p.user_id, d.id, '{"source":"seed"}'::jsonb
from public.profiles p cross join public.consent_documents d
where p.account_status in ('active', 'suspended')
on conflict do nothing;

insert into public.membership_grades
  (id, key, version, title, description, application_schema, required_evidence, approval_mode)
values
  ('72000000-0000-0000-0000-000000000001', 'verified-l2', 1, 'L2 실적 인증',
   '실적 증빙을 운영자가 검토하는 인증 등급',
   '{"type":"object","required":["company","achievement"],"properties":{"company":{"type":"string"},"achievement":{"type":"string"}}}'::jsonb,
   '[{"kind":"achievement-proof","required":true,"accept":["image/jpeg","image/png","application/pdf"],"maxBytes":10485760}]'::jsonb,
   'manual');

insert into public.membership_badges
  (id, key, version, title, description, application_schema, required_evidence, approval_mode)
values
  ('73000000-0000-0000-0000-000000000001', 'top-contributor', 1, '우수 기여자',
   '커뮤니티 기여 내역을 운영자가 검토하는 뱃지',
   '{"type":"object","required":["contribution"],"properties":{"contribution":{"type":"string"}}}'::jsonb,
   '[]'::jsonb,
   'manual');

insert into public.badge_applications
  (id, user_id, badge_id, badge_config_version, status, form_data,
   submit_idempotency_key, submitted_at)
values
  ('73100000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '73000000-0000-0000-0000-000000000001', 1, 'submitted',
   '{"contribution":"월간 답변 20건"}'::jsonb, 'seed-badge-submit-member2', now());

-- ── 관리자 권한 (§5.1) ──────────────────────────────────────────────
insert into public.system_roles (id, key, title) values
  ('a0000000-0000-0000-0000-000000000001', 'member',    '일반'),
  ('a0000000-0000-0000-0000-000000000002', 'moderator', '모더레이터'),
  ('a0000000-0000-0000-0000-000000000003', 'admin',     '관리자');

insert into public.permissions (key, description) values
  ('member.manage',           '회원 관리'),
  ('role.manage',             '역할 부여/회수'),
  ('service_account.manage',  '서비스 계정 관리'),
  ('content.moderate',        '콘텐츠 모더레이션'),
  ('audit.read',              '감사로그 열람');
insert into public.permissions (key, description) values
  ('grade.approve',           '회원 등급 신청 승인');
insert into public.permissions (key, description) values
  ('member.read',             '회원 검색/상세 조회'),
  ('member.suspend',          '회원 즉시 정지'),
  ('badge.approve',           '뱃지 신청 승인'),
  ('badge.revoke',            '부여된 뱃지 회수');

-- moderator → content.moderate / admin → 전권
insert into public.role_permissions (role_id, permission_key) values
  ('a0000000-0000-0000-0000-000000000002', 'content.moderate'),
  ('a0000000-0000-0000-0000-000000000003', 'member.manage'),
  ('a0000000-0000-0000-0000-000000000003', 'role.manage'),
  ('a0000000-0000-0000-0000-000000000003', 'service_account.manage'),
  ('a0000000-0000-0000-0000-000000000003', 'content.moderate'),
  ('a0000000-0000-0000-0000-000000000003', 'audit.read');
insert into public.role_permissions (role_id, permission_key) values
  ('a0000000-0000-0000-0000-000000000003', 'grade.approve');
insert into public.role_permissions (role_id, permission_key) values
  ('a0000000-0000-0000-0000-000000000003', 'member.read'),
  ('a0000000-0000-0000-0000-000000000003', 'member.suspend'),
  ('a0000000-0000-0000-0000-000000000003', 'badge.approve'),
  ('a0000000-0000-0000-0000-000000000003', 'badge.revoke');

insert into public.role_permissions (role_id, permission_key) values
  ('a0000000-0000-0000-0000-000000000003', 'company.manage'),
  ('a0000000-0000-0000-0000-000000000003', 'company.import'),
  ('a0000000-0000-0000-0000-000000000003', 'review.moderate'),
  ('a0000000-0000-0000-0000-000000000003', 'placement.manage');

insert into public.user_roles (user_id, role_id) values
  ('33333333-3333-3333-3333-333333333333', 'a0000000-0000-0000-0000-000000000002'),
  ('44444444-4444-4444-4444-444444444444', 'a0000000-0000-0000-0000-000000000003');

insert into public.companies
  (id, slug, name, normalized_name, aliases, industry, sales_type, website, source)
values
  ('c0000000-0000-0000-0000-000000000001', 'salesforce', '세일즈포스', '세일즈포스', array['Salesforce'], 'IT/SaaS', 'B2B', 'https://www.salesforce.com/kr/', 'manual'),
  ('c0000000-0000-0000-0000-000000000002', 'toss', '토스', '토스', array['비바리퍼블리카'], '핀테크', 'B2C/B2B', 'https://toss.im/', 'manual'),
  ('c0000000-0000-0000-0000-000000000003', 'wantedlab', '원티드랩', '원티드랩', array['원티드'], 'HR Tech', 'B2B', 'https://www.wanted.co.kr/', 'manual');

-- ── 게시판/콘텐츠 ───────────────────────────────────────────────────
insert into public.boards (id, slug, title, is_active, ai_reply_enabled) values
  ('b0000000-0000-0000-0000-000000000001', 'notice',  '공지사항',  true, false),
  ('b0000000-0000-0000-0000-000000000002', 'qna',     'Q&A',       true, true);

update public.boards set
  description = case slug when 'notice' then '운영 공지와 업데이트' else '질문과 답변을 나누는 게시판' end,
  position = case slug when 'notice' then 10 else 20 end,
  config = jsonb_build_object('listPageSize', 20, 'attachmentsEnabled', slug = 'qna'),
  config_version = 1;

insert into public.posts (id, board_id, author_id, title, body, status) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '영업 팁 질문', '좋은 영업 방법이 궁금합니다', 'published'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', '초안 글',      '아직 작성 중',              'draft');

insert into public.post_contents (post_id, source, sanitized_html, format_version) values
  ('c0000000-0000-0000-0000-000000000001',
   '{"version":1,"blocks":[{"type":"paragraph","text":"좋은 영업 방법이 궁금합니다"}]}'::jsonb,
   '<p>좋은 영업 방법이 궁금합니다</p>', 1),
  ('c0000000-0000-0000-0000-000000000002',
   '{"version":1,"blocks":[{"type":"paragraph","text":"아직 작성 중"}]}'::jsonb,
   '<p>아직 작성 중</p>', 1);

-- ── 서비스 계정 (§3.7): Q&A 게시판에만 답글 허용 ───────────────────
insert into public.service_accounts (id, user_id, label, status, allowed_reply_create) values
  ('50000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
   'AI 답변봇', 'active', true);
insert into public.service_account_boards (service_account_id, board_id) values
  ('50000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
