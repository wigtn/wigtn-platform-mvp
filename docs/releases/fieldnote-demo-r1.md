# FIELDNOTE Demo Release R1 — Design Pipeline Baseline

## Release label

`FIELDNOTE Demo Release R1 — Design Pipeline Baseline`

## Status

Draft. PM approval pending.

## Purpose

R1 establishes FIELDNOTE as the PM-controlled client demo lane. It should prove that the demo can be reviewed, smoke-tested, deployed, and approved without depending on internal module-maturity volatility from `demo-web-ten-neon`.

## Scope

Included:

- Client-demo release lane documentation.
- Focused release-smoke CI replacing noisy all-purpose quality gates.
- Design pipeline baseline for future UI polish.
- PM evaluator checklist and release gate.

Not included:

- Wholesale migration to the latest web-agency scaffold.
- Default live Supabase/OpenAI release dependency.
- Real customer data.
- Production authentication or billing behavior.

## Demo lanes

| Lane                              | Owner                   | Purpose                                                      | Gate                                         |
| --------------------------------- | ----------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| FIELDNOTE client demo             | PM                      | Evaluator/client storytelling                                | release-smoke + screenshot QA + PM checklist |
| `demo-web-ten-neon` internal demo | Engineering             | Module maturity, integration instability, API/rule hardening | generated-project/database E2E               |
| Optional live backend/AI          | Engineering + PM opt-in | Show real queue/worker behavior when needed                  | manual workflow + explicit secrets           |

## Candidate branch and tag

- Branch: `release/fieldnote-r1-design-pipeline`
- Tag after approval: `fieldnote-demo-r1`

## Release URL

TBD.

Checklist:

- [ ] Vercel preview URL recorded.
- [ ] Public vs SSO-protected access intentionally selected.
- [ ] If protected, approved viewers are documented.
- [ ] `curl -I -L <release-url>` confirms expected status.

## Verification evidence

Required before PM approval:

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] release-smoke Playwright path
- [ ] desktop screenshot review
- [ ] mobile screenshot review
- [ ] PM evaluator checklist completed

## PM approval

- Approver: TBD
- Date: TBD
- Decision: Pending
- Notes: TBD

## Known demo boundaries

- Synthetic/de-identified data only.
- Demo role switching is not production auth.
- Admin actions mutate local/demo state only unless explicitly marked otherwise.
- AI may use deterministic fallback unless live AI is selected and verified.
- Company import/crawler behavior is dry-run unless separately approved.

## Rollback

- Rollback commit/tag: TBD
- Previous approved demo URL: TBD
- Rollback owner: TBD

## Open decisions

1. Should R1 be public or Vercel SSO-protected for internal review first?
2. What stable alias/domain should represent the FIELDNOTE client demo?
3. Should R1 use deterministic AI fallback or an opt-in live AI worker path?
4. Who is the PM approver for `fieldnote-demo-r1`?
5. Which three screens should receive first visual polish after the token baseline?
