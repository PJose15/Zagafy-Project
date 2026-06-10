# Roadmap

> Living document. Updated as features land.
> Phase reference: ZAGAFY_CLAUDE_CODE_BUILD_PLAN2.

This file tracks **deferred** items — features the build plan calls for at
a later phase, with enough context that we can pick them up cleanly when
their phase comes around.

## Phase 4 deferred items

These four Phase 4 tasks were deferred from the first feature pass —
each is large enough to deserve its own focused session.

### CB-11 — Per-entity import review queue (4.9)

The current `/import` flow already requires an explicit "Confirm Import"
click before any merge, so the high-level "no silent merge" requirement
from CB-11 is met. The deferred work is the granular per-item review:

- New Dexie table `importReviewQueue` with `status: 'pending' | 'accepted'
  | 'rejected' | 'merged'`.
- New `/import/review` page listing every extracted entity (character,
  conflict, location, …) with Accept / Edit / Reject / Merge actions,
  plus AI-supplied confidence scores feeding a "skip review when
  confidence > 0.85" toggle.
- Side-by-side merge UI when an existing match is detected.

### CB-07 — Rich-text manuscript editor (4.10)

Replace the current plain-text textarea with Lexical (Meta). Required
features: bold/italic/underline, block quotes, scene breaks (centered "#"
or "* * *"), em-dash auto-replace, curly quotes, live word count,
auto-save, heteronym voice tags. Migration: existing plain-text content
wrapped in paragraphs and serialized to Lexical JSON; chapter version
saved before migration. This is a dependency for MP-04.

### MP-04 — DOCX / PDF industry-format export (4.1)

Manuscript Standard Format (Shunn-style) `.docx` via the `docx` npm
package, plus `.pdf` via `@react-pdf/renderer`. Dialog with
format / scope / inclusion options, served by `/api/export/docx` and
`/api/export/pdf`. Free-tier rate cap; Author tier unlimited.

### MP-05 — Comments / margin notes (4.4)

New Dexie `comments` store with offset-based anchors + quote snapshots
for re-anchoring after edits. Margin layout on desktop, bottom-sheet on
mobile. Resolve / replies. `Cmd/Ctrl+Shift+C` shortcut. Orphaned-comment
recovery tray.

## Phase 7 (launch readiness)

### Nonce-based CSP

`next.config.ts` currently allows `'unsafe-inline'` for scripts because
Next.js 15 emits inline streaming/hydration scripts. The migration path
is per-request nonces injected via middleware and propagated to Next's
emitted scripts.

- Reference: <https://nextjs.org/docs/app/guides/content-security-policy>
- Trade-offs and current mitigations: `docs/SECURITY.md` §3.1.

### LanguageTool grammar layer (MP-07 v2)

Phase 4.5 ships browser-native spellcheck only — a `spellCheck` attribute
on textareas plus a settings toggle to silence it. v2 should add a
proper grammar layer.

- Library: [`@languagetool-org/languagetool-react`](https://github.com/LanguageTool-org/languagetool-react)
  or a self-hosted LanguageTool server.
- API: `POST /api/grammar/check` accepting `{ text, language }`,
  returning `{ matches: [{ offset, length, message, replacements }] }`.
- UI: render decorations alongside the existing prose-analysis layer
  (lib/prose-analysis.ts). Reuse the underline/sepia treatment so the
  two layers compose cleanly.
- Toggle the layer via the same `useSpellcheckPreference` hook that
  drives v1.
- Privacy: prefer self-hosted to keep manuscript content off third-party
  servers. If hosted is used, document it in `docs/SECURITY.md` and add
  an opt-out for users on free tier.

### Onboarding tour (MP-16)

Five-step product tour after Genesis. Skippable. Re-trigger from
settings. Lightweight library (`@reactour/tour` or similar).

### Multi-language AI prompts (MP-13)

Localize system prompts (English, Spanish priority, French, Portuguese,
German, Italian). Detect manuscript language with a heuristic + user
override. Inject locale into system prompt directives.

### AI eval pipeline (MP-14)

50 hand-curated test cases per major endpoint, auto-graded by a stronger
model (Claude Opus 4.7) against a rubric. CI runs nightly and flags
quality regressions.

## Phase 5 (SaaS infrastructure)

Auth (Clerk), Cloud DB (Neon + Drizzle), sync engine, billing (Stripe),
observability (Sentry + PostHog + Vercel Analytics), email (Resend +
React Email), feature flags (PostHog), backups, auth gates.

Architecture decisions Pedro must confirm before this phase begins are
listed in build plan §2.

## Phase 6 (CI/quality maturity) — COMPLETE

All tasks landed on `phase-6-quality`:

- **6.1 SG-03** — `npm audit --audit-level=moderate` in CI
- **6.2 SG-04** — `eslint-plugin-security` + CodeQL workflow (weekly + on-PR)
- **6.3 SG-05** — 20-input adversarial prompt-injection test suite
- **6.4 SG-08** — runtime deps pinned to exact versions + Dependabot
- **6.5 ME-01** — Playwright E2E tests (7 critical flows)
- **6.6 ME-02** — visual regression with `toHaveScreenshot()` on 5 key pages
- **6.7 ME-03** — k6 load tests (dashboard, chat, ingest)
- **6.8 ME-04** — staging environment documented (`docs/STAGING.md`)
