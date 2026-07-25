# FIELDNOTE Design Pipeline

## Purpose

FIELDNOTE is the client-facing demo lane for the web-agency platform work. Design changes optimize evaluator comprehension, PM-approved release quality, and honest demo storytelling. The internal `demo-web-ten-neon` lane can absorb scaffold/module volatility; FIELDNOTE should remain stable enough to share with evaluators.

## Operating principles

- FIELDNOTE is the only client demo unless PM approves another public lane.
- Client-demo polish wins over latest-boilerplate completeness.
- Screens should explain the next evaluator action without internal module vocabulary.
- Synthetic/demo-only boundaries must be visible, but not alarming.
- Design changes ship through a release checklist with screenshot evidence.

## Screen inventory

| Area                                          | Primary evaluator question                           | Release QA focus                                                   |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Home                                          | “What is this product and where do I start?”         | Clear value proposition, visible role/demo entry, mobile header    |
| Company search                                | “Can I find a company quickly?”                      | Search state, empty state, result card hierarchy                   |
| Company detail                                | “Can I trust the company signal?”                    | Score explanation, review CTA, locked/trusted affordances          |
| Review write                                  | “Can a sales user submit useful anonymous feedback?” | Selected company context, validation, post-submit receipt          |
| Q&A ask                                       | “Can I get actionable sales advice?”                 | Question form, AI/fallback status, answer sections                 |
| Community feed/detail                         | “Is there reusable field knowledge?”                 | Feed scanability, trusted badge distinction, blocked content state |
| Account/profile/badge                         | “What changes when I am verified?”                   | Role clarity, profile save state, verification request receipt     |
| Admin review/member/company/content/placement | “Can operators moderate safely?”                     | Harmless demo actions, confirmation dialogs, visible after-state   |

## Token rules

Use a semantic FIELDNOTE token layer before broad visual rewrites. Existing brand tokens remain the source of truth; aliases make future migrations safer.

Recommended alias families:

```css
--fn-bg-page
--fn-bg-surface
--fn-bg-muted
--fn-fg-title
--fn-fg-body
--fn-fg-label
--fn-fg-meta
--fn-accent
--fn-accent-hover
--fn-accent-soft
--fn-border
--fn-border-strong
```

Rules:

- Add aliases first, then migrate high-traffic components gradually.
- Do not change brand colors in the same PR that introduces aliases.
- Prefer semantic names over page-specific names.
- Token changes require desktop and mobile screenshot comparison.

## Typography rules

Use consistent levels across screens:

| Level         | Use                                     |
| ------------- | --------------------------------------- |
| Page title    | One per major route or panel            |
| Section title | Major blocks within a page              |
| Card title    | Company/review/question/community cards |
| Body          | Main explanatory copy                   |
| Meta          | dates, counts, role hints, helper text  |

Rules:

- Avoid one-off font sizes in feature components when a shared class can express the level.
- Preserve Korean line-height readability on mobile.
- Keep metadata visually secondary but accessible.

## Spacing rules

- Prefer reusable stack/card spacing classes over local margin chains.
- Keep page-level vertical rhythm consistent between home, company, Q&A, and admin journeys.
- Mobile QA must verify no horizontal overflow and no hidden primary CTA.

Candidate utility classes:

```css
.fn-stack-page
.fn-card-padding
.fn-page-title
.fn-section-title
.fn-card-title
.fn-body
.fn-meta
```

## Interaction states

Every interactive element in the evaluator path should have visible states for:

- default
- hover or active
- focus-visible
- selected/current
- disabled/locked
- destructive confirmation
- post-action receipt

Priority elements:

- Role switcher and current-role bar
- Demo reset action
- Search submit/reset
- Company/review/question cards
- Admin blind/restore controls
- Locked answer / verification CTA

## Demo boundaries

FIELDNOTE demo releases must disclose these boundaries in product copy or release notes:

- Data is synthetic or de-identified.
- Role switching is a demo adapter, not production authentication.
- Admin actions are harmless demo state changes unless explicitly marked otherwise.
- AI answer paths may use deterministic fallback unless live AI is selected for the release.
- Company import/crawler experiences are dry-run unless PM and engineering approve a live mode.

## Screenshot QA checklist

Capture and compare at least these screens for each release candidate:

Desktop:

- `/`
- `/companies`
- company detail for a seeded company
- `/questions/new`
- `/community`
- `/account` after verified/sales role switch
- `/admin` after admin role switch

Mobile:

- `/`
- `/companies`
- `/community`
- role/account menu state

Review questions:

- Is the current role obvious without reading docs?
- Is the next evaluator action visible above the fold?
- Are demo-only notices understandable and calm?
- Are cards scannable at mobile width?
- Do admin actions show confirmation and credible after-state?

## Release application sequence

1. Freeze release branch and baseline screenshots.
2. Confirm release-smoke CI is green.
3. Apply token aliases only.
4. Polish role/demo state language.
5. Re-run screenshot QA.
6. PM walks evaluator checklist.
7. Record URL, commit, known limitations, approval, and rollback target.
