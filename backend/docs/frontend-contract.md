# Frontend integration contract

The current redesigned frontend can connect without moving backend files. Use Supabase's browser client with only the project URL and publishable key.

## Read models

| Screen                 | Source                                                | Rule                                               |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| company search/list    | `companies`                                           | anon/authenticated can read active rows            |
| company detail summary | `company_review_stats`                                | aggregate only, no reviewer identity               |
| company review list    | `company_reviews`                                     | public only sees `published`                       |
| community feeds        | `boards`, `posts`, `post_contents`, `comments`        | existing core RLS controls draft/hidden visibility |
| profile/activity       | `profiles`, posts/comments filtered by signed-in user | authenticated RLS                                  |
| homepage curation      | `content_placements`                                  | only active published/scheduled windows are public |

## Write commands

- Signup/sign-in: Supabase Auth email/password. Email confirmation is required.
- Onboarding: `complete_member_onboarding`.
- Post/comment/reaction/bookmark/report/attachment: existing core public RPC functions.
- Anonymous company review: `create_company_review(company_id, title, body, employment_status, score_dimensions, idempotency_key, trace_id)`.
- Grade/badge application: existing membership RPC functions and private evidence buckets.

All command retries must reuse the same idempotency key. Generate a new trace ID per user action and keep it across client→RPC→support logs.

`score_dimensions` requires four 1–5 values:

```json
{
  "compensation": 4,
  "growth": 5,
  "culture": 3,
  "leadership": 4
}
```

## Admin server adapter

Do not call `app_private` from browser code. A trusted admin server connection authenticates the operator, injects verified JWT claims, then calls:

- `moderate_company_review`
- `import_companies`
- `upsert_content_placement`
- `publish_content_placement`
- existing member, grade, badge, role, content-moderation, and audit commands

High-risk commands require a recent TOTP factor and active session in the database, not just a disabled/enabled button in the UI.

## Excel import

Upload `.csv` or `.xlsx` to the private `company-imports` bucket under `<user-id>/...`. The server runs `parseCompanyImport`, displays the dry-run row errors, and only then calls `import_companies(..., dry_run=false, ...)`. Legacy `.xls` is intentionally rejected; save it as `.xlsx` to avoid an unmaintained parser.

## Login-free bid demo

The redesign should call `ensureDemoExperience(supabase)` once from a dynamically rendered client boundary. If no permanent user session exists, it performs `signInAnonymously()` and then calls `bootstrap_demo_experience`. There is no login screen or shared demo password.

Use `executeDemoAction(supabase, action, payload, idempotencyKey)` for demo writes. The supported action keys are returned by bootstrap and cover community posts/comments/reactions/bookmarks, company reviews, grade/badge applications, delayed AI answers, member review, company import, moderation, and placement publishing. Use `get_demo_experience` to restore state after refresh and `reset_demo_experience` for the “처음부터 다시 체험” control.

Anonymous demo writes are real database writes to a private per-visitor ledger, not browser mocks. They intentionally do not call production commands or alter shared aggregates. When bootstrap returns `mode: live` for a permanent member, the frontend must use the real commands listed above instead.

Hosted deployment must enable anonymous sign-ins, use dynamic rendering for session-sensitive pages, add Turnstile/CAPTCHA at the edge, retain the backend's per-user rate limit, and schedule deletion of expired anonymous Auth users. Only the Supabase publishable key belongs in the browser; service-role, direct DB, bot, and OpenAI credentials remain server-only.
