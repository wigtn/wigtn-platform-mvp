# FIELDNOTE R1 Evaluator Checklist

Use this checklist before promoting or sharing `FIELDNOTE Demo Release R1`.

## How to use

1. Open the approved release URL.
2. Reset demo state if needed.
3. Walk each journey below.
4. Mark pass/fail and record blockers.
5. Approve only if critical journeys are clear and client-shareable.

## Journey 1 — Guest company discovery

- Start URL: `/`
- Role: 비회원
- Click path:
  1. Choose guest browsing.
  2. Open company search.
  3. Search for a seeded company.
  4. Open company detail.
- Expected visible result:
  - Company profile is readable.
  - Score/review context is understandable.
  - Locked or member-only actions explain what to do next.
- Demo boundary note:
  - Company/review data is synthetic or de-identified.
- Result:
  - [ ] Pass
  - [ ] Fail
- Notes:

## Journey 2 — Sales user anonymous review

- Start URL: `/companies`
- Role: 일반 영업인
- Click path:
  1. Log in as sales demo account.
  2. Open a company detail page.
  3. Start anonymous review.
  4. Submit a review with a short summary and detailed experience.
  5. Return to company statistics.
- Expected visible result:
  - The selected company remains selected in the review form.
  - Review appears after submit.
  - Company score/statistics visibly update or show a credible receipt.
- Demo boundary note:
  - Submitted review affects demo/local state only.
- Result:
  - [ ] Pass
  - [ ] Fail
- Notes:

## Journey 3 — Sales Q&A answer state

- Start URL: `/questions/new`
- Role: 일반 영업인
- Click path:
  1. Enter a sales situation question.
  2. Submit the question.
  3. Wait for AI/fallback answer state.
  4. Open the submitted question detail.
- Expected visible result:
  - Processing state is understandable.
  - Answer includes next actions and caution/missing-context style guidance.
  - If fallback is used, the demo does not look broken.
- Demo boundary note:
  - R1 may use deterministic fallback unless live AI is explicitly selected and verified.
- Result:
  - [ ] Pass
  - [ ] Fail
- Notes:

## Journey 4 — Verified user trust differentiation

- Start URL: `/account`
- Role: 인증 영업인
- Click path:
  1. Log in as verified sales demo account.
  2. Review account/profile state.
  3. Open community or company content that distinguishes trusted/verified contributors.
- Expected visible result:
  - Current verified role is obvious.
  - Trust badge or verification status is visible.
  - Difference from normal sales user is understandable.
- Demo boundary note:
  - Verification state is pre-seeded demo state.
- Result:
  - [ ] Pass
  - [ ] Fail
- Notes:

## Journey 5 — Admin safe operations

- Start URL: `/admin`
- Role: 운영 관리자
- Click path:
  1. Log in as admin demo account.
  2. Open review moderation.
  3. Blind a review through confirmation dialog.
  4. Confirm restore/recovery affordance is visible.
  5. Open company or content operations if included in the release script.
- Expected visible result:
  - Admin role is clear.
  - Destructive actions require confirmation.
  - After-state is credible and reversible.
- Demo boundary note:
  - Admin changes are harmless demo actions unless separately approved.
- Result:
  - [ ] Pass
  - [ ] Fail
- Notes:

## Final PM decision

- Release URL:
- Commit/tag:
- Approver:
- Date:
- Decision:
  - [ ] Approved for client sharing
  - [ ] Approved for internal review only
  - [ ] Blocked
- Required fixes before sharing:
