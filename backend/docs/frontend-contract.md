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

## Demo integration note

The old frontend still uses local mock state until the redesign branch binds these reads/RPCs. This backend does not alter that frontend. For an evaluator build, the frontend may sign in a seeded demo member/admin behind a non-production demo gate, but service-role and OpenAI keys must never be shipped to the browser.
