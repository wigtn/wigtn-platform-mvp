# Verification record

Verified locally on 2026-07-21 with Node 25 runtime, Supabase CLI 2.98.2, Docker, and PostgreSQL 17 local image.

## Executed gates

| Gate                               | Result                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| clean `supabase db reset`          | pass; all core and project migrations plus seed applied from empty DB             |
| `supabase db lint --level warning` | pass; no schema errors                                                            |
| TypeScript                         | pass                                                                              |
| unit/contract tests                | 75 passed in 16 files                                                             |
| DB/RLS/integration tests           | 85 passed; 8 conditional tests skipped                                            |
| existing frontend unit/build       | 2 tests passed; Next.js production build passed                                   |
| desktop/mobile browser E2E         | 14 passed on an isolated port                                                     |
| dependency audit                   | 0 vulnerabilities at moderate-or-higher gate                                      |
| AI worker batch                    | 5 claimed, 5 processed, 0 failed/dead                                             |
| AI answer full path                | event scheduled, due answer posted once by service account, pending row committed |

The eight conditional tests are five second-demo reuse fixtures requiring `DEMO_B_DATABASE_URL`, and three Supavisor transaction-mode tests requiring `POOLER_DATABASE_URL`. The same core pooler suite was already verified in its source repository; CI runs all other gates on every PR.

## Security evidence

- Explicit grants and RLS exist for every new exposed table.
- Private author/import-row tables have privileges revoked from anon/authenticated/app roles.
- Review public payload has no author ID.
- Member/company uniqueness and idempotency are database constraints, not UI checks.
- Admin commands verify DB permission and step-up, write audit events, and use receipts.
- Import uploads are private and require select/insert/update/delete policies for safe upsert behavior.
- Outbox and pending-answer claim functions are executable only by the dedicated worker role.
- Database migrations create the application and worker roles as `NOLOGIN`; only the local/CI seed enables fixture passwords. Hosted credentials must be provisioned from secret storage.
- The OpenAI key is environment-only and never enters frontend code or logs.

## Production gates still requiring deployment environment

1. Create the hosted Supabase project, run migrations, and provision login credentials for the application and worker roles from the deployment secret manager.
2. Configure SMTP, allowed redirects, Storage limits, network restrictions, backups/PITR, alerting, and secret manager.
3. Provide hosted `POOLER_DATABASE_URL` and run the three transaction-mode tests.
4. Run an OpenAI live smoke/eval with the client's key and cost budget; normal CI intentionally uses the fake provider.
5. Load-test feed/company reads and outbox concurrency against expected traffic.
6. Wire the redesigned frontend and run browser E2E through auth → post → AI reply, review, badge evidence, and admin moderation.
