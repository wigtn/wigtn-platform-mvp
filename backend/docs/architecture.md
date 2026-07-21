# Backend architecture and core reuse

## Boundary

This delivery adds `.github/workflows/ci.yml`, `backend/**`, and one root `tsconfig.json` exclusion that prevents the frontend compiler from traversing the independent backend package. Existing `app/`, `components/`, styles, and browser state files are untouched so the parallel redesign can merge independently.

```text
browser redesign
  └─ Supabase Auth + Data API/RPC
       ├─ core identity: profiles, consent, grades, badges, RBAC
       ├─ core community: boards, posts, comments, reactions, bookmarks, reports
       ├─ project domain: companies, anonymous reviews, stats, import, placements
       └─ private operations: audit, receipts, outbox, AI pending answers
                              └─ worker → OpenAI Responses API → bot comment RPC
```

The browser receives only a publishable Supabase key. `OUTBOX_DATABASE_URL`, bot credentials, service-role keys, and `OPENAI_API_KEY` stay in server-side secret storage.
Database migrations leave the direct application and outbox roles as `NOLOGIN`; the local seed enables fixture credentials only for repeatable tests, while hosted credentials are provisioned by deployment automation.

## Reused core modules

| Core snapshot       | Used here for                                                                       | Project customization                                                           |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `auth-membership`   | email confirmation, consent, account state, grade evidence                          | sales-person grades and badge catalog remain seed/config data                   |
| `content-engine`    | structured posts, comments/replies, likes, bookmarks, reports, attachment lifecycle | Q&A board enables AI replies                                                    |
| `backoffice-frame`  | permissions, step-up, audit, idempotent receipts, outbox leases                     | company import, review moderation, and placements use the same command boundary |
| `ai-pipeline-sdk`   | delay/cancel rules, moderation, prompt packs, guardrails, provider port             | OpenAI Responses adapter and sales mentor rule                                  |
| `notification-file` | private upload conventions                                                          | company import bucket and policies                                              |
| `api-contracts`     | environment and API contract conventions                                            | project RPC contract is documented separately                                   |

The files under `core/` are a project snapshot, not a new canonical source. They were security-updated for current test dependencies, while project logic stays outside them.

## Project-specific decisions

- `company_reviews` contains no user identifier. `app_private.company_review_authors` owns the review-to-user mapping, is revoked from browser roles, and enforces one review per member/company.
- Review averages are rebuilt transactionally after insert/update/delete, so list and summary screens do not compute conflicting numbers.
- Import runs are hash- and idempotency-keyed, keep row validation evidence privately, cap input at 5,000 rows/10 MiB, and support dry-run before commit.
- Content placements use version-based optimistic locking. A stale admin screen cannot silently overwrite another operator's placement.
- AI work uses transactional outbox claims and a separate leased pending-answer table. Human replies cancel pending AI work; failed processing is reclaimed; comment idempotency prevents duplicate bot replies.
- OpenAI is behind `ChatProvider`. Local/CI uses a deterministic mock without a key; production uses `/v1/responses`, server-only credentials, timeouts, bounded retry, moderation, and request correlation IDs.

## Flywheel promotion candidates

Promote only after at least two delivered projects prove the abstraction:

1. Anonymous review identity vault plus aggregate refresh.
2. Spreadsheet import pipeline: private source upload, parser, dry-run, row errors, hash/idempotency, confirm.
3. Versioned/scheduled placement manager.
4. Responses API provider adapter with request correlation and guardrail telemetry.

Keep sales-specific score dimensions, prompt pack, company fields, seed data, and homepage slot keys in this project. They should not enter the core until a second project demonstrates the same contract.
